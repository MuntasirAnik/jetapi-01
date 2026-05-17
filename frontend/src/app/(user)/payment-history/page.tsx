"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import {
  CreditCard, Smartphone, ChevronLeft, ChevronRight,
  Calendar,
  Receipt,
} from "lucide-react";
import UserSidebar from "@/components/UserSidebar";

const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export default function PaymentHistoryPage() {
  const router = useRouter();
  const [payments, setPayments] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [loading, setLoading] = useState(true);

  const loadPayments = async (y: number, m: number) => {
    setLoading(true);
    try {
      const res = await apiFetch(`/subscriptions/payments?year=${y}&month=${m}`);
      if (res.ok) {
        const data = await res.json();
        setPayments(data.payments || []);
        setTotal(data.total || 0);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPayments(year, month);
  }, [year, month]);

  const handlePrev = () => {
    if (month === 1) { setMonth(12); setYear(year - 1); }
    else setMonth(month - 1);
  };

  const handleNext = () => {
    if (month === 12) { setMonth(1); setYear(year + 1); }
    else setMonth(month + 1);
  };

  return (
    <div className="flex h-full w-full overflow-hidden">
      <UserSidebar activePage="payment-history" />

      {/* Main Content */}
      <div className="flex-1 overflow-auto bg-[var(--background)]">
        <div className="max-w-3xl mx-auto px-6 py-6">
          <h1 className="text-2xl font-bold mb-1">Payment History</h1>
          <p className="text-[var(--muted)] text-sm mb-5">Your transaction records</p>

          {/* Month Navigator + Summary */}
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <button onClick={handlePrev} className="p-2 rounded-lg hover:bg-[var(--card)] text-[var(--muted)] hover:text-[var(--foreground)] transition-colors border border-[var(--border)]">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <div className="flex items-center gap-2 min-w-[120px] justify-center">
                <Calendar className="w-4 h-4 text-[var(--muted)]" />
                <span className="text-sm font-bold">{monthNames[month - 1]} {year}</span>
              </div>
              <button onClick={handleNext} className="p-2 rounded-lg hover:bg-[var(--card)] text-[var(--muted)] hover:text-[var(--foreground)] transition-colors border border-[var(--border)]">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center gap-5">
              <div className="text-right">
                <p className="text-[10px] font-semibold text-[var(--muted)] uppercase tracking-wider">Total Spent</p>
                <p className="text-lg font-black text-green-400">${total}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-semibold text-[var(--muted)] uppercase tracking-wider">Transactions</p>
                <p className="text-lg font-black">{payments.length}</p>
              </div>
            </div>
          </div>

          {/* Payments List */}
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-6 h-6 border-2 border-[var(--color-brand-500)] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : payments.length === 0 ? (
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-12 text-center">
              <Receipt className="w-10 h-10 text-[var(--muted)] mx-auto mb-3 opacity-40" />
              <p className="text-sm font-semibold text-[var(--muted)]">No payments for {monthNames[month - 1]} {year}</p>
              <p className="text-xs text-[var(--muted)] mt-1">Payments will appear here after you complete a transaction</p>
            </div>
          ) : (
            <div className="space-y-2">
              {payments.map((p: any) => (
                <div key={p.id} className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 flex items-center justify-between hover:border-[var(--color-brand-500)]/30 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-[var(--sidebar)]">
                      {p.method === "card" ? (
                        <CreditCard className="w-4 h-4 text-[var(--muted)]" />
                      ) : (
                        <Smartphone className="w-4 h-4 text-[var(--muted)]" />
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-semibold">
                        {p.plan} Plan
                        <span className={`ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded ${
                          p.plan === "PRO" ? "bg-violet-500/20 text-violet-400" :
                          p.plan === "TEAM" ? "bg-amber-500/20 text-amber-400" :
                          "bg-[var(--sidebar)] text-[var(--foreground)]"
                        }`}>
                          {p.billingInterval || "monthly"}
                        </span>
                      </p>
                      <p className="text-xs text-[var(--muted)] mt-0.5">
                        {new Date(p.createdAt).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
                        {" · "}
                        {new Date(p.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-xs text-[var(--muted)] capitalize flex items-center gap-1 justify-end">
                        {p.method === "card" ? (
                          <>
                            <CreditCard className="w-3 h-3" />
                            {p.cardLast4 ? `****${p.cardLast4}` : "Card"}
                          </>
                        ) : (
                          <>
                            <Smartphone className="w-3 h-3" />
                            {p.mfsProvider || "MFS"}
                          </>
                        )}
                      </p>
                      {p.method === "mfs" && p.transactionId && (
                        <p className="text-[10px] text-[var(--muted)] font-mono">TrxID: {p.transactionId}</p>
                      )}
                    </div>
                    <span className="text-base font-black text-green-400 min-w-[60px] text-right">{p.amount}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
