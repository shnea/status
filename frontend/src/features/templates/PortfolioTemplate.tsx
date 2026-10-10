"use client";

import type { ComponentType } from "react";
import type { TemplateProps } from "./model";
import { SwissPortfolio } from "./swiss/SwissPortfolio";
import { HudPortfolio } from "./hud/HudPortfolio";
import { GoogleFlatPortfolio } from "./google-flat/GoogleFlatPortfolio";
import { ModernFlatPortfolio } from "./modern-flat/ModernFlatPortfolio";
import { PremiumDarkPortfolio } from "./premium-dark/PremiumDarkPortfolio";

const templates = new Map<string, ComponentType<TemplateProps>>([
  ["swiss", SwissPortfolio],
  ["hud", HudPortfolio],
  ["google-flat", GoogleFlatPortfolio],
  ["modern-flat", ModernFlatPortfolio],
  ["premium-dark", PremiumDarkPortfolio],
]);

export function PortfolioTemplate(props: TemplateProps) {
  const Component = templates.get(props.document.template) || SwissPortfolio;

  return <Component {...props} />;
}
