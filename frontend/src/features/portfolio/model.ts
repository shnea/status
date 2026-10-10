import type { EditorDocument } from "@shnea/editor";

export interface IconRef {
  provider: string;
  key: string;
  hex: string;
  monochromeAllowed: boolean;
}

export interface Contact {
  id: string;
  type: "web" | "email" | "phone";
  label: string;
  value: string;
  icon: string;
  visible: boolean;
}

export interface Profile {
  name: string;
  title: string;
  introduction: string;
  about: EditorDocument | null;
  imageId: string | null;
  bannerImageId: string | null;
  contacts: Contact[];
}

export interface Skill {
  id: string;
  name: string;
  category: string;
  icon: IconRef;
  featured: boolean;
}

export interface Project {
  id: string;
  title: string;
  role: string;
  summary: string;
  imageId: string | null;
  skillIds: string[];
  links: Contact[];
  content: EditorDocument | null;
  visible: boolean;
}

export interface History {
  id: string;
  title: string;
  organization: string;
  role: string;
  summary: string;
  startMonth: string;
  endMonth: string;
  ongoing: boolean;
  content: EditorDocument | null;
  visible: boolean;
}

export interface Certification {
  id: string;
  name: string;
  issuer: string;
  issuedOn: string;
  expiresOn: string;
  credentialId: string;
  credentialIdVisible: boolean;
  url: string;
  visible: boolean;
}

export interface SectionSetting {
  id: "skills" | "projects" | "history" | "certifications";
  visible: boolean;
}

export interface PortfolioDocument {
  profile: Profile;
  skills: Skill[];
  projects: Project[];
  history: History[];
  certifications: Certification[];
  sections: SectionSetting[];
  template: string;
}

export interface DraftView {
  id: string;
  slug: string;
  document: PortfolioDocument;
  revision: number;
  publishedRevision: number | null;
  isPublic: boolean;
  aiConsent: boolean;
  updatedAt: string;
}

export interface PublicPortfolio {
  id: string;
  slug: string;
  canonicalSlug: string;
  document: PortfolioDocument;
  revision: number;
  aiEnabled: boolean;
}

export interface Member {
  id: string;
  issuer: string;
  subject: string;
  displayName: string;
  suspended: boolean;
  aiAllowed: boolean;
  joinedAt: string;
}

export interface SessionView {
  member: Member | null;
  admin: boolean;
  csrfToken: string;
}

export interface SearchPage<T> {
  items: T[];
  hasMore: boolean;
}

export function initials(name: string): string {
  const words = name.trim().match(/[A-Z][a-z]*|[a-z]+|[0-9]+|[가-힣]+/g) ?? [];

  if (words.length > 1) {
    return words
      .slice(0, 2)
      .map((word) => word[0])
      .join("")
      .toUpperCase();
  }

  return (name.trim().slice(0, 2) || "?").toUpperCase();
}

const sorter = new Intl.Collator("ko", { numeric: true, sensitivity: "base" });

export function sortedSkills(skills: Skill[]): Skill[] {
  return [...skills].sort((first, second) => {
    if (first.category === "기타" && second.category !== "기타") return 1;

    if (second.category === "기타" && first.category !== "기타") return -1;

    return (
      sorter.compare(first.category, second.category) || sorter.compare(first.name, second.name)
    );
  });
}

export function contactHref(contact: Contact): string {
  if (contact.type === "email") return "mailto:" + contact.value;

  if (contact.type === "phone") return "tel:" + contact.value.replace(/[() .-]/g, "");

  return contact.value;
}
