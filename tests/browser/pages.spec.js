import { expect, test } from "@playwright/test";

function localOriginFrom(baseURL) {
  if (!baseURL) {
    throw new Error("Playwrightのuse.baseURLを設定してください");
  }
  return new URL(baseURL).origin;
}

function monitorRuntime(page, baseURL) {
  const problems = [];
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

test.beforeEach(async ({ page, baseURL }) => {
  const localOrigin = localOriginFrom(baseURL);
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.protocol.startsWith("http") && url.origin !== localOrigin) {
      await route.fulfill({ status: 204, body: "" });
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
  expect(problems).toEqual([]);
});

test("プレイカウンターを初期化できる", async ({ page, baseURL }) => {
  const problems = monitorRuntime(page, baseURL);
  await page.goto("/tools-counter.html");

  await expect(page.locator("#counterApp .counter-panel").first()).toBeVisible();
  await expect(page.locator("#counterApp button").first()).toBeVisible();
  expect(problems).toEqual([]);
});

test("最終日ツールを初期化できる", async ({ page, baseURL }) => {
  const problems = monitorRuntime(page, baseURL);
  await page.goto("/tools-final-day.html");

  await expect(page.locator("#finalDayApp input").first()).toBeVisible();
  await expect(page.locator("#fdCalcBtn")).toBeVisible();
  expect(problems).toEqual([]);
});

test("バージョン一覧を取得して表示できる", async ({ page, baseURL }) => {
  const problems = monitorRuntime(page, baseURL);
  await page.goto("/versions.html");

  await expect(page.locator("#versionList .version-card").first()).toBeVisible();
  expect(problems).toEqual([]);
});
