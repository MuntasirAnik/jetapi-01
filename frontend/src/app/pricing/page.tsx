"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { Check, Zap, Crown, Rocket, ChevronLeft, CreditCard, User, Tag, LogOut } from "lucide-react";
import { toast } from "react-toastify";

interface Plan {
  id: string;
  name: string;
  description: string;
  priceMonthly: number;
  priceYearly: number;
  features: string[];
  popular: boolean;
  limits: any;
}

export default function PricingPage() {
  const router = useRouter();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [interval, setInterval] = useState<"monthly" | "yearly">("monthly");
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [currentPlan, setCurrentPlan] = useState<string>("FREE");

  useEffect(() => {
    loadPlans();
    loadCurrentPlan();
  }, []);

  const defaultPlans: Plan[] = [
    {
      id: "FREE", name: "Free", description: "For hobbyists and personal projects",
      priceMonthly: 0, priceYearly: 0, popular: false,
      features: ["3 Collections", "25 Requests per collection", "2 Environments", "7-day request history", "1 MB file uploads"],
      limits: {},
    },
    {
      id: "PRO", name: "Pro", description: "For professional developers",
      priceMonthly: 1200, priceYearly: 12000, popular: true,
      features: ["Unlimited Collections", "Unlimited Requests", "Up to 3 team members", "10 Environments", "Shared collections", "API Documentation export", "30-day request history", "5 MB file uploads"],
      limits: {},
    },
    {
      id: "TEAM", name: "Team", description: "For teams and organizations",
      priceMonthly: 2900, priceYearly: 29000, popular: false,
      features: ["Everything in Pro", "Up to 15 team members", "Unlimited Environments", "90-day request history", "10 MB file uploads", "Priority support"],
      limits: {},
    },
  ];

  const loadPlans = async () => {
    try {
      const res = await apiFetch("/subscriptions/plans");
      if (res.ok) {
        const data = await res.json();
        setPlans(Array.isArray(data) ? data : defaultPlans);
      } else {
        setPlans(defaultPlans);
      }
    } catch {
      setPlans(defaultPlans);
    } finally {
      setLoading(false);
    }
  };

  const loadCurrentPlan = async () => {
    try {
      const token = localStorage.getItem("token");
      if (!token) return;
      const res = await apiFetch("/subscriptions/current");
      const data = await res.json();
      setCurrentPlan(data.plan?.id || "FREE");
    } catch {}
  };

  const handleUpgrade = async (planId: string) => {
    if (planId === "FREE") return;
    const token = localStorage.getItem("token");
    if (!token) {
      router.push("/login?redirect=/pricing");
      return;
    }

    try {
      setCheckoutLoading(planId);
      const res = await apiFetch("/subscriptions/create-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId, interval }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        toast.error(data.message || "Failed to create checkout session");
      }
    } catch (err) {
      toast.error("Failed to start checkout. Please try again.");
    } finally {
      setCheckoutLoading(null);
    }
  };

  const planIcons: Record<string, any> = {
    FREE: <Zap className="w-6 h-6" />,
    PRO: <Rocket className="w-6 h-6" />,
    TEAM: <Crown className="w-6 h-6" />,
  };

  const planGradients: Record<string, string> = {
    FREE: "",
    PRO: "",
    TEAM: "",
  };

  const planBorders: Record<string, string> = {
    FREE: "border-[var(--border)]",
    PRO: "border-[var(--color-brand-500)]/50",
    TEAM: "border-amber-500/50",
  };

  const planAccents: Record<string, string> = {
    FREE: "text-[var(--muted)]",
    PRO: "text-[var(--color-brand-500)]",
    TEAM: "text-amber-400",
  };

  if (loading) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-[var(--background)]">
        <div className="w-8 h-8 border-2 border-[var(--color-brand-500)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex h-full w-full overflow-hidden">
      {/* Sidebar */}
      <div className="w-64 border-r border-[var(--border)] bg-[var(--sidebar)] flex flex-col p-4 flex-shrink-0">
        <div className="mb-8 pl-2">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Tag className="w-5 h-5 text-[var(--color-brand-500)]" /> Pricing
          </h1>
          <p className="text-xs text-[var(--muted)] ml-7 mt-0.5">Choose your plan</p>
        </div>

        <nav className="flex flex-col gap-1">
          <button onClick={() => router.push('/profile')} className="flex items-center gap-2 px-3 py-2 rounded-md font-medium text-sm transition-colors hover:bg-[var(--card)] text-[var(--muted)]">
            <User className="w-4 h-4" /> Profile
          </button>
          <button className="flex items-center gap-2 px-3 py-2 rounded-md font-medium text-sm transition-colors bg-[var(--card)] text-[var(--color-brand-500)] shadow-sm">
            <Tag className="w-4 h-4" /> Pricing Plans
          </button>
          <button onClick={() => router.push('/billing')} className="flex items-center gap-2 px-3 py-2 rounded-md font-medium text-sm transition-colors hover:bg-[var(--card)] text-[var(--muted)]">
            <CreditCard className="w-4 h-4" /> Billing
          </button>
        </nav>

        <div className="mt-auto flex flex-col gap-2">
          <button onClick={() => router.push("/")} className="text-sm text-[var(--muted)] hover:text-[var(--foreground)] flex items-center gap-2 border-t border-[var(--border)] pt-4 px-2">
            <ChevronLeft className="w-4 h-4" /> Back to App
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto bg-[var(--background)] text-[var(--foreground)]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 sm:py-6">

          {/* Header */}
          <div className="text-center mb-4 sm:mb-6">
            <h1 className="text-2xl sm:text-4xl font-bold mb-2 sm:mb-3 bg-gradient-to-r from-white via-gray-200 to-gray-400 bg-clip-text text-transparent">
              Choose Your Plan
            </h1>
            <p className="text-[var(--muted)] text-sm sm:text-lg max-w-xl mx-auto">
              Scale your API development workflow with the right plan for your needs
            </p>

            {/* Interval toggle */}
            <div className="flex items-center justify-center gap-3 mt-4 sm:mt-5">
              <span className={`text-sm ${interval === "monthly" ? "text-[var(--foreground)]" : "text-[var(--muted)]"}`}>Monthly</span>
              <button
                onClick={() => setInterval(interval === "monthly" ? "yearly" : "monthly")}
                className={`relative w-14 h-7 rounded-full transition-colors flex-shrink-0 ${interval === "yearly" ? "bg-[var(--color-brand-500)]" : "bg-[var(--border)]"}`}
              >
                <div className={`absolute top-0.5 w-6 h-6 bg-white rounded-full shadow transition-transform ${interval === "yearly" ? "translate-x-7" : "translate-x-0.5"}`} />
              </button>
              <span className={`text-sm ${interval === "yearly" ? "text-[var(--foreground)]" : "text-[var(--muted)]"}`}>
                Yearly
                <span className="ml-1.5 text-[10px] font-bold text-emerald-400 bg-emerald-400/10 px-1.5 py-0.5 rounded-full">SAVE 17%</span>
              </span>
            </div>
          </div>

          {/* Plan Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4">
          {plans.map((plan) => {
            const isCurrentPlan = currentPlan === plan.id;
            const price = interval === "monthly" ? plan.priceMonthly : Math.round(plan.priceYearly / 12);

            return (
              <div
                key={plan.id}
                className={`relative rounded-2xl border ${planBorders[plan.id]} bg-[var(--card)] p-4 sm:p-5 flex flex-col transition-all duration-300 hover:shadow-2xl ${plan.popular ? "ring-2 ring-[var(--color-brand-500)]/50 order-first md:order-none" : ""}`}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 bg-[var(--color-brand-500)] text-white text-[10px] font-bold uppercase tracking-wider rounded-full whitespace-nowrap">
                    Most Popular
                  </div>
                )}

                {/* Plan Icon + Name */}
                <div className="flex items-center gap-3 mb-4">
                  <div className={`p-2 rounded-lg bg-[var(--sidebar)] flex-shrink-0 ${planAccents[plan.id]}`}>
                    {planIcons[plan.id]}
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-lg font-bold">{plan.name}</h3>
                    <p className="text-xs text-[var(--muted)] truncate">{plan.description}</p>
                  </div>
                </div>

                {/* Price */}
                <div className="mb-4">
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl sm:text-4xl font-black">
                      {price === 0 ? "Free" : `$${(price / 100).toFixed(0)}`}
                    </span>
                    {price > 0 && <span className="text-sm text-gray-500">/month</span>}
                  </div>
                  {price > 0 && interval === "yearly" && (
                    <p className="text-xs text-gray-600 mt-1">
                      ${(plan.priceYearly / 100).toFixed(0)} billed annually
                    </p>
                  )}
                </div>

                {/* Features */}
                <div className="flex-1 space-y-2 mb-4">
                  {plan.features.map((feature, i) => (
                    <div key={i} className="flex items-start gap-2.5">
                      <Check className={`w-4 h-4 mt-0.5 flex-shrink-0 ${planAccents[plan.id]}`} />
                      <span className="text-sm text-[var(--foreground)]">{feature}</span>
                    </div>
                  ))}
                </div>

                {/* CTA Button */}
                <button
                  onClick={() => handleUpgrade(plan.id)}
                  disabled={isCurrentPlan || checkoutLoading === plan.id}
                  className={`w-full py-3 rounded-xl font-semibold text-sm transition-all duration-200 ${
                    isCurrentPlan
                      ? "bg-[var(--sidebar)] text-[var(--muted)] cursor-default border border-[var(--border)]"
                      : plan.popular
                      ? "bg-[var(--color-brand-500)] hover:bg-[var(--color-brand-600)] text-white"
                      : plan.id === "TEAM"
                      ? "bg-amber-500/10 text-amber-400 border border-amber-500/30 hover:bg-amber-500/20"
                      : "bg-[var(--sidebar)] text-[var(--foreground)] border border-[var(--border)] hover:bg-[var(--border)]"
                  }`}
                >
                  {checkoutLoading === plan.id ? (
                    <span className="flex items-center justify-center gap-2">
                      <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                      Processing...
                    </span>
                  ) : isCurrentPlan ? (
                    "Current Plan"
                  ) : plan.id === "FREE" ? (
                    "Get Started"
                  ) : (
                    `Upgrade to ${plan.name}`
                  )}
                </button>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="text-center mt-4 sm:mt-6 pb-4 text-xs sm:text-sm text-[var(--muted)]">
          <p>All plans include SSL encryption, 99.9% uptime, and community support.</p>
          <p className="mt-1">Prices in USD. Cancel anytime.</p>
        </div>
      </div>
      </div>
    </div>
  );
}
