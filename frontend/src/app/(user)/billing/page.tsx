"use client";
import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/api";
import {
  CreditCard, Zap, Rocket, Crown,
  ExternalLink, CheckCircle, AlertCircle, Clock, ChevronLeft, User, Tag,
  Calendar, Receipt,
} from "lucide-react";
import { toast } from "react-toastify";
import { useFeatureFlags } from "@/lib/FeatureFlagContext";
import UserSidebar from "@/components/UserSidebar";

function BillingPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [subscription, setSubscription] = useState<any>(null);
  const [usage, setUsage] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [portalLoading, setPortalLoading] = useState(false);
  const flags = useFeatureFlags();

  useEffect(() => {
    const sessionId = searchParams.get("session_id");
    const success = searchParams.get("success");

    if (success === "true" && sessionId) {
      verifySession(sessionId);
    } else {
      loadData();
    }
  }, []);

  const verifySession = async (sessionId: string) => {
    try {
      const res = await apiFetch("/subscriptions/verify-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(
          data.status === "already_active"
            ? "Your plan is already active!"
            : "🎉 Payment successful! Your plan has been upgraded."
        );
      } else {
        toast.error(data.message || "Failed to verify payment session");
      }
    } catch {
      toast.error("Failed to verify payment session");
    }

    // Clean up URL params and reload data
    router.replace("/billing");
    await loadData();
  };

  const loadData = async () => {
    try {
      const subRes = await apiFetch("/subscriptions/current");
      if (subRes.ok) {
        setSubscription(await subRes.json());
      }
    } catch { /* Subscriptions module not available */ }

    try {
      const usageRes = await apiFetch("/subscriptions/usage");
      if (usageRes.ok) {
        setUsage(await usageRes.json());
      }
    } catch { /* Subscriptions module not available */ }

    setLoading(false);
  };

  const handleManageSubscription = async () => {
    try {
      setPortalLoading(true);
      const res = await apiFetch("/subscriptions/create-portal", {
        method: "POST",
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        toast.error("Failed to open billing portal");
      }
    } catch {
      toast.error("No active subscription to manage");
    } finally {
      setPortalLoading(false);
    }
  };

  const planIcons: Record<string, any> = {
    FREE: <Zap className="w-5 h-5 text-gray-400" />,
    PRO: <Rocket className="w-5 h-5 text-violet-400" />,
    TEAM: <Crown className="w-5 h-5 text-amber-400" />,
  };

  const statusIcons: Record<string, any> = {
    active: <CheckCircle className="w-4 h-4 text-emerald-400" />,
    past_due: <AlertCircle className="w-4 h-4 text-red-400" />,
    payment_pending: <AlertCircle className="w-4 h-4 text-amber-400" />,
    canceled: <Clock className="w-4 h-4 text-amber-400" />,
    trialing: <Clock className="w-4 h-4 text-blue-400" />,
  };

  const statusLabels: Record<string, string> = {
    active: "Active",
    past_due: "Past Due",
    payment_pending: "Payment Pending",
    canceled: "Canceled",
    trialing: "Trial",
    expired: "Expired",
  };

  if (loading) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-[var(--background)]">
        <div className="w-8 h-8 border-2 border-[var(--color-brand-500)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const plan = subscription?.plan || { id: "FREE", name: "Free", limits: {} };
  const status = subscription?.status || "active";
  const periodEnd = subscription?.currentPeriodEnd;
  const periodStart = subscription?.currentPeriodStart;
  const paymentDueDate = subscription?.paymentDueDate;
  const billingInterval = subscription?.billingInterval || "monthly";

  return (
    <div className="flex h-full w-full overflow-hidden">
      <UserSidebar activePage="billing" />

      {/* Main Content */}
      <div className="flex-1 overflow-auto bg-[var(--background)] text-[var(--foreground)]">
        <div className="max-w-3xl mx-auto px-6 py-5 sm:py-8">

        <h1 className="text-2xl sm:text-3xl font-bold mb-1">Billing & Subscription</h1>
        <p className="text-[var(--muted)] text-sm sm:text-base mb-5">Manage your plan, usage, and payment details</p>

        {/* Payment Pending Banner */}
        {status === 'payment_pending' && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 mb-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-amber-400">Payment Required</p>
              <p className="text-xs text-[var(--muted)] mt-0.5 mb-1">Your {plan.name} plan upgrade is pending payment. Complete payment to activate your plan.</p>
              {paymentDueDate && (
                <p className="text-xs font-semibold text-amber-300 mb-3">
                  ⏰ Due by {new Date(paymentDueDate).toLocaleDateString()} ({Math.max(0, Math.ceil((new Date(paymentDueDate).getTime() - Date.now()) / 86400000))} days remaining)
                </p>
              )}
              <button
                onClick={() => router.push('/payment')}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold rounded-lg transition-colors"
              >
                Complete Payment →
              </button>
            </div>
          </div>
        )}

        {/* Renewal pending — plan is still active, gentle reminder */}
        {status === 'active' && paymentDueDate && (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 mb-4 flex items-start gap-3">
            <Calendar className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-emerald-400">Renewal Payment Ready</p>
              <p className="text-xs text-[var(--muted)] mt-0.5 mb-1">Your {plan.name} plan is active until {new Date(paymentDueDate).toLocaleDateString()}. Pay before then to extend your plan seamlessly.</p>
              <p className="text-xs font-semibold text-emerald-300 mb-3">
                📅 {Math.max(0, Math.ceil((new Date(paymentDueDate).getTime() - Date.now()) / 86400000))} days until renewal
              </p>
              <button
                onClick={() => router.push('/payment')}
                className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-semibold rounded-lg transition-colors"
              >
                Pay for Next {billingInterval === "yearly" ? "Year" : "Month"} →
              </button>
            </div>
          </div>
        )}

        {/* Current Plan Card */}
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 sm:p-5 mb-4">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-[var(--sidebar)]">
                {planIcons[plan.id] || planIcons.FREE}
              </div>
              <div>
                <h2 className="text-xl font-bold">{plan.name} Plan</h2>
                <div className="flex items-center gap-2 mt-0.5">
                  {statusIcons[status]}
                  <span className={`text-xs font-semibold ${
                    status === "active" ? "text-emerald-400" :
                    status === "past_due" ? "text-red-400" :
                    "text-[var(--muted)]"
                  }`}>
                    {statusLabels[status] || status}
                  </span>
                  {periodEnd && status !== "expired" && (
                    <span className="text-xs text-[var(--muted)]">
                      · Renews {new Date(periodEnd).toLocaleDateString()}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {plan.id !== "FREE" && subscription?.subscription?.stripeCustomerId && (
              <button
                onClick={handleManageSubscription}
                disabled={portalLoading}
                className="flex items-center gap-1.5 text-xs font-semibold text-[var(--muted)] hover:text-[var(--foreground)] bg-[var(--sidebar)] hover:bg-[var(--border)] px-3 py-2 rounded-lg transition-all border border-[var(--border)] w-full sm:w-auto justify-center sm:justify-start"
              >
                {portalLoading ? (
                  <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                ) : (
                  <CreditCard className="w-3.5 h-3.5" />
                )}
                Manage Subscription
                <ExternalLink className="w-3 h-3 ml-0.5 opacity-50" />
              </button>
            )}
          </div>

          {/* Billing Dates */}
          {status === 'active' && periodEnd && (
            <div className="rounded-xl bg-[var(--sidebar)] border border-[var(--border)] p-4 mt-4">
              <h4 className="text-xs font-bold text-[var(--muted)] uppercase tracking-wider mb-3">Billing Cycle</h4>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-[var(--muted)]">Plan Started</p>
                  <p className="text-sm font-semibold">{periodStart ? new Date(periodStart).toLocaleDateString() : '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-[var(--muted)]">Current Period Ends</p>
                  <p className="text-sm font-semibold">{new Date(periodEnd).toLocaleDateString()}</p>
                </div>
                <div>
                  <p className="text-xs text-[var(--muted)]">Billing Interval</p>
                  <p className="text-sm font-semibold capitalize">{billingInterval}</p>
                </div>
                <div>
                  <p className="text-xs text-[var(--muted)]">Next Payment Due</p>
                  <p className="text-sm font-semibold text-amber-400">{new Date(periodEnd).toLocaleDateString()}</p>
                </div>
              </div>

              {/* Days remaining */}
              {(() => {
                const daysLeft = Math.max(0, Math.ceil((new Date(periodEnd).getTime() - Date.now()) / 86400000));
                return (
                  <div className="mt-3 pt-3 border-t border-[var(--border)] flex items-center justify-between">
                    <div>
                      <p className="text-xs text-[var(--muted)]">
                        {daysLeft > 0 ? `${daysLeft} days remaining` : "Plan expired"}
                      </p>
                      <div className="w-48 h-1.5 rounded-full bg-[var(--border)] mt-1.5">
                        <div
                          className={`h-full rounded-full transition-all ${daysLeft <= 5 ? 'bg-red-500' : daysLeft <= 10 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                          style={{ width: `${Math.min(100, (daysLeft / (billingInterval === 'yearly' ? 365 : 30)) * 100)}%` }}
                        />
                      </div>
                    </div>
                    <button
                      onClick={async () => {
                        try {
                          const res = await apiFetch("/subscriptions/renew", { method: "POST" });
                          if (res.ok) {
                            router.push("/payment");
                          } else {
                            const err = await res.json();
                            toast.error(err.message || "Failed to initiate renewal");
                          }
                        } catch (e) {
                          toast.error("Failed to initiate renewal");
                        }
                      }}
                      className="px-4 py-2 text-xs font-semibold rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white transition-colors"
                    >
                      Pay for Next {billingInterval === "yearly" ? "Year" : "Month"} →
                    </button>
                  </div>
                );
              })()}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-3 mt-4">
            <button
              onClick={() => {
                if (!flags.allow_subscriptions) {
                  toast.error("Subscriptions are currently disabled by the administrator.");
                  return;
                }
                router.push("/pricing");
              }}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-[var(--color-brand-500)] hover:bg-[var(--color-brand-600)] text-white transition-colors"
            >
              {plan.id === "FREE" ? "Upgrade Plan" : "Change Plan"}
            </button>
          </div>
        </div>

        {/* Usage Meters */}
        {usage && (
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 sm:p-5 mb-4">
            <h3 className="text-sm font-bold text-[var(--muted)] uppercase tracking-wider mb-4">Usage</h3>

            <UsageMeter
              label="Collections"
              current={usage.usage?.collections || 0}
              max={usage.limits?.maxCollections || 3}
            />
            <UsageMeter
              label="Team Members"
              current={usage.usage?.members || 0}
              max={usage.limits?.maxMembers || 1}
            />
            <UsageMeter
              label="Collaborators"
              current={usage.usage?.collaborators || 0}
              max={usage.limits?.maxCollaborators || 3}
            />
            <UsageMeter
              label="Environments"
              current={usage.usage?.environments || 0}
              max={usage.limits?.maxEnvironments || 2}
            />
          </div>
        )}

        {/* Plan Features */}
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 sm:p-5">
          <h3 className="text-sm font-bold text-[var(--muted)] uppercase tracking-wider mb-4">Plan Includes</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              { label: "Collections", value: plan.limits?.maxCollections === -1 ? "Unlimited" : plan.limits?.maxCollections || 3 },
              { label: "Requests/Collection", value: plan.limits?.maxRequestsPerCollection === -1 ? "Unlimited" : plan.limits?.maxRequestsPerCollection || 25 },
              { label: "Team Members", value: plan.limits?.maxMembers || 1 },
              { label: "Collaborators", value: plan.limits?.maxCollaborators === -1 ? "Unlimited" : plan.limits?.maxCollaborators || 3 },
              { label: "Environments", value: plan.limits?.maxEnvironments === -1 ? "Unlimited" : plan.limits?.maxEnvironments || 2 },
              { label: "History", value: `${plan.limits?.historyDays || 7} days` },
              { label: "Upload Size", value: `${plan.limits?.maxUploadMb || 1} MB` },
            ].map((item, i) => (
              <div key={i} className="flex items-center justify-between py-2 px-3 rounded-lg bg-[var(--sidebar)] border border-[var(--border)]">
                <span className="text-xs text-[var(--muted)]">{item.label}</span>
                <span className="text-xs font-semibold text-[var(--foreground)]">{item.value}</span>
              </div>
            ))}
          </div>
        </div>

        </div>
      </div>
    </div>
  );
}

function UsageMeter({ label, current, max }: { label: string; current: number; max: number }) {
  const isUnlimited = max === -1;
  const percentage = isUnlimited ? 10 : Math.min((current / max) * 100, 100);
  const isNearLimit = !isUnlimited && percentage >= 80;
  const isAtLimit = !isUnlimited && percentage >= 100;

  return (
    <div className="mb-4 last:mb-0">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-sm text-[var(--muted)]">{label}</span>
        <span className={`text-xs font-mono font-semibold ${
          isAtLimit ? "text-red-400" : isNearLimit ? "text-amber-400" : "text-[var(--muted)]"
        }`}>
          {current}{isUnlimited ? "" : ` / ${max}`}
        </span>
      </div>
      <div className="h-1.5 bg-[var(--border)] rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            isAtLimit ? "bg-red-500" : isNearLimit ? "bg-amber-500" : "bg-[var(--color-brand-500)]"
          }`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

export default function BillingPage() {
  return (
    <Suspense fallback={<div className="flex h-full w-full items-center justify-center text-[var(--muted)]">Loading...</div>}>
      <BillingPageInner />
    </Suspense>
  );
}
