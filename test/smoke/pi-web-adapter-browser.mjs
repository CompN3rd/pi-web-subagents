// Real browser, built adapter, fake public host/peer. Never a live PI WEB test.
// Build the standalone adapter first. Install Playwright separately, then set
// PI_WEB_SMOKE_PLAYWRIGHT_ROOT to that package and optionally
// PI_WEB_SMOKE_BROWSER_EXECUTABLE to an installed browser executable.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const playwrightRoot = process.env.PI_WEB_SMOKE_PLAYWRIGHT_ROOT;
assert.ok(
  playwrightRoot,
  "Set PI_WEB_SMOKE_PLAYWRIGHT_ROOT to a separately installed playwright package",
);
const { chromium } = await import(
  pathToFileURL(join(playwrightRoot, "index.mjs")).href
);
const { build } = await import(
  new URL(
    "../../node_modules/esbuild/lib/main.js",
    import.meta.url,
  ).href
);
const artifacts = await mkdtemp(join(tmpdir(), "pi-web-adapter-browser-"));
await build({
  entryPoints: [
    fileURLToPath(
      new URL("pi-web-adapter-browser-fixture.ts", import.meta.url),
    ),
  ],
  outfile: join(artifacts, "fixture.js"),
  bundle: true,
  format: "esm",
  platform: "browser",
});
const server = createServer(async (request, response) => {
  if (request.url === "/fixture.js") {
    response.setHeader("content-type", "text/javascript");
    response.end(await readFile(join(artifacts, "fixture.js")));
  } else if (request.url === "/") {
    response.setHeader("content-type", "text/html");
    response.end(
      '<!doctype html><meta charset="utf-8"><title>Isolated Subagents Acceptance</title><style>body{margin:24px;background:#151820;color:#e4e8ee;font:15px system-ui}body>div{max-width:980px;margin:auto}</style><script type="module" src="/fixture.js"></script>',
    );
  } else {
    response.statusCode = 404;
    response.end();
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const url = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await chromium.launch({
    headless: true,
    ...(process.env.PI_WEB_SMOKE_BROWSER_EXECUTABLE
      ? { executablePath: process.env.PI_WEB_SMOKE_BROWSER_EXECUTABLE }
      : {}),
  });
  const context = await browser.newContext({
    viewport: { width: 1150, height: 1000 },
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.route("**/*", (route) =>
    new URL(route.request().url()).origin === url
      ? route.continue()
      : route.abort(),
  );
  await page.goto(url);
  await page.getByRole("heading", { name: "Subagents", exact: true }).waitFor();
  await page.waitForFunction(() =>
    window.fixture.calls.some((call) => call.method === "status"),
  );
  await page
    .getByText('<img src=x onerror="window.evil=true"> literal transcript', {
      exact: true,
    })
    .waitFor({ state: "attached" });
  assert.equal(await page.locator("img").count(), 0);
  assert.equal(await page.evaluate(() => window.evil), undefined);
  await page.locator("button.run").first().click();
  const stop = page.getByRole("button", { name: "Stop run…", exact: true });
  await stop.click();
  assert.equal(
    await page.evaluate(
      () =>
        window.fixture.calls.filter((call) => call.method === "stop").length,
    ),
    0,
  );
  assert.equal(
    await page
      .locator(".confirmation")
      .evaluate((element) => element.getRootNode().activeElement === element),
    true,
  );
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  assert.equal(
    await stop.evaluate(
      (element) => element.getRootNode().activeElement === element,
    ),
    true,
    "cancel restores initiating focus",
  );
  await stop.click();
  await page.getByRole("button", { name: "Confirm stop", exact: true }).click();
  await page.waitForFunction(() =>
    window.fixture.calls.some((call) => call.method === "stop"),
  );
  await page
    .getByText("Not terminal proof", { exact: false })
    .first()
    .waitFor();
  assert.equal(
    await page.evaluate(
      () =>
        !!document.querySelector("body>div").firstElementChild.shadowRoot
          .activeElement,
    ),
    true,
    "confirm retains focus in panel",
  );
  await stop.click();
  await page.locator('textarea[name="message"]').fill("old session draft");
  await page.evaluate(() => window.fixture.switchSession("session-2"));
  await page.waitForFunction(() =>
    window.fixture.calls.some(
      (call) => call.method === "status" && call.sessionId === "session-2",
    ),
  );
  assert.equal(await page.locator('textarea[name="message"]').inputValue(), "");
  assert.equal(await page.locator(".confirmation").count(), 0);
  await page.screenshot({
    path: join(artifacts, "desktop.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: join(artifacts, "mobile.png"),
    fullPage: true,
  });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    ),
    false,
    "mobile page overflow",
  );
  await page.evaluate(() => window.fixture.unmount());
  await page.waitForTimeout(100);
  const calls = await page.evaluate(() => window.fixture.calls.length);
  await page.waitForTimeout(2200);
  assert.equal(await page.evaluate(() => window.fixture.calls.length), calls);
  assert.equal(await page.evaluate(() => window.fixture.subscribed), false);
  assert.deepEqual(errors, []);
  const report = {
    result: "passed",
    browser: await browser.version(),
    artifacts,
    scope:
      "Real browser and built adapter with fake public host/peer; NOT live PI WEB daemon",
    checks: [
      "mount handshake/status",
      "escaped output",
      "stop requires confirmation",
      "cancel/confirm focus",
      "scope clears drafts/confirmation",
      "mobile containment",
      "unmount cleanup",
      "no page errors",
    ],
  };
  await writeFile(
    join(artifacts, "result.json"),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report));
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
