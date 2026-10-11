import { expect, test } from "@playwright/test";
import { identity, initialDraft } from "./fixtures/workspace";
import { swissSample } from "../src/features/templates/swiss/sample";

test("Premium gives long sections room and pairs only adjacent compact sections in the authored order", async ({
  page,
}) => {
  await identity(page);
  const draft = initialDraft();
  draft.document = structuredClone(swissSample);
  draft.document.template = "premium-dark";
  draft.document.profile.about = {
    format: "shnea-editor",
    version: 3,
    content: {
      type: "doc",
      content: Array.from({ length: 6 }, (_, index) => ({
        type: "paragraph",
        content: [
          {
            type: "text",
            text:
              "자기소개 문단 " +
              index +
              ". " +
              "서비스의 데이터와 권한을 설계하고 안정적으로 운영합니다. ".repeat(4),
          },
        ],
      })),
    },
  };
  draft.document.history = Array.from({ length: 4 }, (_, index) => ({
    ...structuredClone(swissSample.history[0]),
    id: "premium-history-" + index,
    title: "서비스 개발 " + index,
    summary: "상담 이력과 고객 정보를 관리하는 서비스를 개발했습니다. ".repeat(5),
  }));
  draft.document.projects = Array.from({ length: 13 }, (_, index) => ({
    ...structuredClone(swissSample.projects[0]),
    id: "premium-project-" + index,
    title: "프로젝트 " + (index + 1),
  }));
  draft.document.sections = [
    { id: "about", visible: true },
    { id: "history", visible: true },
    { id: "skills", visible: true },
    { id: "projects", visible: true },
    { id: "certifications", visible: true },
  ];
  await page.route("**/api/portfolio", (route) => route.fulfill({ json: draft }));
  await page.goto("/preview");
  await expect(page.locator("#about")).toContainText("자기소개 문단 5");
  await expect(page.locator("#history article")).toHaveCount(4);
  await expect(page.locator("#projects article")).toHaveCount(13);
  expect(
    await page
      .locator("main section[id]")
      .evaluateAll((sections) => sections.map((section) => section.id)),
  ).toEqual(["about", "history", "skills", "projects", "certifications"]);

  const widths = await page
    .locator("main section[id]")
    .evaluateAll((sections) =>
      sections.map((section) => Math.round(section.getBoundingClientRect().width)),
    );

  expect(new Set(widths).size).toBe(1);
  await page.screenshot({
    path: "/artifacts/premium-long-layout-" + test.info().project.name + ".png",
    fullPage: true,
  });

  draft.document.profile.about = structuredClone(swissSample.profile.about);
  draft.document.history = structuredClone(swissSample.history);
  draft.document.sections = [
    { id: "projects", visible: true },
    { id: "about", visible: true },
    { id: "skills", visible: true },
    { id: "history", visible: true },
    { id: "certifications", visible: true },
  ];
  await page.reload();
  await expect(page.locator("#about")).not.toContainText("자기소개 문단 5");
  expect(
    await page
      .locator("main section[id]")
      .evaluateAll((sections) => sections.map((section) => section.id)),
  ).toEqual(["projects", "about", "skills", "history", "certifications"]);
  const projects = await page.locator("#projects").boundingBox();
  const about = await page.locator("#about").boundingBox();
  const skills = await page.locator("#skills").boundingBox();
  const history = await page.locator("#history").boundingBox();
  const certifications = await page.locator("#certifications").boundingBox();

  expect(projects && about && skills && history && certifications).toBeTruthy();

  if (!projects || !about || !skills || !history || !certifications)
    throw new Error("Missing portfolio section");

  if (test.info().project.name === "desktop") {
    expect(about.width).toBeLessThan(projects.width * 0.6);
    expect(Math.abs(about.y - skills.y)).toBeLessThan(1);
    expect(Math.abs(history.y - certifications.y)).toBeLessThan(1);
    expect(Math.abs(about.height - skills.height)).toBeGreaterThan(1);
    expect(history.y - Math.max(about.y + about.height, skills.y + skills.height)).toBeLessThan(24);
  } else {
    expect(about.width).toBe(projects.width);
    expect(skills.y).toBeGreaterThan(about.y + about.height);
  }

  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
