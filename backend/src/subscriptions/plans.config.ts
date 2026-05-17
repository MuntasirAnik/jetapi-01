export type PlanId = 'FREE' | 'PRO' | 'TEAM';

export interface PlanLimits {
  maxCollections: number;
  maxRequestsPerCollection: number;
  maxMembers: number;
  maxCollaborators: number;
  maxEnvironments: number;
  sharedCollections: boolean;
  apiDocExport: boolean;
  historyDays: number;
  maxUploadMb: number;
  analyticsAccess: boolean;
}

export interface PlanDefinition {
  id: PlanId;
  name: string;
  description: string;
  priceMonthly: number; // in cents
  priceYearly: number;  // in cents (per year)
  readonly stripePriceIdMonthly: string;
  readonly stripePriceIdYearly: string;
  limits: PlanLimits;
  features: string[];
  popular?: boolean;
}

export const PLANS: Record<PlanId, PlanDefinition> = {
  FREE: {
    id: 'FREE',
    name: 'Free',
    description: 'For hobbyists and personal projects',
    priceMonthly: 0,
    priceYearly: 0,
    stripePriceIdMonthly: '',
    stripePriceIdYearly: '',
    limits: {
      maxCollections: 3,
      maxRequestsPerCollection: 25,
      maxMembers: 2,
      maxCollaborators: 3,
      maxEnvironments: 2,
      sharedCollections: false,
      apiDocExport: false,
      historyDays: 7,
      maxUploadMb: 1,
      analyticsAccess: false,
    },
    features: [
      '3 Collections',
      '25 Requests per collection',
      '3 Collaborators',
      '2 Environments',
      '7-day request history',
      '1 MB file uploads',
    ],
  },
  PRO: {
    id: 'PRO',
    name: 'Pro',
    description: 'For professional developers',
    priceMonthly: 1200, // $12
    priceYearly: 12000, // $120/yr ($10/mo effective)
    get stripePriceIdMonthly() { return process.env.STRIPE_PRO_MONTHLY_PRICE_ID || ''; },
    get stripePriceIdYearly() { return process.env.STRIPE_PRO_YEARLY_PRICE_ID || ''; },
    limits: {
      maxCollections: -1, // unlimited
      maxRequestsPerCollection: -1,
      maxMembers: 3,
      maxCollaborators: 10,
      maxEnvironments: 10,
      sharedCollections: true,
      apiDocExport: true,
      historyDays: 30,
      maxUploadMb: 5,
      analyticsAccess: true,
    },
    features: [
      'Unlimited Collections',
      'Unlimited Requests',
      'Up to 3 team members',
      '10 Collaborators per collection',
      '10 Environments',
      'Shared collections',
      'API Documentation export',
      '30-day request history',
      '5 MB file uploads',
    ],
    popular: true,
  },
  TEAM: {
    id: 'TEAM',
    name: 'Team',
    description: 'For teams and organizations',
    priceMonthly: 2900, // $29
    priceYearly: 29000, // $290/yr (~$24/mo effective)
    get stripePriceIdMonthly() { return process.env.STRIPE_TEAM_MONTHLY_PRICE_ID || ''; },
    get stripePriceIdYearly() { return process.env.STRIPE_TEAM_YEARLY_PRICE_ID || ''; },
    limits: {
      maxCollections: -1,
      maxRequestsPerCollection: -1,
      maxMembers: 15,
      maxCollaborators: -1, // unlimited
      maxEnvironments: -1,
      sharedCollections: true,
      apiDocExport: true,
      historyDays: 90,
      maxUploadMb: 10,
      analyticsAccess: true,
    },
    features: [
      'Everything in Pro',
      'Up to 15 team members',
      'Unlimited Collaborators',
      'Unlimited Environments',
      '90-day request history',
      '10 MB file uploads',
      'Priority support',
    ],
  },
};

export function getPlanLimits(planId: PlanId): PlanLimits {
  return PLANS[planId]?.limits || PLANS.FREE.limits;
}
