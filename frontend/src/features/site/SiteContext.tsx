"use client";

import { createContext, useContext } from "react";
import { defaultSiteSettings, type PublicSiteSettings } from "./model";

const SiteContext = createContext<PublicSiteSettings>(defaultSiteSettings);

export function SiteProvider({
  value,
  children,
}: {
  value: PublicSiteSettings;
  children: React.ReactNode;
}) {
  return <SiteContext.Provider value={value}>{children}</SiteContext.Provider>;
}

export function useSiteSettings() {
  return useContext(SiteContext);
}
