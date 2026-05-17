"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { toast } from "react-toastify";
import {
  CreditCard, Smartphone, ChevronLeft, Shield, Lock, Check, Loader2,
  Zap, Rocket, Crown,
} from "lucide-react";

type PaymentMethod = "card" | "mfs";

export default function PaymentPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [subscription, setSubscription] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("card");
  const [success, setSuccess] = useState(false);

  // Card fields
  const [cardNumber, setCardNumber] = useState("");
  const [cardName, setCardName] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvv, setCvv] = useState("");

  // MFS fields
  const [mfsProvider, setMfsProvider] = useState("bkash");
  const [mfsNumber, setMfsNumber] = useState("");
  const [mfsTrxId, setMfsTrxId] = useState("");

  useEffect(() => {
    loadSubscription();
  }, []);

  const loadSubscription = async () => {
    try {
      const res = await apiFetch("/subscriptions/current");
      if (res.ok) {
        const data = await res.json();
        setSubscription(data);
        if (data.status === "active") {
          router.push("/billing");
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const formatCardNumber = (val: string) => {
    const digits = val.replace(/\D/g, "").slice(0, 16);
    return digits.replace(/(\d{4})(?=\d)/g, "$1 ");
  };

  const formatExpiry = (val: string) => {
    const digits = val.replace(/\D/g, "").slice(0, 4);
    if (digits.length >= 3) return digits.slice(0, 2) + "/" + digits.slice(2);
    return digits;
  };

  const validateCard = () => {
    const num = cardNumber.replace(/\s/g, "");
    if (num.length < 13 || num.length > 16) return "Invalid card number";
    if (!cardName.trim()) return "Cardholder name is required";
    const [mm, yy] = expiry.split("/");
    if (!mm || !yy || parseInt(mm) < 1 || parseInt(mm) > 12) return "Invalid expiry date";
    if (cvv.length < 3) return "Invalid CVV";
    return null;
  };

  const validateMfs = () => {
    if (!mfsNumber || mfsNumber.replace(/\D/g, "").length < 11) return "Invalid mobile number";
    if (!mfsTrxId.trim()) return "Transaction ID is required";
    return null;
  };

  const handlePayment = async () => {
    const error = paymentMethod === "card" ? validateCard() : validateMfs();
    if (error) {
      toast.error(error);
      return;
    }

    setProcessing(true);
    try {
      const paymentData = paymentMethod === "card"
        ? {
            method: "card",
            cardLast4: cardNumber.replace(/\s/g, "").slice(-4),
            cardName,
          }
        : {
            method: "mfs",
            provider: mfsProvider,
            mfsNumber,
            transactionId: mfsTrxId,
          };

      const res = await apiFetch("/subscriptions/confirm-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(paymentData),
      });

      if (res.ok) {
        setSuccess(true);
        toast.success("Payment successful! Your plan is now active.");
        setTimeout(() => router.push("/billing?success=true"), 2000);
      } else {
        const err = await res.json();
        toast.error(err.message || "Payment failed. Please try again.");
      }
    } catch (e) {
      toast.error("Payment processing error. Please try again.");
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-[var(--background)]">
        <div className="w-8 h-8 border-2 border-[var(--color-brand-500)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (success) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-[var(--background)]">
        <div className="text-center">
          <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto mb-4">
            <Check className="w-8 h-8 text-emerald-400" />
          </div>
          <h2 className="text-2xl font-bold mb-2">Payment Successful!</h2>
          <p className="text-[var(--muted)]">Your plan is now active. Redirecting...</p>
        </div>
      </div>
    );
  }

  const plan = subscription?.plan || { id: "FREE", name: "Free" };
  const planIcon = plan.id === "TEAM" ? <Crown className="w-5 h-5 text-amber-400" /> :
                   plan.id === "PRO" ? <Rocket className="w-5 h-5 text-violet-400" /> :
                   <Zap className="w-5 h-5 text-gray-400" />;

  const price = plan.id === "PRO" ? "$12" : plan.id === "TEAM" ? "$29" : "$0";
  const interval = subscription?.subscription?.billingInterval || "monthly";

  return (
    <div className="flex h-full w-full overflow-hidden bg-[var(--background)] text-[var(--foreground)]">
      <div className="flex-1 overflow-auto">
        <div className="max-w-xl mx-auto px-6 py-8">

          {/* Back */}
          <button onClick={() => router.push("/billing")} className="flex items-center gap-1 text-sm text-[var(--muted)] hover:text-[var(--foreground)] mb-6 transition-colors">
            <ChevronLeft className="w-4 h-4" /> Back to Billing
          </button>

          {/* Order Summary */}
          <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 mb-6">
            <h3 className="text-xs font-bold text-[var(--muted)] uppercase tracking-wider mb-3">Order Summary</h3>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-[var(--sidebar)]">{planIcon}</div>
                <div>
                  <p className="font-semibold">{plan.name} Plan</p>
                  <p className="text-xs text-[var(--muted)]">Billed {interval}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-xl font-bold">{price}</p>
                <p className="text-xs text-[var(--muted)]">/{interval === "yearly" ? "year" : "month"}</p>
              </div>
            </div>

            {/* Due date and plan duration */}
            <div className="border-t border-[var(--border)] pt-3 space-y-1.5">
              {subscription?.paymentDueDate && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[var(--muted)]">Payment due by</span>
                  <span className="font-semibold text-amber-400">
                    {new Date(subscription.paymentDueDate).toLocaleDateString()} ({Math.max(0, Math.ceil((new Date(subscription.paymentDueDate).getTime() - Date.now()) / 86400000))} days left)
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between text-xs">
                <span className="text-[var(--muted)]">Plan duration</span>
                <span className="font-semibold">{interval === "yearly" ? "1 Year (365 days)" : "1 Month (30 days)"}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-[var(--muted)]">Next renewal date</span>
                <span className="font-semibold">{new Date(Date.now() + (interval === "yearly" ? 365 : 30) * 86400000).toLocaleDateString()}</span>
              </div>
            </div>
          </div>

          {/* Payment Method Selector */}
          <h2 className="text-lg font-bold mb-3">Payment Method</h2>
          <div className="flex gap-3 mb-5">
            <button
              onClick={() => setPaymentMethod("card")}
              className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border text-sm font-semibold transition-all ${
                paymentMethod === "card"
                  ? "border-[var(--color-brand-500)] bg-[var(--color-brand-500)]/10 text-[var(--color-brand-500)]"
                  : "border-[var(--border)] bg-[var(--card)] text-[var(--muted)] hover:bg-[var(--sidebar)]"
              }`}
            >
              <CreditCard className="w-4 h-4" /> Card Payment
            </button>
            <button
              onClick={() => setPaymentMethod("mfs")}
              className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border text-sm font-semibold transition-all ${
                paymentMethod === "mfs"
                  ? "border-[var(--color-brand-500)] bg-[var(--color-brand-500)]/10 text-[var(--color-brand-500)]"
                  : "border-[var(--border)] bg-[var(--card)] text-[var(--muted)] hover:bg-[var(--sidebar)]"
              }`}
            >
              <Smartphone className="w-4 h-4" /> Mobile Payment
            </button>
          </div>

          {/* Card Form */}
          {paymentMethod === "card" && (
            <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 mb-5">
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-1.5 block">Card Number</label>
                  <div className="relative">
                    <CreditCard className="w-4 h-4 absolute left-3 top-3 text-[var(--muted)]" />
                    <input
                      type="text"
                      value={cardNumber}
                      onChange={(e) => setCardNumber(formatCardNumber(e.target.value))}
                      placeholder="4242 4242 4242 4242"
                      maxLength={19}
                      className="w-full bg-[var(--sidebar)] border border-[var(--border)] rounded-lg py-2.5 pl-10 pr-3 text-sm font-mono focus:outline-none focus:border-[var(--color-brand-500)] transition-colors"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-1.5 block">Cardholder Name</label>
                  <input
                    type="text"
                    value={cardName}
                    onChange={(e) => setCardName(e.target.value)}
                    placeholder="John Doe"
                    className="w-full bg-[var(--sidebar)] border border-[var(--border)] rounded-lg py-2.5 px-3 text-sm focus:outline-none focus:border-[var(--color-brand-500)] transition-colors"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-1.5 block">Expiry Date</label>
                    <input
                      type="text"
                      value={expiry}
                      onChange={(e) => setExpiry(formatExpiry(e.target.value))}
                      placeholder="MM/YY"
                      maxLength={5}
                      className="w-full bg-[var(--sidebar)] border border-[var(--border)] rounded-lg py-2.5 px-3 text-sm font-mono focus:outline-none focus:border-[var(--color-brand-500)] transition-colors"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-1.5 block">CVV</label>
                    <input
                      type="password"
                      value={cvv}
                      onChange={(e) => setCvv(e.target.value.replace(/\D/g, "").slice(0, 4))}
                      placeholder="•••"
                      maxLength={4}
                      className="w-full bg-[var(--sidebar)] border border-[var(--border)] rounded-lg py-2.5 px-3 text-sm font-mono focus:outline-none focus:border-[var(--color-brand-500)] transition-colors"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* MFS Form */}
          {paymentMethod === "mfs" && (
            <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 mb-5">
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-1.5 block">Provider</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: "bkash", name: "bKash", color: "text-pink-400" },
                      { id: "nagad", name: "Nagad", color: "text-orange-400" },
                      { id: "rocket", name: "Rocket", color: "text-purple-400" },
                    ].map((p) => (
                      <button
                        key={p.id}
                        onClick={() => setMfsProvider(p.id)}
                        className={`py-2.5 rounded-lg border text-sm font-semibold transition-all ${
                          mfsProvider === p.id
                            ? `border-[var(--color-brand-500)] bg-[var(--color-brand-500)]/10 ${p.color}`
                            : "border-[var(--border)] bg-[var(--sidebar)] text-[var(--muted)] hover:bg-[var(--border)]"
                        }`}
                      >
                        {p.name}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="rounded-lg bg-[var(--sidebar)] border border-[var(--border)] p-3 text-xs text-[var(--muted)]">
                  <p className="font-semibold text-[var(--foreground)] mb-1">Payment Instructions:</p>
                  <ol className="list-decimal list-inside space-y-1">
                    <li>Send <span className="font-bold text-[var(--color-brand-500)]">{price}</span> to merchant number <span className="font-mono font-bold text-[var(--foreground)]">01XXXXXXXXX</span></li>
                    <li>Use "Payment" as reference</li>
                    <li>Enter your number and Transaction ID below</li>
                  </ol>
                </div>

                <div>
                  <label className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-1.5 block">Your Mobile Number</label>
                  <div className="relative">
                    <Smartphone className="w-4 h-4 absolute left-3 top-3 text-[var(--muted)]" />
                    <input
                      type="text"
                      value={mfsNumber}
                      onChange={(e) => setMfsNumber(e.target.value.replace(/[^\d+]/g, "").slice(0, 14))}
                      placeholder="01XXXXXXXXX"
                      className="w-full bg-[var(--sidebar)] border border-[var(--border)] rounded-lg py-2.5 pl-10 pr-3 text-sm font-mono focus:outline-none focus:border-[var(--color-brand-500)] transition-colors"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-1.5 block">Transaction ID</label>
                  <input
                    type="text"
                    value={mfsTrxId}
                    onChange={(e) => setMfsTrxId(e.target.value)}
                    placeholder="e.g. TRX1234ABCD"
                    className="w-full bg-[var(--sidebar)] border border-[var(--border)] rounded-lg py-2.5 px-3 text-sm font-mono focus:outline-none focus:border-[var(--color-brand-500)] transition-colors"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Pay Button */}
          <button
            onClick={handlePayment}
            disabled={processing}
            className="w-full py-3 rounded-xl text-sm font-bold bg-[var(--color-brand-500)] hover:bg-[var(--color-brand-600)] text-white transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {processing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Processing Payment...
              </>
            ) : (
              <>
                <Lock className="w-4 h-4" /> Pay {price}/{interval === "yearly" ? "year" : "month"}
              </>
            )}
          </button>

          {/* Security badge */}
          <div className="flex items-center justify-center gap-2 mt-4 text-xs text-[var(--muted)]">
            <Shield className="w-3.5 h-3.5" />
            <span>Secure & encrypted payment</span>
          </div>
        </div>
      </div>
    </div>
  );
}
