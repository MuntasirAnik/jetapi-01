import {
  Controller,
  Get,
  Post,
  Body,
  Req,
  Res,
  UseGuards,
  Headers,
  Query,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { SubscriptionsService } from './subscriptions.service';
import { LimitsService } from './limits.service';
import { FeatureFlagGuard, RequireFeature } from '../admin/feature-flag.guard';
import type { Request, Response } from 'express';

@Controller(['subscriptions', 'api/subscriptions'])
export class SubscriptionsController {
  constructor(
    private subscriptionsService: SubscriptionsService,
    private limitsService: LimitsService,
  ) {}

  @Get('plans')
  getPlans() {
    return this.subscriptionsService.getPlans();
  }

  @Get('current')
  @UseGuards(AuthGuard)
  async getCurrent(@Req() req: any) {
    return this.subscriptionsService.getCurrentSubscription(req.user.sub);
  }

  @Get('usage')
  @UseGuards(AuthGuard)
  async getUsage(@Req() req: any) {
    return this.limitsService.getUsageSummary(req.user.sub);
  }

  @Get('report')
  @UseGuards(AuthGuard)
  async getReport(@Req() req: any) {
    return this.limitsService.getUserReport(req.user.sub);
  }

  @Get('payments')
  @UseGuards(AuthGuard)
  async getMyPayments(
    @Req() req: any,
    @Query('year') year?: string,
    @Query('month') month?: string,
  ) {
    return this.subscriptionsService.getUserPayments(
      req.user.sub,
      year ? parseInt(year) : undefined,
      month ? parseInt(month) : undefined,
    );
  }

  @Post('create-checkout')
  @UseGuards(AuthGuard, FeatureFlagGuard)
  @RequireFeature('allow_subscriptions')
  async createCheckout(
    @Req() req: any,
    @Body() body: { planId: string; interval?: 'monthly' | 'yearly' },
    @Headers('origin') origin?: string,
  ) {
    return this.subscriptionsService.createCheckoutSession(
      req.user.sub,
      body.planId as any,
      body.interval || 'monthly',
      origin,
    );
  }

  @Post('change-plan')
  @UseGuards(AuthGuard, FeatureFlagGuard)
  @RequireFeature('allow_subscriptions')
  async changePlan(
    @Req() req: any,
    @Body() body: { planId: string; interval?: 'monthly' | 'yearly' },
  ) {
    return this.subscriptionsService.changePlan(
      req.user.sub,
      body.planId as any,
      body.interval || 'monthly',
    );
  }

  @Post('cancel')
  @UseGuards(AuthGuard)
  async cancelSubscription(@Req() req: any) {
    return this.subscriptionsService.cancelSubscription(req.user.sub);
  }

  @Post('confirm-payment')
  @UseGuards(AuthGuard, FeatureFlagGuard)
  @RequireFeature('allow_subscriptions')
  async confirmPayment(
    @Req() req: any,
    @Body()
    body: {
      method: string;
      cardLast4?: string;
      cardName?: string;
      provider?: string;
      mfsNumber?: string;
      transactionId?: string;
    },
  ) {
    return this.subscriptionsService.confirmPayment(req.user.sub, body);
  }

  @Post('renew')
  @UseGuards(AuthGuard, FeatureFlagGuard)
  @RequireFeature('allow_subscriptions')
  async renewSubscription(@Req() req: any) {
    return this.subscriptionsService.renewSubscription(req.user.sub);
  }

  @Post('create-portal')
  @UseGuards(AuthGuard)
  async createPortal(@Req() req: any, @Headers('origin') origin?: string) {
    return this.subscriptionsService.createPortalSession(req.user.sub, origin);
  }

  @Post('verify-session')
  @UseGuards(AuthGuard)
  async verifySession(@Req() req: any, @Body() body: { sessionId: string }) {
    return this.subscriptionsService.verifyCheckoutSession(
      req.user.sub,
      body.sessionId,
    );
  }

  @Post('webhook')
  async handleWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string,
    @Res() res: Response,
  ) {
    try {
      const rawBody = req.rawBody;
      if (!rawBody) {
        return res.status(400).json({ error: 'Missing raw body' });
      }

      const event = this.subscriptionsService.constructWebhookEvent(
        rawBody,
        signature,
      );

      await this.subscriptionsService.handleWebhook(event);
      return res.status(200).json({ received: true });
    } catch (err) {
      console.error('Webhook error:', err.message);
      return res.status(400).json({ error: err.message });
    }
  }
}
