import { expect, test } from "@playwright/test";
import { identity, initialDraft } from "./fixtures/workspace";

for (const outcome of ["renewed", "changed-account", "denied", "still-invalid"] as const) {
  test("project image upload handles session " + outcome, async ({ page }) => {
    await identity(page);
    let stored = initialDraft();
    const owner = "11111111-1111-4111-8111-111111111111";
    const imageId = "88888888-8888-4888-8888-888888888888";
    let rotated = false;
    let sessionReads = 0;
    let uploads = 0;
    let acceptedSaves = 0;
    const requestIds: string[] = [];

    const image = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jIuoAAAAASUVORK5CYII=",
      "base64",
    );

    await page.route("**/api/session", (route) => {
      sessionReads += 1;

      return route.fulfill({
        json: {
          member: {
            id: rotated && outcome === "changed-account" ? "another-owner" : owner,
            displayName: "작성자",
            suspended: false,
            aiAllowed: false,
          },
          admin: false,
          csrfToken: rotated ? "fresh-token" : "old-token",
        },
      });
    });
    await page.route("**/api/portfolio", (route) => {
      if (route.request().method() === "PUT") {
        if (rotated && route.request().headers()["x-csrf-token"] !== "fresh-token") {
          return route.fulfill({
            status: 403,
            json: { code: "CSRF_TOKEN_INVALID", message: "로그인 정보가 갱신되었습니다." },
          });
        }

        acceptedSaves += 1;
        stored = {
          ...stored,
          revision: stored.revision + 1,
          document: route.request().postDataJSON().document,
        };
      }

      return route.fulfill({ json: stored });
    });
    await page.route("**/api/files", (route) => {
      uploads += 1;

      const requestId = route
        .request()
        .postData()
        ?.match(/name="requestId"\r?\n\r?\n([^\r\n]+)/)?.[1];

      if (!requestId) throw new Error("Upload request ID missing");
      requestIds.push(requestId);

      if (outcome === "denied") {
        return route.fulfill({
          status: 403,
          json: { code: "ACCESS_DENIED", message: "이 요청을 실행할 권한이 없습니다." },
        });
      }

      if (!rotated || outcome === "still-invalid") {
        rotated = true;

        return route.fulfill({
          status: 403,
          json: { code: "CSRF_TOKEN_INVALID", message: "로그인 정보가 갱신되었습니다." },
        });
      }

      expect(route.request().headers()["x-csrf-token"]).toBe("fresh-token");

      return route.fulfill({
        json: {
          fileId: imageId,
          scope: owner,
          kind: "image",
          name: "cover.png",
          size: image.length,
        },
      });
    });
    await page.route("**/api/files/*/views", (route) =>
      route.fulfill({
        json: {
          fileId: imageId,
          kind: "IMAGE",
          state: "READY",
          previewUrl: "/api/files/" + imageId + "/content/preview",
        },
      }),
    );
    await page.route("**/api/files/*/content/preview", (route) =>
      route.fulfill({ contentType: "image/png", body: image }),
    );

    await page.goto("/dashboard");
    await page.getByRole("button", { name: "03 프로젝트", exact: true }).click();
    await page.getByRole("button", { name: "프로젝트 추가", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "프로젝트 수정" });
    await dialog.getByLabel("프로젝트명", { exact: true }).fill("입력 내용 유지");
    const field = dialog.getByRole("region", { name: "대표 이미지", exact: true });
    const readsBefore = sessionReads;
    await field
      .getByLabel("대표 이미지 파일", { exact: true })
      .setInputFiles({ name: "cover.png", mimeType: "image/png", buffer: image });

    if (outcome === "renewed") {
      await expect(field.getByAltText("대표 이미지", { exact: true })).toHaveAttribute(
        "src",
        "/api/files/" + imageId + "/content/preview",
      );
      expect(uploads).toBe(2);
      expect(requestIds[1]).toBe(requestIds[0]);
      await dialog.getByRole("button", { name: "닫기", exact: true }).click();
      await page.getByRole("button", { name: "임시저장", exact: true }).click();
      await expect(page.getByRole("status", { name: "저장 상태" })).toHaveText("임시저장됨");
      expect(stored.document.projects[0].imageId).toBe(imageId);
      expect(stored.document.projects[0].title).toBe("입력 내용 유지");
      expect(acceptedSaves).toBeGreaterThan(0);
    } else {
      const message =
        outcome === "changed-account"
          ? "로그인 계정이 변경되었습니다."
          : outcome === "denied"
            ? "이 요청을 실행할 권한이 없습니다."
            : "로그인 정보가 갱신되었습니다.";

      await expect(field.getByRole("alert")).toContainText(message);
      await expect(dialog.getByLabel("프로젝트명", { exact: true })).toHaveValue("입력 내용 유지");
      await expect(field.getByAltText("대표 이미지", { exact: true })).toHaveCount(0);
      expect(uploads).toBe(outcome === "still-invalid" ? 2 : 1);

      if (outcome === "denied") expect(sessionReads).toBe(readsBefore);

      if (outcome === "changed-account") expect(acceptedSaves).toBe(0);
    }
  });
}
