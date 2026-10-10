import type { Page } from "@playwright/test";
import type { DraftView } from "../../src/features/portfolio/model";

export function initialDraft(): DraftView {
  return {
    id: "33333333-3333-4333-8333-333333333333",
    slug: "ui-writer",
    revision: 0,
    publishedRevision: null,
    isPublic: false,
    aiConsent: false,
    updatedAt: "2026-10-10T00:00:00Z",
    document: {
      profile: {
        name: "작성자",
        title: "",
        introduction: "",
        about: null,
        imageId: null,
        bannerImageId: null,
        contacts: [],
      },
      skills: [],
      projects: [],
      history: [],
      certifications: [],
      sections: [
        { id: "skills", visible: true },
        { id: "projects", visible: true },
        { id: "history", visible: true },
        { id: "certifications", visible: true },
      ],
      template: "swiss",
    },
  };
}

export async function identity(page: Page) {
  await page.route("**/api/portfolio/designs", (route) =>
    route.fulfill({
      json: [
        {
          id: "swiss",
          title: "Swiss Editorial Portfolio",
          enabled: true,
          implemented: true,
          isDefault: true,
        },
        {
          id: "hud",
          title: "Dark Futuristic HUD Portfolio",
          enabled: true,
          implemented: true,
          isDefault: false,
        },
        ...[
          ["google-flat", "Google-inspired Flat Portfolio"],
          ["modern-flat", "Modern Flat Minimal Portfolio"],
          ["premium-dark", "Premium Dark Minimal Portfolio"],
        ].map(([id, title]) => ({ id, title, enabled: true, implemented: true, isDefault: false })),
      ],
    }),
  );
  // These responses isolate browser editing; persistence and authorization use PostgreSQL tests.
  await page.route("**/api/session", (route) =>
    route.fulfill({
      json: {
        member: {
          id: "11111111-1111-4111-8111-111111111111",
          issuer: "https://issuer.example.test",
          subject: "writer-test",
          displayName: "작성자",
          suspended: false,
          aiAllowed: false,
          joinedAt: "2026-10-01T00:00:00Z",
        },
        admin: false,
        csrfToken: "ui-test-csrf",
      },
    }),
  );
}
