"use client";
import { useRouter } from "next/navigation";
import {
  User, Activity, Folder, Users, CreditCard, BarChart3,
  Receipt, ChevronLeft, LogOut, Tag, ShieldCheck,
} from "lucide-react";

interface UserSidebarProps {
  activePage: "profile" | "billing" | "reports" | "payment-history" | "pricing";
  userName?: string;
  /** Profile sub-tab support */
  activeTab?: string;
  onTabChange?: (tab: string) => void;
}

export default function UserSidebar({ activePage, userName, activeTab, onTabChange }: UserSidebarProps) {
  const router = useRouter();

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    router.push("/login");
  };

  const navItems = [
    { id: "profile", label: "Profile", icon: User, href: "/profile" },
    { id: "billing", label: "Billing & Subscription", icon: CreditCard, href: "/billing" },
    { id: "reports", label: "My Reports", icon: BarChart3, href: "/reports" },
    { id: "payment-history", label: "Payment History", icon: Receipt, href: "/payment-history" },
    { id: "pricing", label: "Pricing Plans", icon: Tag, href: "/pricing" },
  ];

  const profileSubTabs = [
    { id: "overview", label: "Overview", icon: Activity },
    { id: "collections", label: "My Collections", icon: Folder },
    { id: "access", label: "Access Control", icon: Users },
  ];

  return (
    <div className="w-64 border-r border-[var(--border)] bg-[var(--sidebar)] flex flex-col p-4 flex-shrink-0">
      <div className="mb-8 pl-2">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <User className="w-5 h-5 text-[var(--color-brand-500)]" />
          <span className="truncate">{userName || "My Account"}</span>
        </h1>
        <p className="text-xs text-[var(--muted)] ml-7 mt-0.5">Manage your account</p>
      </div>

      <nav className="flex flex-col gap-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activePage === item.id;
          return (
            <div key={item.id}>
              <button
                onClick={() => {
                  if (item.id === "profile" && activePage === "profile" && onTabChange) {
                    onTabChange("overview");
                  } else {
                    router.push(item.href);
                  }
                }}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-md font-medium text-sm transition-colors ${
                  isActive
                    ? "bg-[var(--card)] text-[var(--color-brand-500)] shadow-sm"
                    : "hover:bg-[var(--card)] text-[var(--muted)]"
                }`}
              >
                <Icon className="w-4 h-4" /> {item.label}
              </button>

              {/* Profile sub-tabs */}
              {item.id === "profile" && isActive && onTabChange && (
                <div className="ml-5 mt-1 mb-1 flex flex-col gap-0.5 border-l-2 border-[var(--border)] pl-3">
                  {profileSubTabs.map((sub) => {
                    const SubIcon = sub.icon;
                    const isSubActive = activeTab === sub.id;
                    return (
                      <button
                        key={sub.id}
                        onClick={() => onTabChange(sub.id)}
                        className={`flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-medium transition-colors ${
                          isSubActive
                            ? "text-[var(--color-brand-500)] bg-[var(--color-brand-500)]/5"
                            : "text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--card)]"
                        }`}
                      >
                        <SubIcon className="w-3.5 h-3.5" /> {sub.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <div className="mt-auto flex flex-col gap-2">
        <button
          onClick={() => router.push("/")}
          className="text-sm text-[var(--muted)] hover:text-[var(--foreground)] flex items-center gap-2 border-t border-[var(--border)] pt-4 px-2"
        >
          <ChevronLeft className="w-4 h-4" /> Back to App
        </button>
        <button
          onClick={handleLogout}
          className="text-sm text-red-500 hover:text-white hover:bg-red-500 flex items-center gap-2 px-2 py-2 rounded transition-colors mt-1"
        >
          <LogOut className="w-4 h-4" /> Sign Out
        </button>
      </div>
    </div>
  );
}
