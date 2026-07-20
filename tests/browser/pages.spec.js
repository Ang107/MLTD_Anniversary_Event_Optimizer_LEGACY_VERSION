import { expect, test } from "@playwright/test";

const STUBBED_EXTERNAL_ORIGINS = new Set([
  "https://fonts.googleapis.com",
  "https://fonts.gstatic.com",
  "https://static.cloudflareinsights.com",
  "https://www.googletagmanager.com",
]);
const runtimeProblems = new WeakMap();

function localOriginFrom(baseURL) {
  if (!baseURL) {
    throw new Error("Playwrightのuse.baseURLを設定してください");
  }
  return new URL(baseURL).origin;
}

function monitorRuntime(page, baseURL) {
  const problems = runtimeProblems.get(page) ?? [];
  const localOrigin = localOriginFrom(baseURL);

  page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") problems.push(`console: ${message.text()}`);
  });
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (url.origin === localOrigin && response.status() >= 400) {
      problems.push(`HTTP ${response.status()}: ${url.pathname}`);
    }
  });
  page.on("requestfailed", (request) => {
    const url = new URL(request.url());
    if (url.origin === localOrigin) {
      problems.push(`request failed: ${url.pathname} (${request.failure()?.errorText || "unknown"})`);
    }
  });

  return problems;
}

async function expectNoRuntimeProblems(page, problems) {
  await page.waitForLoadState("networkidle");
  expect(
    problems,
    `ページの初期化中に問題が発生しました:\n${problems.join("\n")}`,
  ).toEqual([]);
}

test.beforeEach(async ({ page, baseURL }) => {
  const localOrigin = localOriginFrom(baseURL);
  const problems = [];
  runtimeProblems.set(page, problems);

  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.protocol.startsWith("http") && url.origin !== localOrigin) {
      if (STUBBED_EXTERNAL_ORIGINS.has(url.origin)) {
        await route.fulfill({ status: 204, body: "" });
        return;
      }

      problems.push(`unexpected external request: ${url.href}`);
      await route.abort("blockedbyclient");
      return;
    }
    await route.continue();
  });
});

test("オプティマイザーを初期化できる", async ({ page, baseURL }) => {
  const problems = monitorRuntime(page, baseURL);
  await page.goto("/index.html");

  await expect(page.locator("#runBtn")).toBeVisible();
  await expect(page.locator("#optionGrid .group")).not.toHaveCount(0);
  await expect(page.locator("#recTable select")).toHaveCount(52);
  await expectNoRuntimeProblems(page, problems);
});

test("プレイカウンターを初期化できる", async ({ page, baseURL }) => {
  const problems = monitorRuntime(page, baseURL);
  await page.goto("/tools-counter.html");

  await expect(page.locator("#counterApp .counter-panel").first()).toBeVisible();
  await expect(page.locator("#counterApp button").first()).toBeVisible();
  await expectNoRuntimeProblems(page, problems);
});

test("最終日ツールを初期化できる", async ({ page, baseURL }) => {
  const problems = monitorRuntime(page, baseURL);
  await page.goto("/tools-final-day.html");

  await expect(page.locator("#finalDayApp input").first()).toBeVisible();
  await expect(page.locator("#fdCalcBtn")).toBeVisible();
  await expectNoRuntimeProblems(page, problems);
});

test("バージョン一覧を取得して表示できる", async ({ page, baseURL }) => {
  const problems = monitorRuntime(page, baseURL);
  await page.goto("/versions.html");

  await expect(page.locator("#versionList .version-card").first()).toBeVisible();
  await expectNoRuntimeProblems(page, problems);
});

test("使い方動画を安全な新しいタブで開ける", async ({ page, baseURL }) => {
  const problems = monitorRuntime(page, baseURL);
  await page.goto("/index.html");
  await page.evaluate(() => {
    window.__videoClickDefaultPrevented = null;
    window.__trackedEvents = [];
    window.gtag = (...args) => window.__trackedEvents.push(args);
    document.addEventListener("click", (event) => {
      if (!event.target.closest(".nav-video-link")) return;
      window.__videoClickDefaultPrevented = event.defaultPrevented;
      event.preventDefault();
    }, { once: true });
  });

  const link = page.locator(".nav-video-link");
  await expect(link).toHaveAttribute("target", "_blank");
  await expect(link).toHaveAttribute("rel", "noopener noreferrer");
  await link.click();

  expect(await page.evaluate(() => window.__videoClickDefaultPrevented)).toBe(false);
  expect(await page.evaluate(() => window.__trackedEvents)).toContainEqual([
    "event",
    "video_link_click",
    undefined,
  ]);
  await expectNoRuntimeProblems(page, problems);
});
