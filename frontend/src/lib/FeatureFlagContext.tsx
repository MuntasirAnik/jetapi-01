"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";

type FeatureFlags = {
  allow_signups: boolean;
  allow_api_execution: boolean;
  show_pricing: boolean;
  allow_subscriptions: boolean;
  require_email_verification: boolean;
  allow_collection_upload: boolean;
  allow_variable_upload: boolean;
  show_announcements: boolean;
  [key: string]: boolean;
};

const DEFAULT_FLAGS: FeatureFlags = {
  allow_signups: true,
  allow_api_execution: true,
  show_pricing: true,
  allow_subscriptions: true,
  require_email_verification: false,
  allow_collection_upload: true,
  allow_variable_upload: true,
  show_announcements: true,
};

const FeatureFlagContext = createContext<FeatureFlags>(DEFAULT_FLAGS);

export function FeatureFlagProvider({ children }: { children: ReactNode }) {
  const [flags, setFlags] = useState<FeatureFlags>(() => {
    try {
      const cached = localStorage.getItem('jetapi_feature_flags');
      if (cached) return { ...DEFAULT_FLAGS, ...JSON.parse(cached) };
    } catch {}
    return DEFAULT_FLAGS;
  });

  useEffect(() => {
    const load = async () => {
      try {
        const API = process.env.NEXT_PUBLIC_API_URL ?? '';
        const res = await fetch(`${API}/api/feature-flags`);
        if (res.ok) {
          const data = await res.json();
          const merged = { ...DEFAULT_FLAGS, ...data };
          setFlags(merged);
          localStorage.setItem('jetapi_feature_flags', JSON.stringify(merged));
        }
      } catch {}
    };
    // Defer — cached flags are already loaded from localStorage above
    const initialDelay = setTimeout(load, 1000);
    const interval = setInterval(load, 60000);
    return () => { clearTimeout(initialDelay); clearInterval(interval); };
  }, []);

  return (
    <FeatureFlagContext.Provider value={flags}>
      {children}
    </FeatureFlagContext.Provider>
  );
}

export function useFeatureFlags() {
  return useContext(FeatureFlagContext);
}
