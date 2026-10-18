// Real browser, built adapter, fake public host/peer. Never a live PI WEB test.
// Build the standalone adapter first. Install Playwright separately, then set
// PI_WEB_SMOKE_PLAYWRIGHT_ROOT to that package and optionally
// PI_WEB_SMOKE_BROWSER_EXECUTABLE to an installed browser executable.
import assert from "node:assert/strict";
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
const fixtureScript = await readFile(join(artifacts, "fixture.js"));
// Loopback is a trustworthy context in Chromium, so use an intercepted HTTP origin.
// Every request is fulfilled locally or aborted; no DNS or live host is contacted.
const url = "http://adapter-diagnostic.invalid";
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
    serviceWorkers: "block",
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  await context.route("**/*", (route) => {
    if (route.request().url() === `${url}/fixture.js`)
      return route.fulfill({ contentType: "text/javascript", body: fixtureScript });
    if (route.request().url() === `${url}/`)
      return route.fulfill({
        contentType: "text/html",
        body: '<!doctype html><meta charset="utf-8"><title>Isolated Subagents Acceptance</title><style>body{margin:24px;background:#151820;color:#e4e8ee;font:15px system-ui}body>div{max-width:980px;margin:auto}</style><script type="module" src="/fixture.js"></script>',
      });
    return route.abort();
  });
  await page.goto(url);
  const browserCrypto = await page.evaluate(() => ({
    secureContext: isSecureContext,
    randomUUID: typeof crypto.randomUUID,
    getRandomValues: typeof crypto.getRandomValues,
  }));
  assert.deepEqual(browserCrypto, {
    secureContext: false,
    randomUUID: "undefined",
    getRandomValues: "function",
  });
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
  assert.equal(await page.locator("#control-heading").count(), 0);
  await page.locator("button.run").first().click();
  await page.getByRole("heading", { name: /Details & controls/ }).waitFor();
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
  await page.getByText("stop · accepted", { exact: true }).waitFor();
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
  assert.equal(await page.locator("#control-heading").count(), 0);
  assert.equal(await page.locator(".confirmation").count(), 0);
  await page.locator("button.run").first().click();
  assert.equal(await page.locator('textarea[name="message"]').inputValue(), "");
  const refresh = async () => {
    await page.getByRole("button", { name: "Refresh status", exact: true }).click();
    await page.getByRole("button", { name: "Refresh status", exact: true }).waitFor();
  };
  const mutationCalls = () => page.evaluate(() =>
    window.fixture.calls.filter((call) => !["ping", "status"].includes(call.method)),
  );
  await page.evaluate(() => {
    window.fixture.setGraph("graph");
    window.fixture.switchSession("session-graph-fixture");
  });
  await page.getByRole("button", { name: /Connected root/ }).waitFor();
  await refresh();
  const graph = page.locator('section[aria-labelledby="runs-heading"]');
  const additionalAgents = graph.locator("details.unlinked-agents");
  assert.equal(await additionalAgents.getAttribute("open"), null);
  await additionalAgents.locator(":scope > summary").click();
  assert.equal(await additionalAgents.locator(".fleet li").count(), 1);
  await additionalAgents.locator(":scope > summary").click();
  const connected = page.locator(".graph-root").filter({ has: page.getByRole("button", { name: /Connected root/ }) });
  const root = connected.locator("button.run");
  const branch = connected.locator(":scope > details.branch-disclosure");
  const branchSummary = branch.locator(":scope > summary");
  assert.equal(await graph.locator("button.run").count(), 4);
  assert.equal(await graph.locator(".node-card").count(), 16);
  assert.equal(await graph.locator(".graph-child button").count(), 0);
  assert.equal(await page.locator(".fleet button").count(), 0);
  assert.equal(await branch.getAttribute("open"), null);
  await page.getByText("Bounded snapshot:", { exact: false }).waitFor();
  const beforeGraph = await mutationCalls();
  // Native Tab/Enter/Space interaction, not an incomplete ARIA tree widget.
  await page.locator("#runs-heading").focus();
  await page.keyboard.press("Tab");
  assert.equal(await root.evaluate((element) => element.getRootNode().activeElement === element), true);
  await page.keyboard.press("Enter");
  assert.equal(await root.getAttribute("aria-pressed"), "true");
  await page.keyboard.press("Space");
  await branchSummary.focus();
  await page.keyboard.press("Space");
  assert.notEqual(await branch.getAttribute("open"), null);
  await connected.getByText("Activity details", { exact: true }).click();
  assert.equal(await connected.locator(".node-details[open]").count(), 1);
  assert.equal(await connected.getByText("Deepest ", { exact: false }).count(), 1);
  assert.equal(await page.locator("img, script:not([src])").count(), 0);
  assert.equal(await page.evaluate(() => window.evil), undefined);
  assert.equal(await graph.locator('[role="tree"], [role="treeitem"]').count(), 0);
  assert.equal(await branch.locator(".graph-child").count(), 10);
  const isolated = page.getByRole("button", { name: "Isolated root", exact: true });
  await isolated.focus();
  await page.keyboard.press("Space");
  assert.equal(await isolated.getAttribute("aria-pressed"), "true");
  assert.deepEqual(await mutationCalls(), beforeGraph, "graph selection/disclosure never performs mutations");
  // Crossing the initial-collapse threshold must not overwrite native disclosure choices.
  for (const deep of [false, true]) {
    await page.evaluate((value) => window.fixture.setBranchDepth(value), deep);
    await page.getByRole("button", { name: "Refresh status", exact: true }).evaluate((element) => element.click());
    await branchSummary.getByText(`${deep ? 10 : 8} reported descendants`, { exact: true }).waitFor();
    assert.notEqual(await branch.getAttribute("open"), null);
  }

  // Duplicate IDs are ambiguous presentations, never persistent card identities.
  const duplicateA = graph.locator(".graph-root").filter({ has: page.getByRole("button", { name: "Duplicate A", exact: true }) });
  const duplicateB = graph.locator(".graph-root").filter({ has: page.getByRole("button", { name: "Duplicate B", exact: true }) });
  const duplicateBranch = (card) => card.locator(":scope > details.branch-disclosure");
  await duplicateA.getByText("Activity details", { exact: true }).click();
  await duplicateBranch(duplicateA).locator(":scope > summary").click();
  assert.equal(await duplicateA.locator(".node-details[open]").count(), 1);
  assert.equal(await duplicateB.locator(".node-details[open]").count(), 0);
  assert.equal(await duplicateBranch(duplicateA).getAttribute("open"), null);
  assert.notEqual(await duplicateBranch(duplicateB).getAttribute("open"), null);
  await isolated.focus();

  // Keep focused controls/disclosure DOM through real polling and keyed reorder.
  const polls = await page.evaluate(() => window.fixture.calls.filter((call) => call.method === "status").length);
  await page.waitForFunction((count) => window.fixture.calls.filter((call) => call.method === "status").length > count, polls);
  assert.equal(await isolated.evaluate((element) => element.getRootNode().activeElement === element), true);
  assert.notEqual(await branch.getAttribute("open"), null);
  assert.equal(await duplicateA.locator(".node-details[open]").count(), 1, "unchanged duplicate poll retains native state");
  assert.equal(await duplicateBranch(duplicateA).getAttribute("open"), null);
  const previousDuplicates = await graph.locator(".graph-root").filter({ has: page.getByRole("button", { name: /^Duplicate [AB]$/ }) }).elementHandles();
  await page.evaluate(() => window.fixture.reorder());
  // Click refresh would intentionally change focus; invoke the native button without focusing it.
  await page.getByRole("button", { name: "Refresh status", exact: true }).evaluate((element) => element.click());
  await page.waitForFunction(() => {
    const panel = document.querySelector("body>div").firstElementChild;
    return panel.shadowRoot.querySelector("button.run")?.textContent.includes("Duplicate B");
  });
  assert.equal(await isolated.evaluate((element) => element.getRootNode().activeElement === element), true);
  assert.equal(await isolated.getAttribute("aria-pressed"), "true");
  assert.notEqual(await branch.getAttribute("open"), null);
  assert.equal(await connected.locator(".node-details[open]").count(), 1);
  for (const previous of previousDuplicates) {
    assert.equal(await previous.evaluate((element) => element.isConnected), false, "ambiguous duplicate cards remount on reorder");
    await previous.dispose();
  }
  for (const card of [duplicateA, duplicateB]) {
    assert.equal(await card.locator(".node-details[open]").count(), 0, "activity state must not migrate between duplicate IDs");
    assert.notEqual(await duplicateBranch(card).getAttribute("open"), null, "branch state resets to its default, not another duplicate's choice");
  }
  // Disappearance only transfers graph focus when it was in the removed root.
  await page.evaluate(() => window.fixture.removeRoot("run-2"));
  await page.getByRole("button", { name: "Refresh status", exact: true }).evaluate((element) => element.click());
  await isolated.waitFor({ state: "detached" });
  assert.equal(await page.locator("#runs-heading").evaluate((element) => element.getRootNode().activeElement === element), true);
  assert.equal(await page.locator("#control-heading").count(), 0);
  await page.getByRole("button", { name: "Duplicate B", exact: true }).click();
  assert.equal(await graph.locator('button.run[aria-pressed="true"]').count(), 2, "duplicate upstream IDs remain the same authoritative target");
  await root.click();
  await page.locator('textarea[name="message"]').fill("graph scope draft");
  await page.evaluate(() => window.fixture.switchSession("session-graph"));
  await page.waitForFunction(() => window.fixture.calls.some((call) => call.method === "status" && call.sessionId === "session-graph"));
  await root.waitFor();
  assert.equal(await page.locator("#control-heading").count(), 0);
  assert.equal(await graph.locator('button.run[aria-pressed="true"]').count(), 0);
  await root.click();
  assert.equal(await page.locator('textarea[name="message"]').inputValue(), "");
  assert.equal(await branch.getAttribute("open"), null, "scope resets native branch disclosure");
  assert.equal(await connected.locator(".node-details[open]").count(), 0);

  await page.evaluate(() => window.fixture.setFailure(true));
  await refresh();
  await page.getByRole("alert").filter({ hasText: "fixture disconnected" }).waitFor();
  await page.getByText("Stale cached snapshot", { exact: false }).waitFor();
  assert.equal(await graph.locator("button.run").count(), 3);
  await page.evaluate(() => window.fixture.setFailure(false));
  await refresh();
  await page.evaluate(() => window.fixture.setGraph("empty"));
  await refresh();
  await page.getByText("No async runs in this snapshot.", { exact: true }).waitFor();
  await additionalAgents.locator(":scope > summary").click();
  await page.getByText("No visible fleet entries in this snapshot.", { exact: true }).waitFor();
  await additionalAgents.locator(":scope > summary").click();
  await page.evaluate(() => window.fixture.setGraph("unavailable"));
  await refresh();
  await page.getByText("Controls require an authoritative", { exact: false }).waitFor();
  assert.equal(await page.locator("#control-heading").count(), 0);
  await page.evaluate(() => window.fixture.setGraph("graph"));
  await refresh();
  await root.click();
  await branchSummary.click();

  // Existing inspector actions still target only the selected authoritative root.
  await page.getByRole("button", { name: "Interrupt run…", exact: true }).click();
  await page.getByRole("button", { name: "Confirm interrupt", exact: true }).click();
  await page.getByText("interrupt · accepted", { exact: true }).waitFor();
  await page.locator('textarea[name="message"]').fill("explicit graph-root steer");
  await page.getByRole("button", { name: "Review / send message", exact: true }).click();
  await page.getByText("steer · accepted", { exact: true }).waitFor();
  const controls = await mutationCalls();
  for (const call of controls.filter((call) => ["stop", "interrupt", "steer"].includes(call.method))) {
    assert.equal(call.params.id, "run-1");
    assert.equal("childId" in call.params, false);
  }
  await page.evaluate(() => window.fixture.setUncertain(true));
  await page.getByText("New agent, script, or workflow", { exact: true }).click();
  await page.locator('textarea[name="source"]').fill("worker");
  await page.locator('textarea[name="task"]').fill("fixture task");
  await page.getByRole("button", { name: "Review launch…", exact: true }).click();
  await page.getByRole("button", { name: "Confirm spawn", exact: true }).click();
  await page.getByText("spawn · unknown", { exact: true }).waitFor();
  await page.waitForTimeout(2200);
  assert.equal((await mutationCalls()).filter((call) => call.method === "spawn").length, 1, "unknown receipt never auto retries");
  await page.getByText("New agent, script, or workflow", { exact: true }).click();

  await page.screenshot({
    path: join(artifacts, "desktop.png"),
    fullPage: true,
  });
  await page.emulateMedia({ colorScheme: "light" });
  await page.evaluate(() => { document.body.style.background = "#fff"; document.body.style.color = "#17202a"; });
  await page.screenshot({ path: join(artifacts, "desktop-light.png"), fullPage: true });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.evaluate(() => { document.body.style.background = "#151820"; document.body.style.color = "#e4e8ee"; });
  await page.setViewportSize({ width: 375, height: 844 });
  await root.focus();
  await page.keyboard.press("Space");
  assert.equal(await root.getAttribute("aria-pressed"), "true");
  assert.ok((await root.boundingBox()).height >= 44);
  assert.ok((await branchSummary.boundingBox()).height >= 44);
  await branchSummary.focus();
  await page.keyboard.press("Enter");
  assert.equal(await branch.getAttribute("open"), null);
  await page.keyboard.press("Space");
  assert.notEqual(await branch.getAttribute("open"), null);
  const mobileVisibility = [];
  const recordMobileVisibility = async (phase) => {
    mobileVisibility.push(await stop.evaluate((element, phase) => {
      const panel = element.getRootNode().host;
      const rect = panel.getBoundingClientRect();
      return {
        phase,
        stopDisabled: element.disabled,
        panelIntersectsViewport: rect.bottom > 0 && rect.top < innerHeight && rect.right > 0 && rect.left < innerWidth,
        panelTop: rect.top,
        panelBottom: rect.bottom,
        scrollY,
        viewportHeight: innerHeight,
      };
    }, phase));
    await writeFile(join(artifacts, "mobile-visibility.json"), JSON.stringify(mobileVisibility, null, 2));
  };
  await recordMobileVisibility("before-scroll");
  // click() checks enabled before scrolling. Explicitly reveal the control first
  // so IntersectionObserver can resume the real handshake after viewport changes.
  await stop.scrollIntoViewIfNeeded();
  await page.waitForFunction(() => {
    const panel = document.querySelector("body>div").firstElementChild;
    return [...panel.shadowRoot.querySelectorAll("button")].some((button) => button.textContent.trim() === "Stop run…" && !button.disabled);
  });
  await recordMobileVisibility("after-scroll-and-enabled");
  await stop.click();
  await page.locator(".confirmation").waitFor();
  await page.screenshot({ path: join(artifacts, "mobile-confirmation.png"), fullPage: true });
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  assert.equal(await stop.evaluate((element) => element.getRootNode().activeElement === element), true);
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
  await page.emulateMedia({ colorScheme: "light" });
  await page.evaluate(() => { document.body.style.background = "#fff"; document.body.style.color = "#17202a"; });
  await page.screenshot({ path: join(artifacts, "mobile-light.png"), fullPage: true });
  await page.emulateMedia({ forcedColors: "active" });
  await page.screenshot({ path: join(artifacts, "mobile-forced-colors.png"), fullPage: true });
  await root.focus();
  assert.equal(await root.evaluate((element) => element.getRootNode().activeElement === element), true);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
  await page.emulateMedia({ forcedColors: "none" });
  // Hidden lifecycle pauses observation, not graph/execution state.
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  const hiddenCalls = await page.evaluate(() => window.fixture.calls.length);
  await page.waitForTimeout(2200);
  assert.equal(await page.evaluate(() => window.fixture.calls.length), hiddenCalls);
  await page.evaluate(() => window.fixture.unmount());
  await page.waitForTimeout(100);
  const calls = await page.evaluate(() => window.fixture.calls.length);
  await page.waitForTimeout(2200);
  assert.equal(await page.evaluate(() => window.fixture.calls.length), calls);
  assert.equal(await page.evaluate(() => window.fixture.subscribed), false);
  assert.deepEqual(errors, []);
  assert.ok(
    (await page.evaluate(() => window.fixture.actions)).includes("Open Subagents"),
  );
  const requestIds = await page.evaluate(() =>
    window.fixture.calls.map((call) => call.requestId),
  );
  const uuidV4 =
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  for (const id of requestIds) assert.match(id, uuidV4);
  assert.equal(new Set(requestIds).size, requestIds.length);
  const report = {
    result: "passed",
    browser: await browser.version(),
    artifacts,
    browserCrypto,
    mobileVisibility,
    requestIds,
    scope:
      "Real browser and built adapter with fake public host/peer; NOT live PI WEB daemon",
    checks: [
      "non-secure HTTP activation contributes Open Subagents",
      "real controller request IDs are distinct UUID v4 values; replies correlate",
      "mount handshake/status",
      "escaped output",
      "stop requires confirmation",
      "cancel/confirm focus",
      "scope clears drafts/confirmation",
      "native connected forest and unlinked fleet; duplicate IDs, hostile values, deepest ancestry",
      "keyboard selection/disclosure only; no graph mutation RPC",
      "poll/reorder unique focus and disclosure retention; focused removal fallback",
      "duplicate-ID activity and branch disclosures retain on unchanged polls and safely reset on reorder",
      "mobile Stop explicitly scrolled into view before capability-enabled wait/click",
      "scope resets selection/disclosures; stale/empty/unavailable warnings",
      "root-only stop/interrupt/steer; uncertain spawn does not retry",
      "375px dark/light/forced-colors screenshots and containment",
      "hidden observation pause",
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
}
