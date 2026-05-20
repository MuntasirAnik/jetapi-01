import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { Subscription } from './subscription.entity';
import { Payment } from './payment.entity';
import { User } from '../users/user.entity';
import { PLANS, PlanId } from './plans.config';

@Injectable()
export class SubscriptionsService {
  private stripe: any;
  private readonly logger = new Logger(SubscriptionsService.name);

  /** Safely parse a Stripe timestamp (Unix seconds number, ms number, or ISO string) into a Date */
  private parseStripeDate(val: any): Date {
    if (!val) return new Date();
    if (typeof val === 'string') return new Date(val);
    // If it's a small number, it's Unix seconds; otherwise it's milliseconds
    if (typeof val === 'number') {
      return val < 1e12 ? new Date(val * 1000) : new Date(val);
    }
    return new Date();
  }

  constructor(
    @InjectRepository(Subscription)
    private subscriptionRepo: Repository<Subscription>,
    @InjectRepository(User)
    private userRepo: Repository<User>,
    @InjectRepository(Payment)
    private paymentRepo: Repository<Payment>,
    private configService: ConfigService,
  ) {
    const stripeKey = this.configService.get<string>('STRIPE_SECRET_KEY');
    if (stripeKey) {
      this.stripe = new Stripe(stripeKey, { apiVersion: '2025-03-31.basil' as any });
    }
  }

  // ── Plan info ──

  getPlans() {
    return Object.values(PLANS).map(plan => ({
      id: plan.id,
      name: plan.name,
      description: plan.description,
      priceMonthly: plan.priceMonthly,
      priceYearly: plan.priceYearly,
      limits: plan.limits,
      features: plan.features,
      popular: plan.popular || false,
    }));
  }

  async getCurrentSubscription(userId: string) {
    const sub = await this.subscriptionRepo.findOne({
      where: { userId },
      order: { createdAt: 'DESC' },
    });

    const planId = (sub?.plan as PlanId) || 'FREE';
    const plan = PLANS[planId] || PLANS.FREE;

    return {
      subscription: sub,
      plan: {
        id: plan.id,
        name: plan.name,
        limits: plan.limits,
      },
      status: sub?.status || 'active',
      currentPeriodStart: sub?.currentPeriodStart,
      currentPeriodEnd: sub?.currentPeriodEnd,
      paymentDueDate: sub?.paymentDueDate,
      billingInterval: sub?.billingInterval || 'monthly',
    };
  }

  // ── User Payment History ──

  async getUserPayments(userId: string, year?: number, month?: number) {
    const query = this.paymentRepo.createQueryBuilder('payment')
      .where('payment.userId = :userId', { userId })
      .orderBy('payment.createdAt', 'DESC');

    if (year && month) {
      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 0, 23, 59, 59);
      query.andWhere('payment.createdAt >= :start AND payment.createdAt <= :end', {
        start: startDate,
        end: endDate,
      });
    }

    const payments = await query.getMany();

    const total = payments.reduce((sum, p) => {
      const amount = parseFloat(p.amount.replace('$', '')) || 0;
      return sum + amount;
    }, 0);

    return {
      payments,
      count: payments.length,
      total,
    };
  }

  // ── Stripe Checkout ──

  async createCheckoutSession(userId: string, planId: PlanId, interval: 'monthly' | 'yearly' = 'monthly', origin?: string) {
    const plan = PLANS[planId];
    if (!plan || planId === 'FREE') {
      throw new BadRequestException('Invalid plan selected');
    }

    const frontendUrl = origin || this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3000';

    // When Stripe is not configured, create a pending subscription (payment required within 10 days)
    if (!this.stripe) {
      this.logger.warn(`Stripe not configured — creating pending subscription for ${planId} plan for user ${userId}`);
      const paymentDueDate = new Date(Date.now() + 10 * 86400000); // 10 days grace period
      let sub = await this.subscriptionRepo.findOne({ where: { userId } });
      if (sub) {
        sub.plan = planId;
        sub.status = 'payment_pending';
        sub.billingInterval = interval;
        sub.paymentDueDate = paymentDueDate;
      } else {
        sub = this.subscriptionRepo.create({
          userId,
          plan: planId,
          status: 'payment_pending',
          billingInterval: interval,
          paymentDueDate,
        });
      }
      await this.subscriptionRepo.save(sub);
      return { url: `${frontendUrl}/payment` };
    }

    const priceId = interval === 'yearly' ? plan.stripePriceIdYearly : plan.stripePriceIdMonthly;
    if (!priceId) {
      throw new BadRequestException('Stripe price not configured for this plan');
    }

    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new BadRequestException('User not found');

    // Find or create Stripe customer
    let stripeCustomerId = (await this.subscriptionRepo.findOne({ where: { userId } }))?.stripeCustomerId;

    if (!stripeCustomerId) {
      const customer = await this.stripe.customers.create({
        email: user.email,
        name: user.name || undefined,
        metadata: { userId },
      });
      stripeCustomerId = customer.id;
    }


    const session = await this.stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${frontendUrl}/billing?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${frontendUrl}/pricing?canceled=true`,
      metadata: { userId, planId, interval },
      subscription_data: {
        metadata: { userId, planId },
      },
    });

    return { url: session.url, sessionId: session.id };
  }

  // ── Change Plan (upgrade/downgrade for existing subscribers) ──

  async changePlan(userId: string, planId: PlanId, interval: 'monthly' | 'yearly' = 'monthly') {
    const sub = await this.subscriptionRepo.findOne({ where: { userId } });

    // If user has no subscription or is on FREE, redirect to checkout
    if (!sub?.stripeSubscriptionId) {
      if (planId === 'FREE') {
        return { status: 'already_free' };
      }
      throw new BadRequestException('No active subscription. Please use checkout to subscribe.');
    }

    // Downgrade to FREE = cancel subscription
    if (planId === 'FREE') {
      return this.cancelSubscription(userId);
    }

    const plan = PLANS[planId];
    if (!plan) throw new BadRequestException('Invalid plan');

    const priceId = interval === 'yearly' ? plan.stripePriceIdYearly : plan.stripePriceIdMonthly;
    if (!priceId) throw new BadRequestException('Stripe price not configured for this plan');

    if (!this.stripe) throw new BadRequestException('Stripe is not configured');

    // Retrieve current Stripe subscription
    const stripeSubscription = await this.stripe.subscriptions.retrieve(sub.stripeSubscriptionId);
    const currentItemId = stripeSubscription.items.data[0]?.id;

    if (!currentItemId) {
      throw new BadRequestException('Could not find subscription item to update');
    }

    // Update the subscription with the new price (Stripe handles proration automatically)
    const updatedSubscription = await this.stripe.subscriptions.update(sub.stripeSubscriptionId, {
      items: [{
        id: currentItemId,
        price: priceId,
      }],
      proration_behavior: 'create_prorations',
      metadata: { userId, planId },
    });

    // Update local record
    sub.plan = planId;
    sub.billingInterval = interval;
    sub.stripePriceId = priceId;
    sub.currentPeriodStart = this.parseStripeDate(updatedSubscription.current_period_start);
    sub.currentPeriodEnd = this.parseStripeDate(updatedSubscription.current_period_end);
    sub.canceledAt = null as any;
    sub.status = 'active';
    await this.subscriptionRepo.save(sub);

    this.logger.log(`User ${userId} changed plan to ${planId} (${interval})`);
    return { status: 'changed', plan: planId };
  }

  // ── Cancel Subscription (downgrade to FREE) ──

  async cancelSubscription(userId: string) {
    const sub = await this.subscriptionRepo.findOne({ where: { userId } });

    if (!sub?.stripeSubscriptionId) {
      throw new BadRequestException('No active subscription to cancel');
    }

    if (!this.stripe) throw new BadRequestException('Stripe is not configured');

    // Cancel at period end so user keeps access until their billing cycle ends
    await this.stripe.subscriptions.update(sub.stripeSubscriptionId, {
      cancel_at_period_end: true,
    });

    sub.canceledAt = new Date();
    await this.subscriptionRepo.save(sub);

    this.logger.log(`User ${userId} canceled subscription (downgrade to FREE at period end)`);
    return {
      status: 'canceled',
      message: 'Your subscription will be canceled at the end of the current billing period.',
      periodEnd: sub.currentPeriodEnd,
    };
  }

  // ── Confirm Payment (card or MFS) ──

  async confirmPayment(userId: string, paymentData: any) {
    const sub = await this.subscriptionRepo.findOne({ where: { userId } });

    const isRenewalPayment = sub && sub.status === 'active' && sub.paymentDueDate;
    const isNewPayment = sub && sub.status === 'payment_pending';

    if (!sub || (!isRenewalPayment && !isNewPayment)) {
      throw new BadRequestException('No pending payment found');
    }

    // Check if payment window has expired (only for new plan upgrades)
    if (isNewPayment && sub.paymentDueDate && new Date() > sub.paymentDueDate) {
      sub.status = 'expired';
      sub.plan = 'FREE';
      sub.paymentDueDate = null as any;
      await this.subscriptionRepo.save(sub);
      throw new BadRequestException('Payment window has expired. Please select a plan again.');
    }

    // Validate payment data
    if (paymentData.method === 'card') {
      if (!paymentData.cardLast4 || !paymentData.cardName) {
        throw new BadRequestException('Invalid card details');
      }
      this.logger.log(`Card payment received for user ${userId}: ****${paymentData.cardLast4}`);
    } else if (paymentData.method === 'mfs') {
      if (!paymentData.transactionId || !paymentData.mfsNumber) {
        throw new BadRequestException('Transaction ID and mobile number are required');
      }
      this.logger.log(`MFS payment received for user ${userId}: ${paymentData.provider} TrxID=${paymentData.transactionId}`);
    } else {
      throw new BadRequestException('Invalid payment method');
    }

    // Activate the subscription — plan runs for 1 month (30 days) or 1 year (365 days)
    const cycleDays = sub.billingInterval === 'yearly' ? 365 : 30;
    const isRenewal = sub.currentPeriodEnd && new Date(sub.currentPeriodEnd).getTime() > Date.now();

    sub.status = 'active';
    if (isRenewal) {
      // Renewal: extend from current period end (don't lose remaining days)
      sub.currentPeriodEnd = new Date(
        new Date(sub.currentPeriodEnd).getTime() + cycleDays * 86400000,
      );
    } else {
      // First-time or expired: start fresh from today
      sub.currentPeriodStart = new Date();
      sub.currentPeriodEnd = new Date(Date.now() + cycleDays * 86400000);
    }
    sub.paymentDueDate = null as any; // Clear due date — payment is done

    await this.subscriptionRepo.save(sub);

    // Get user info for payment record
    const user = await this.userRepo.findOne({ where: { id: userId } });

    // Determine price
    const plan = PLANS[sub.plan as PlanId];
    const price = sub.billingInterval === 'yearly'
      ? `$${plan?.priceYearly || 0}`
      : `$${plan?.priceMonthly || 0}`;

    // Save payment record
    const payment = this.paymentRepo.create({
      userId,
      userEmail: user?.email || '',
      userName: user?.name || '',
      plan: sub.plan,
      amount: price,
      method: paymentData.method,
      cardLast4: paymentData.cardLast4 || null,
      mfsProvider: paymentData.provider || null,
      mfsNumber: paymentData.mfsNumber || null,
      transactionId: paymentData.transactionId || null,
      status: 'completed',
      billingInterval: sub.billingInterval,
    });
    await this.paymentRepo.save(payment);

    this.logger.log(`Subscription activated: ${sub.plan} plan for user ${userId}`);

    return {
      success: true,
      message: 'Payment confirmed. Your plan is now active!',
      plan: sub.plan,
      status: sub.status,
    };
  }

  // ── Renew Subscription (pay for next cycle) ──

  async renewSubscription(userId: string) {
    const sub = await this.subscriptionRepo.findOne({ where: { userId } });

    if (!sub || sub.plan === 'FREE') {
      throw new BadRequestException('No active paid plan to renew');
    }

    if (sub.paymentDueDate) {
      throw new BadRequestException('You already have a pending renewal. Please complete payment.');
    }

    // Keep status ACTIVE — user keeps their plan until it expires
    // Setting paymentDueDate signals that a renewal payment is expected
    sub.paymentDueDate = sub.currentPeriodEnd || new Date(Date.now() + 30 * 86400000);

    await this.subscriptionRepo.save(sub);

    this.logger.log(`Renewal initiated for ${sub.plan} plan, user ${userId}`);

    return { success: true, message: 'Renewal initiated. Please complete payment.' };
  }

  // ── Stripe Customer Portal ──

  async createPortalSession(userId: string, origin?: string) {
    if (!this.stripe) throw new BadRequestException('Stripe is not configured');

    const sub = await this.subscriptionRepo.findOne({ where: { userId } });
    if (!sub?.stripeCustomerId) {
      throw new BadRequestException('No active subscription found');
    }

    const frontendUrl = origin || this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3000';

    const session = await this.stripe.billingPortal.sessions.create({
      customer: sub.stripeCustomerId,
      return_url: `${frontendUrl}/billing`,
    });

    return { url: session.url };
  }

  // ── Webhook Handler ──

  async handleWebhook(event: any) {
    this.logger.log(`Processing Stripe event: ${event.type}`);

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as any;
        await this.handleCheckoutCompleted(session);
        break;
      }
      case 'customer.subscription.updated': {
        const subscription = event.data.object as any;
        await this.handleSubscriptionUpdated(subscription);
        break;
      }
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as any;
        await this.handleSubscriptionDeleted(subscription);
        break;
      }
      case 'invoice.payment_failed': {
        const invoice = event.data.object as any;
        await this.handlePaymentFailed(invoice);
        break;
      }
      default:
        this.logger.log(`Unhandled event type: ${event.type}`);
    }
  }

  // ── Internal Handlers ──

  private async handleCheckoutCompleted(session: any) {
    const userId = session.metadata?.userId;
    const planId = session.metadata?.planId as PlanId;
    const interval = (session.metadata?.interval as 'monthly' | 'yearly') || 'monthly';

    if (!userId || !planId) {
      this.logger.warn('Checkout session missing metadata');
      return;
    }

    // Fetch the Stripe subscription
    const stripeSubscription = await this.stripe.subscriptions.retrieve(
      session.subscription as string,
    );

    // Upsert subscription record
    let sub = await this.subscriptionRepo.findOne({ where: { userId } });
    if (sub) {
      sub.plan = planId;
      sub.status = 'active';
      sub.billingInterval = interval;
      sub.stripeCustomerId = session.customer as string;
      sub.stripeSubscriptionId = stripeSubscription.id;
      sub.stripePriceId = stripeSubscription.items.data[0]?.price.id;
      sub.currentPeriodStart = this.parseStripeDate(stripeSubscription.current_period_start);
      sub.currentPeriodEnd = this.parseStripeDate(stripeSubscription.current_period_end);
      sub.canceledAt = null as any;
    } else {
      sub = this.subscriptionRepo.create({
        userId,
        plan: planId,
        status: 'active',
        billingInterval: interval,
        stripeCustomerId: session.customer as string,
        stripeSubscriptionId: stripeSubscription.id,
        stripePriceId: stripeSubscription.items.data[0]?.price.id,
        currentPeriodStart: this.parseStripeDate(stripeSubscription.current_period_start),
        currentPeriodEnd: this.parseStripeDate(stripeSubscription.current_period_end),
      });
    }

    await this.subscriptionRepo.save(sub);
    this.logger.log(`User ${userId} upgraded to ${planId}`);
  }

  private async handleSubscriptionUpdated(subscription: any) {
    const sub = await this.subscriptionRepo.findOne({
      where: { stripeSubscriptionId: subscription.id },
    });

    if (!sub) return;

    sub.status = subscription.status === 'active' ? 'active' :
                 subscription.status === 'past_due' ? 'past_due' :
                 subscription.status === 'canceled' ? 'canceled' : sub.status;
    sub.currentPeriodStart = this.parseStripeDate(subscription.current_period_start);
    sub.currentPeriodEnd = this.parseStripeDate(subscription.current_period_end);

    if (subscription.cancel_at_period_end) {
      sub.canceledAt = new Date();
    }

    await this.subscriptionRepo.save(sub);
  }

  private async handleSubscriptionDeleted(subscription: any) {
    const sub = await this.subscriptionRepo.findOne({
      where: { stripeSubscriptionId: subscription.id },
    });

    if (!sub) return;

    sub.plan = 'FREE';
    sub.status = 'expired';
    sub.stripeSubscriptionId = null as any;
    sub.canceledAt = new Date();

    await this.subscriptionRepo.save(sub);
    this.logger.log(`Subscription ${subscription.id} expired → FREE`);
  }

  private async handlePaymentFailed(invoice: any) {
    const subscriptionId = invoice.subscription as string;
    if (!subscriptionId) return;

    const sub = await this.subscriptionRepo.findOne({
      where: { stripeSubscriptionId: subscriptionId },
    });

    if (sub) {
      sub.status = 'past_due';
      await this.subscriptionRepo.save(sub);
      this.logger.warn(`Payment failed for subscription ${subscriptionId}`);
    }
  }

  // ── Construct webhook event ──
  // ── Verify Checkout Session (for immediate plan activation after redirect) ──

  async verifyCheckoutSession(userId: string, sessionId: string) {
    if (!this.stripe) throw new BadRequestException('Stripe is not configured');

    const session = await this.stripe.checkout.sessions.retrieve(sessionId);

    if (!session || session.status !== 'complete') {
      throw new BadRequestException('Checkout session is not complete');
    }

    // Verify this session belongs to the requesting user
    if (session.metadata?.userId !== userId) {
      throw new BadRequestException('Session does not belong to this user');
    }

    // Check if already processed
    const existingSub = await this.subscriptionRepo.findOne({ where: { userId } });
    if (existingSub?.stripeSubscriptionId === session.subscription) {
      this.logger.log(`Session ${sessionId} already processed for user ${userId}`);
      return { status: 'already_active', plan: existingSub?.plan };
    }

    // Process the checkout — reuse the existing handler
    await this.handleCheckoutCompleted(session);

    const updatedSub = await this.subscriptionRepo.findOne({ where: { userId } });
    return { status: 'activated', plan: updatedSub?.plan };
  }

  constructWebhookEvent(payload: Buffer, signature: string): any {
    const webhookSecret = this.configService.get<string>('STRIPE_WEBHOOK_SECRET');
    if (!webhookSecret) throw new BadRequestException('Webhook secret not configured');
    return this.stripe.webhooks.constructEvent(payload, signature, webhookSecret);
  }
}
