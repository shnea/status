import type { JSONContent } from "@tiptap/core";
import type { PortfolioDocument, Project } from "@/features/portfolio/model";
import { orderedSections } from "@/features/portfolio/model";
import { hasContent } from "@/features/content/RichContent";

export interface DesignSetting {
  id: string;
  title: string;
  enabled: boolean;
  implemented: boolean;
  isDefault: boolean;
}

export interface TemplateProps {
  document: PortfolioDocument;
  slug: string;
  portfolioId: string;
  preview?: boolean;
  sample?: boolean;
  initialProject?: Project;
  aiEnabled?: boolean;
}

export const sectionNames = {
  about: "자기소개",
  skills: "스킬",
  projects: "프로젝트",
  history: "히스토리",
  certifications: "자격 · 인증",
};

export function portfolioSections(document: PortfolioDocument) {
  return orderedSections(document).filter((section) => {
    if (!section.visible) return false;

    switch (section.id) {
      case "about":
        return hasContent(document.profile.about);
      case "skills":
        return document.skills.length > 0;
      case "projects":
        return document.projects.some((item) => item.visible);
      case "history":
        return document.history.some((item) => item.visible);
      case "certifications":
        return document.certifications.some((item) => item.visible);
    }
  });
}

function nodeText(node: JSONContent): string {
  if (node.type === "hardBreak") return " ";

  if (node.text) return node.text;

  return (node.content || []).map(nodeText).join("");
}

function firstParagraph(nodes: JSONContent[]): string {
  for (const node of nodes) {
    if (node.type === "paragraph") {
      const text = nodeText(node).trim();

      if (text) return text;
    } else if (node.content) {
      const text = firstParagraph(node.content);

      if (text) return text;
    }
  }

  return "";
}

export function profileExcerpt(about: PortfolioDocument["profile"]["about"]): string {
  return firstParagraph(about?.content.content || []);
}

export const samplePaths = new Map([
  ["swiss", "/design-preview/swiss"],
  ["hud", "/design-preview/hud"],
  ["google-flat", "/design-preview/google-flat"],
  ["modern-flat", "/design-preview/modern-flat"],
  ["premium-dark", "/design-preview/premium-dark"],
]);

export const templateTitles = new Map([
  ["swiss", "Swiss Editorial Portfolio"],
  ["hud", "Dark Futuristic HUD Portfolio"],
  ["google-flat", "Google-inspired Flat Portfolio"],
  ["modern-flat", "Modern Flat Minimal Portfolio"],
  ["premium-dark", "Premium Dark Minimal Portfolio"],
]);
