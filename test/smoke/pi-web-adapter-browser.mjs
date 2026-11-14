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
  await page.emulateMedia({ reducedMotion: "reduce" });
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
  await page.evaluate(() => window.fixture.batchVisibility(false));
  assert.equal(await page.evaluate(() => document.querySelector("body>div").firstElementChild.controller.available), false);
  await page.evaluate(() => window.fixture.batchVisibility(true));
  await page.waitForFunction(() => document.querySelector("body>div").firstElementChild.controller.state.ping !== undefined);
  assert.equal(await page.evaluate(() => document.querySelector("body>div").firstElementChild.controller.available), true);
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
  // Criterion 4 / B4: selected bounded follow, native scrolling, no background mutation.
  await page.evaluate(() => window.fixture.setOutput(Array.from({ length: 120 }, (_, i) => `Line ${i} <img src=x onerror="window.evil=true">`).join("\n")));
  await page.locator('input[name="lines"]').fill("200");
  await page.getByRole("button", { name: "Load transcript", exact: true }).click();
  const output = page.getByLabel("Targeted run output", { exact: true });
  await output.waitFor();
  await page.waitForFunction(() => {
    const el = document.querySelector("body>div").firstElementChild.shadowRoot.querySelector(".targeted-output");
    return el && el.scrollHeight - el.clientHeight - el.scrollTop < 24;
  });
  await page.getByRole("heading", { name: "Reported workflow trace", exact: true }).waitFor();
  assert.equal(await page.locator(".workflow-trace button").count(), 0);
  assert.match(await page.locator(".workflow-trace").innerText(), /host-check/);
  assert.match(await page.locator(".workflow-trace").innerText(), /reported-reference/);
  await page.locator(".inspector").screenshot({ path: join(artifacts, "output-workflow.png") });
  assert.equal(await output.evaluate((el) => getComputedStyle(el).scrollBehavior), "auto");
  await page.getByRole("button", { name: "Follow output", exact: true }).click();
  await page.getByRole("button", { name: "Stop following", exact: true }).waitFor();
  await output.evaluate((el) => { el.scrollTop = 50; el.dispatchEvent(new Event("scroll")); });
  await page.getByText(/Auto-scroll paused while inspecting earlier output/).waitFor();
  await page.evaluate(() => document.querySelector("body>div").firstElementChild.controller.refresh());
  assert.equal(await output.evaluate((el) => el.scrollTop), 50, "status refresh preserves output DOM and scroll");
  await page.evaluate(() => window.fixture.setOutput(Array.from({ length: 160 }, (_, i) => `Updated ${i} <img src=x onerror="window.evil=true">`).join("\n")));
  await page.waitForFunction(() => document.querySelector("body>div").firstElementChild.shadowRoot.querySelector(".targeted-output")?.textContent.includes("Updated 159"));
  assert.equal(await output.evaluate((el) => el.scrollTop), 50, "follow retains manual output scroll offset");
  await page.getByRole("button", { name: "Jump to latest", exact: true }).click();
  assert.ok(await output.evaluate((el) => el.scrollHeight - el.clientHeight - el.scrollTop < 24));
  await page.evaluate(() => window.fixture.setOutput(Array.from({ length: 180 }, (_, i) => `Latest ${i}`).join("\n")));
  await page.waitForFunction(() => {
    const el = document.querySelector("body>div").firstElementChild.shadowRoot.querySelector(".targeted-output");
    return el?.textContent.includes("Latest 179") && el.scrollHeight - el.clientHeight - el.scrollTop < 24;
  });
  assert.ok(await page.evaluate(() => window.fixture.calls.filter((call) => call.method === "status" && call.params?.id).every((call) => call.params.id === "run-1" && call.params.view === "transcript" && call.params.lines === 200)));
  assert.equal(await page.locator("img").count(), 0);
  assert.equal(await page.evaluate(() => window.evil), undefined);
  await page.evaluate(() => window.fixture.batchVisibility(false));
  assert.equal(await page.evaluate(() => document.querySelector("body>div").firstElementChild.controller.state.outputFollowing), false);
  const readsWhileHidden = await page.evaluate(() => window.fixture.calls.filter((call) => call.method === "status" && call.params?.id).length);
  await page.waitForTimeout(2200);
  assert.equal(await page.evaluate(() => window.fixture.calls.filter((call) => call.method === "status" && call.params?.id).length), readsWhileHidden);
  await page.evaluate(() => window.fixture.batchVisibility(true));
  await page.waitForFunction(() => document.querySelector("body>div").firstElementChild.controller.state.ping !== undefined);
  assert.equal(await page.getByRole("button", { name: "Follow output", exact: true }).getAttribute("aria-pressed"), "false");
  await page.getByRole("button", { name: "Back to reported runs", exact: true }).click();
  await page.locator("button.run").first().click();
  assert.equal(await output.count(), 0, "target change clears output cache and follow");
  await page.evaluate(() => window.fixture.setOutput(undefined));
  const stop = page.getByRole("button", { name: "Stop entire run…", exact: true });
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
  // B10: simulated host-owned native dialog while the adapter confirmation is open.
  // This checks stacking/focus ownership, not the real host extension-dialog implementation.
  await page.evaluate(() => {
    const dialog = document.createElement("dialog");
    dialog.id = "fixture-host-dialog";
    const button = document.createElement("button");
    button.textContent = "Fixture host choice";
    button.addEventListener("click", () => dialog.close("chosen"));
    dialog.append(button);
    document.body.append(dialog);
    dialog.showModal();
    button.focus();
  });
  assert.equal(await page.getByRole("button", { name: "Fixture host choice" }).evaluate((button) => document.activeElement === button), true);
  await page.getByRole("button", { name: "Fixture host choice" }).click();
  assert.equal(await page.locator("#fixture-host-dialog").evaluate((dialog) => dialog.returnValue), "chosen");
  assert.equal(await page.locator(".confirmation").count(), 1, "host choice does not confirm adapter mutation");
  assert.equal(await page.evaluate(() => window.fixture.calls.filter((call) => call.method === "stop").length), 0);
  await page.evaluate(() => document.getElementById("fixture-host-dialog").remove());
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
  await additionalAgents.getByText("Cumulative spent tokens", { exact: true }).waitFor();
  assert.match(await additionalAgents.locator(".facts").textContent(), /1,500/);
  await additionalAgents.getByText("Current context window", { exact: true }).waitFor();
  assert.equal(await additionalAgents.locator("button").count(), 0);
  await additionalAgents.locator(":scope > summary").click();
  const connected = page.locator(".graph-root").filter({ has: page.getByRole("button", { name: /Connected root/, includeHidden: true }) });
  const root = connected.locator(":scope > article button.run");
  const branch = connected.locator(":scope > details.branch-disclosure");
  const branchSummary = branch.locator(":scope > summary");
  assert.equal(await graph.locator("button.run").count(), 16);
  assert.equal(await graph.locator(".node-card").count(), 16);
  assert.equal(await graph.locator(".graph-child button").count(), 12);
  assert.equal(await page.locator(".fleet button").count(), 0);
  assert.equal(await branch.getAttribute("open"), null);
  await page.getByText("Bounded snapshot:", { exact: false }).waitFor();
  const beforeGraph = await mutationCalls();
  // Native Tab/Enter/Space interaction, not an incomplete ARIA tree widget.
  await page.locator("#runs-heading").focus();
  await page.keyboard.press("Tab");
  assert.equal(await page.getByLabel("Filter reported nodes").evaluate((element) => element.getRootNode().activeElement === element), true);
  await root.focus();
  assert.equal(await root.evaluate((element) => element.getRootNode().activeElement === element), true);
  await page.keyboard.press("Enter");
  assert.equal(await root.getAttribute("aria-pressed"), "true");
  await page.keyboard.press("Space");
  await branchSummary.focus();
  await page.keyboard.press("Space");
  assert.notEqual(await branch.getAttribute("open"), null);
  // A5–A7/A13: supported facts are visible without opening JSON disclosures.
  assert.equal(await connected.locator(".node-details[open]").count(), 0);
  await connected.getByText("active_long_running", { exact: true }).waitFor();
  const rootFacts = connected.locator(":scope > article > .facts");
  assert.match(await rootFacts.textContent(), /Elapsed\s*1m 0s/);
  assert.match(await rootFacts.textContent(), /Tool elapsed at snapshot\s*3s/);
  assert.match(await rootFacts.textContent(), /Last activity age\s*2s/);
  const progress = connected.locator(".progress-report");
  await progress.getByText("Progress report", { exact: true }).waitFor();
  assert.match(await progress.textContent(), /Report age at snapshot: 12s/);
  assert.match(await progress.textContent(), /Tests pass; reviewing results/);
  await connected.getByText("Host monitor (not an agent)", { exact: true }).waitFor();
  await connected.getByText("Reported stale", { exact: true }).waitFor();
  await connected.locator(":scope > article").getByText("Activity details", { exact: true }).click();
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
  assert.equal(await graph.locator('button.run[aria-pressed="true"]').count(), 1, "duplicate occurrences have distinct display selection");
  await page.getByText("Read-only snapshot.", { exact: false }).waitFor();
  assert.equal(await stop.count(), 0);
  assert.equal(await page.getByRole("button", { name: "Load transcript", exact: true }).count(), 0);
  assert.deepEqual(await mutationCalls(), beforeGraph);
  await connected.getByRole("button", { name: /Deepest / }).click();
  await page.getByText("Read-only snapshot.", { exact: false }).waitFor();
  assert.equal(await stop.count(), 0);
  await page.getByRole("button", { name: "Back to reported runs", exact: true }).click();
  const search = page.getByLabel("Filter reported nodes");
  await search.fill("Isolated root");
  assert.equal(await graph.locator(".graph-root:visible").count(), 0, "removed nodes cannot match a filter");
  await search.fill("Connected root");
  assert.equal(await graph.locator(".graph-root:visible").count(), 1);
  await search.fill("");
  assert.equal(await graph.locator(".graph-root:visible").count(), 3);
  assert.notEqual(await branch.getAttribute("open"), null, "filtering preserves disclosures");
  // R1: released activity enum keeps a matching running child and its non-attention ancestry.
  const stateFilter = graph.locator("select");
  await stateFilter.selectOption("attention");
  await search.fill("needs_attention");
  assert.equal(await graph.locator(".graph-root:visible").count(), 1);
  assert.equal(await root.isVisible(), true);
  assert.equal(await connected.locator(".graph-child:visible").count(), 1);
  await connected.getByText("needs_attention", { exact: true }).waitFor();
  await search.fill("active_long_running");
  assert.equal(await graph.locator(".graph-root:visible").count(), 0, "long-running activity alone is not attention");
  await stateFilter.selectOption("all");
  await search.fill("");
  assert.deepEqual(await mutationCalls(), beforeGraph, "attention filtering never performs mutations");
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
  assert.equal(await graph.locator("button.run").count(), 15);
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

  // A root becoming ambiguous while confirmation is open must revoke admission.
  const beforeAmbiguous = await mutationCalls();
  await stop.click();
  await page.getByRole("button", { name: "Confirm stop", exact: true }).waitFor();
  await page.evaluate(() => window.fixture.duplicateRoot("run-1"));
  await refresh();
  assert.equal(await page.getByRole("button", { name: "Confirm stop", exact: true }).count(), 0);
  assert.equal(await page.locator("#control-heading").count(), 0);
  assert.deepEqual(await mutationCalls(), beforeAmbiguous);
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
  // C6: focused form is explicitly opened; only the current mode's fields exist.
  await page.getByRole("button", { name: "New run", exact: true }).focus();
  await page.keyboard.press("Enter");
  assert.equal(await page.locator("#launch-heading").evaluate((element) => element.getRootNode().activeElement === element), true);
  assert.equal(await page.locator('textarea[name="args"]').count(), 0);
  await page.locator('textarea[name="source"]').fill("worker");
  await page.locator('textarea[name="task"]').fill("fixture task");
  await page.getByRole("button", { name: "Review launch…", exact: true }).click();
  await page.getByRole("button", { name: "Confirm spawn", exact: true }).click();
  await page.getByText("spawn · unknown", { exact: true }).waitFor();
  await page.waitForTimeout(2200);
  assert.equal((await mutationCalls()).filter((call) => call.method === "spawn").length, 1, "unknown receipt never auto retries");
  const spawnCall = (await mutationCalls()).find((call) => call.method === "spawn");
  assert.equal("model" in spawnCall.params, false, "blank model inherits");
  await page.locator('select[name="kind"]').selectOption("workflow");
  assert.equal(await page.locator('textarea[name="task"]').count(), 0);
  assert.equal(await page.locator('textarea[name="source"]').inputValue(), "", "mode switch clears source");
  await page.locator('textarea[name="source"]').fill("workflow.yaml");
  await page.locator('textarea[name="args"]').fill("[]");
  await page.getByRole("button", { name: "Review launch…", exact: true }).click();
  await page.getByText("Invalid launch arguments:", { exact: false }).waitFor();
  assert.equal(await page.locator(".confirmation").count(), 0);
  await page.locator('textarea[name="args"]').fill('{"goal":"read-only fixture"}');
  await page.locator('input[name="model"]').fill("provider/explicit");
  await page.getByRole("button", { name: "Review launch…", exact: true }).click();
  assert.match(await page.locator(".confirmation").textContent(), /workflow.yaml[\s\S]*provider\/explicit/);
  assert.doesNotMatch(await page.locator(".confirmation pre").textContent(), /"task"/);
  assert.equal(await page.locator(".confirmation").evaluate((element) => getComputedStyle(element).color !== getComputedStyle(document.body).color), true, "Canvas fallback must pair with CanvasText, not an inherited dark-theme foreground");
  await page.locator(".confirmation").screenshot({ path: join(artifacts, "launch-review.png") });
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.locator('select[name="kind"]').selectOption("script");
  assert.equal(await page.locator('textarea[name="source"]').inputValue(), "");
  assert.equal(await page.locator('textarea[name="args"]').inputValue(), "");
  await page.getByRole("button", { name: "Close launch form", exact: true }).click();
  assert.equal(await page.locator("#new-run").evaluate((element) => element.getRootNode().activeElement === element), true);
  assert.equal((await mutationCalls()).filter((call) => call.method === "spawn").length, 1);

  // C8: selectable exact records, cached provenance, escaped details/history and all seven actions.
  const schedulesButton = page.getByRole("button", { name: "List schedules", exact: true });
  const scheduleCalls = () => page.evaluate(() => window.fixture.calls.filter((call) => call.method === "manage"));
  assert.equal((await scheduleCalls()).length, 0);
  await schedulesButton.click();
  const scheduleRow = page.locator(".schedule-list button").first();
  await scheduleRow.waitFor();
  await scheduleRow.click();
  assert.equal(await page.locator("#schedule-heading").evaluate((element) => element.getRootNode().activeElement === element), true);
  assert.match(await page.locator(".schedule-detail").textContent(), /next-run time[\s\S]*unknown/);
  assert.equal(await page.locator(".schedule-list img").count(), 0);
  await page.getByRole("button", { name: "Read details", exact: true }).click();
  await page.getByText("Last detail read (cached)", { exact: true }).waitFor();
  assert.equal(await page.locator(".schedule-list button").count(), 2, "detail read preserves list");
  await page.getByRole("button", { name: "Read history", exact: true }).click();
  await page.locator(".schedule-history").waitFor();
  assert.match(await page.locator(".schedule-history").textContent(), /history-1[\s\S]*failed[\s\S]*literal history error/);
  assert.doesNotMatch(await page.locator(".schedule-history").textContent(), /unrelated-history/);
  assert.equal(await page.locator(".schedule-history img, .schedule-history button").count(), 0);
  await page.locator("#schedules-section").screenshot({ path: join(artifacts, "schedule-history.png") });
  await page.setViewportSize({ width: 375, height: 844 });
  await page.locator("#schedules-section").screenshot({ path: join(artifacts, "schedule-history-mobile.png") });
  assert.equal(await page.locator("#schedules-section").evaluate((section) => section.scrollWidth <= section.clientWidth), true);
  await page.setViewportSize({ width: 1150, height: 1000 });
  for (const [name, action] of [["Pause…", "pause"], ["Resume schedule…", "resume"], ["Run now…", "run"], ["Delete schedule…", "delete"]]) {
    const before = (await scheduleCalls()).length;
    await page.getByRole("button", { name, exact: true }).click();
    assert.equal((await scheduleCalls()).length, before, "review is not mutation");
    assert.match(await page.locator(".confirmation").textContent(), new RegExp(`schedule\\.${action}[\\s\\S]*schedule-1`));
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    assert.equal((await scheduleCalls()).length, before);
    await page.getByRole("button", { name, exact: true }).click();
    await page.getByRole("button", { name: "Confirm manage", exact: true }).click();
    await page.waitForFunction((count) => window.fixture.calls.filter((call) => call.method === "manage").length === count, before + 1);
    assert.deepEqual((await scheduleCalls()).at(-1).params, { action: `schedule.${action}`, id: "schedule-1" });
  }
  await page.getByRole("button", { name: "Pause…", exact: true }).click();
  await page.evaluate(() => window.fixture.duplicateSchedule());
  await schedulesButton.click();
  await page.getByText("Select a schedule to read details/history or review a change.", { exact: true }).waitFor();
  assert.equal(await page.locator(".confirmation").count(), 0, "ambiguous list revokes confirmation");
  assert.equal(await page.locator(".schedule-list button:disabled").count(), 2);
  await page.locator(".schedule-list button:not(:disabled)").click();
  await page.getByRole("button", { name: "Delete schedule…", exact: true }).click();
  await page.evaluate(() => window.fixture.removeSchedule("schedule-2"));
  await schedulesButton.click();
  await page.getByText("Select a schedule to read details/history or review a change.", { exact: true }).waitFor();
  assert.equal(await page.locator(".confirmation").count(), 0, "removed schedule revokes confirmation");
  assert.equal(await page.evaluate(() => window.evil), undefined);

  // C5: accounting remains explicit and has readable cache/turn columns.
  const costsBefore = (await mutationCalls()).filter((call) => call.method === "cost").length;
  await page.getByRole("button", { name: "Calculate cost", exact: true }).click();
  await page.getByRole("columnheader", { name: "Cache read", exact: true }).waitFor();
  await page.getByRole("columnheader", { name: "Cache write", exact: true }).waitFor();
  await page.getByRole("columnheader", { name: "Turns", exact: true }).waitFor();
  assert.equal(await page.locator(".usage-table tbody tr").count(), 3);
  assert.match(await page.locator(".usage-table").textContent(), /Parent[\s\S]*Child total[\s\S]*Total/);
  await page.waitForTimeout(2200);
  assert.equal((await mutationCalls()).filter((call) => call.method === "cost").length, costsBefore + 1);

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
  assert.equal(await graph.isVisible(), false, "mobile inspector is a drill-in");
  await page.getByRole("button", { name: "Back to reported runs", exact: true }).click();
  assert.equal(await graph.isVisible(), true);
  assert.ok((await root.boundingBox()).height >= 44);
  assert.ok((await branchSummary.boundingBox()).height >= 44);
  await branchSummary.focus();
  await page.keyboard.press("Enter");
  assert.equal(await branch.getAttribute("open"), null);
  await page.keyboard.press("Space");
  assert.notEqual(await branch.getAttribute("open"), null);
  await root.focus();
  await page.keyboard.press("Space");
  assert.equal(await root.getAttribute("aria-pressed"), "true");
  assert.equal(await page.locator("#control-heading").evaluate((element) => element.getRootNode().activeElement === element), true);
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
  try {
    await page.waitForFunction(() => {
      const panel = document.querySelector("body>div").firstElementChild;
      return [...panel.shadowRoot.querySelectorAll("button")].some((button) => button.textContent.trim() === "Stop entire run…" && !button.disabled);
    });
  } catch (error) {
    console.error("Mobile readiness diagnostics", await page.evaluate(async () => {
      const panel = document.querySelector("body>div").firstElementChild;
      return {
        available: panel.controller.available,
        state: panel.controller.state,
        visible: panel.controller.visible,
        mounted: panel.controller.mounted,
        inViewport: panel.inViewport,
        active: panel.active,
        visibility: document.visibilityState,
        rectangle: panel.getBoundingClientRect().toJSON(),
        intersection: await new Promise((resolve) => {
          const observer = new IntersectionObserver(([entry]) => {
            resolve({ isIntersecting: entry.isIntersecting, bounding: entry.boundingClientRect.toJSON(), intersection: entry.intersectionRect.toJSON(), root: entry.rootBounds?.toJSON() });
            observer.disconnect();
          });
          observer.observe(panel);
        }),
        recentCalls: window.fixture.calls.slice(-5),
      };
    }));
    throw error;
  }
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
  const back = page.getByRole("button", { name: "Back to reported runs", exact: true });
  await back.focus();
  assert.equal(await back.evaluate((element) => element.getRootNode().activeElement === element), true);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
  await page.emulateMedia({ forcedColors: "none" });
  // Live localization and palette updates must not replace drafts, selection,
  // confirmation state, or initiate execution. These are fake public host services.
  await page.locator('textarea[name="message"]').fill("keep my draft");
  const beforeLocalization = await mutationCalls();
  await page.evaluate(() => {
    window.fixture.localization.change("ar", "de-DE", { title: "Agents traduits", refresh: "Actualiser" }, "rtl");
    document.documentElement.style.setProperty("--pi-accent", "rgb(128, 64, 192)");
    document.documentElement.style.setProperty("--pi-font", "serif");
  });
  await page.getByRole("heading", { name: "Agents traduits", exact: true }).waitFor();
  await page.getByRole("button", { name: "Actualiser", exact: true }).waitFor();
  assert.equal(await page.locator("main").getAttribute("dir"), "rtl");
  assert.equal(await page.locator('textarea[name="message"]').inputValue(), "keep my draft");
  assert.deepEqual(await mutationCalls(), beforeLocalization);
  assert.equal(await root.evaluate((element) => getComputedStyle(element).borderColor), "rgb(128, 64, 192)");
  assert.equal(await page.evaluate(() => window.fixture.styles.roots.size), 1);
  assert.equal(await page.evaluate(() => window.fixture.localization.subscribers), 1);
  await page.evaluate(() => window.fixture.localization.change("en", "en-US", {}));
  await page.getByRole("heading", { name: "Subagents", exact: true }).waitFor();

  // Hidden lifecycle pauses observation, not graph/execution state.
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  const hiddenCalls = await page.evaluate(() => window.fixture.calls.length);
  await page.waitForTimeout(2200);
  assert.equal(await page.evaluate(() => window.fixture.calls.length), hiddenCalls);

  // C1/A12: public v5 resolver/input/lifecycle fixture, not the real host renderer implementation.
  await page.evaluate(() => window.fixture.renderTool("workflow"));
  const card = page.locator("#transcript-fixture");
  await card.getByRole("heading", { name: "Workflow preflight", exact: true }).waitFor();
  assert.match(await card.locator(".card").innerText(), /Tool call: success/);
  assert.match(await card.locator(".card").innerText(), /Tool-call success is not run success/);
  assert.match(await card.locator(".card").innerText(), /running/);
  assert.match(await card.locator(".card").innerText(), /Host check/);
  assert.match(await card.locator(".card").innerText(), /Checks blocked/);
  assert.match(await card.locator(".card").innerText(), /Review found regression/);
  assert.match(await card.locator(".card").innerText(), /Missing regression test/);
  const workflowDisclosures = ["Reported workflow graph", "Reported workflow receipt / lanes", "Reported workflow child inventory", "Reported runner / adapter profile"];
  for (const label of workflowDisclosures) {
    const summary = card.locator("summary").filter({ hasText: label }).first();
    await summary.focus();
    await page.keyboard.press("Enter");
    assert.equal(await summary.evaluate((element) => element.parentElement.open), true);
  }
  assert.match(await card.locator(".card").innerText(), /Graph worker/);
  assert.match(await card.locator(".card").innerText(), /Host monitor \(not a child agent\): Graph gate/);
  assert.match(await card.locator(".card").innerText(), /Gate needs evidence/);
  assert.match(await card.locator(".card").innerText(), /not-resumable/);
  assert.match(await card.locator(".card").innerText(), /inventory-worker/);
  assert.match(await card.locator(".card").innerText(), /Adapter profile, not measured security/);
  assert.equal(await card.locator("button, a, img, script").count(), 0);
  assert.equal(await page.evaluate(() => window.evil), undefined);
  assert.equal(await page.evaluate(() => window.fixture.styles.roots.size), 2);
  const taskDisclosure = card.locator("summary").filter({ hasText: /^Reported task$/ }).first();
  await taskDisclosure.focus();
  await page.keyboard.press("Enter");
  assert.equal(await taskDisclosure.evaluate((element) => element.parentElement.open), true);
  await page.evaluate(() => window.fixture.renderTool("workflow"));
  assert.equal(await taskDisclosure.evaluate((element) => element.parentElement.open), true, "repeat render retains disclosure");
  for (const label of workflowDisclosures) {
    assert.equal(await card.locator("summary").filter({ hasText: label }).first().evaluate((element) => element.parentElement.open), true);
  }
  await page.setViewportSize({ width: 375, height: 900 });
  await page.evaluate(() => {
    window.fixture.localization.change("ar", "de-DE", { toolCard: "Carte historique" }, "rtl");
    document.documentElement.style.setProperty("--pi-text", "rgb(240, 240, 240)");
    document.documentElement.style.setProperty("--pi-muted", "rgb(190, 195, 205)");
    document.documentElement.style.setProperty("--pi-surface", "rgb(25, 28, 36)");
    document.documentElement.style.setProperty("--pi-border", "rgb(100, 110, 125)");
  });
  await card.getByRole("heading", { name: "Carte historique · workflow", exact: true }).waitFor();
  assert.equal(await card.locator(".card").getAttribute("dir"), "rtl");
  assert.ok(await card.evaluate((element) => element.scrollWidth <= element.clientWidth + 1));
  assert.equal(await card.locator(".card").evaluate((element) => getComputedStyle(element).backgroundColor), "rgb(25, 28, 36)");
  assert.equal(await card.locator(".card").evaluate((element) => getComputedStyle(element).color), "rgb(240, 240, 240)");
  await card.screenshot({ path: join(artifacts, "inline-workflow-mobile-rtl.png") });
  await page.evaluate(() => {
    document.documentElement.style.setProperty("--pi-text", "rgb(24, 28, 36)");
    document.documentElement.style.setProperty("--pi-muted", "rgb(65, 72, 82)");
    document.documentElement.style.setProperty("--pi-surface", "rgb(255, 255, 255)");
    window.fixture.localization.change("en", "en-US", {});
  });
  assert.equal(await card.locator(".card").evaluate((element) => getComputedStyle(element).backgroundColor), "rgb(255, 255, 255)");
  assert.equal(await card.locator(".card").evaluate((element) => getComputedStyle(element).color), "rgb(24, 28, 36)");
  await card.screenshot({ path: join(artifacts, "inline-workflow-mobile-light.png") });
  for (const mode of ["single", "parallel", "chain"]) {
    await page.evaluate((mode) => window.fixture.renderTool(mode), mode);
    await card.getByRole("heading", { name: `Subagent tool entry · ${mode}`, exact: true }).waitFor();
  }
  for (const mode of ["malformed", "unknown"]) {
    await page.evaluate((mode) => window.fixture.renderTool(mode), mode);
    await card.getByText("Generic host fallback", { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.fixture.styles.roots.size), 1);
  }
  await page.evaluate(() => window.fixture.renderTool("workflow"));
  await card.getByRole("heading", { name: "Workflow preflight", exact: true }).waitFor();
  await page.evaluate(() => window.fixture.renderTool("workflow", true));
  await card.getByText("Generic host fallback", { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.fixture.styles.roots.size), 1);
  await page.evaluate(() => { window.fixture.renderTool("workflow"); window.fixture.removeTool(); });
  assert.equal(await page.evaluate(() => window.fixture.calls.length), hiddenCalls, "inline rendering performs no RPC reads or mutations");
  assert.equal(await page.evaluate(() => window.fixture.styles.roots.size), 1);
  assert.equal(await page.evaluate(() => window.fixture.localization.subscribers), 1);
  // C2–C4: displayed custom-message family via exact v5 contributions.
  for (const type of await page.evaluate(() => window.fixture.noticeTypes)) {
    await page.evaluate((type) => window.fixture.renderNotice(type), type);
    await card.locator(".card").waitFor();
    assert.match(await card.locator(".card").innerText(), /Historical displayed notice/);
    assert.equal(await card.locator("button, a, img, script").count(), 0);
    assert.equal(await page.evaluate(() => window.fixture.styles.roots.size), 2);
  }
  await page.evaluate(() => window.fixture.renderNotice("subagent_supervisor_request"));
  await card.getByText("Decision requested", { exact: true }).waitFor();
  assert.match(await card.locator(".card").innerText(), /does not answer or approve this historical request/);
  const noticeDisclosure = card.locator("summary").filter({ hasText: /^Original notice text$/ });
  await noticeDisclosure.focus();
  await page.keyboard.press("Enter");
  assert.equal(await noticeDisclosure.evaluate((element) => element.parentElement.open), true);
  await page.evaluate(() => window.fixture.renderNotice("subagent_supervisor_request"));
  assert.equal(await noticeDisclosure.evaluate((element) => element.parentElement.open), true);
  assert.match(await card.locator(".card").innerText(), /<img src=x onerror=/);
  await page.evaluate(() => window.fixture.renderNotice("subagent_supervisor_request", "progress"));
  await card.getByText("Informational progress update", { exact: true }).waitFor();
  await page.evaluate(() => window.fixture.renderNotice("subagent_supervisor_request", "interview"));
  await card.getByText("Structured answers requested", { exact: true }).waitFor();
  await page.evaluate(() => window.fixture.renderNotice("subagent_watchdog_warning"));
  await card.getByText("blocker", { exact: true }).waitFor();
  assert.match(await card.locator(".card").innerText(), /No regression assertion/);
  assert.match(await card.locator(".card").innerText(), /watchdog stopped continuing the run/);
  await page.evaluate(() => {
    window.fixture.localization.change("ar", "de-DE", { watchdogWarning: "Avertissement historique" }, "rtl");
    document.documentElement.style.setProperty("--pi-text", "rgb(240, 240, 240)");
    document.documentElement.style.setProperty("--pi-muted", "rgb(190, 195, 205)");
    document.documentElement.style.setProperty("--pi-surface", "rgb(25, 28, 36)");
  });
  await card.getByRole("heading", { name: "Avertissement historique", exact: true }).waitFor();
  assert.equal(await card.locator(".card").getAttribute("dir"), "rtl");
  assert.ok(await card.evaluate((element) => element.scrollWidth <= element.clientWidth + 1));
  await card.screenshot({ path: join(artifacts, "inline-watchdog-mobile-rtl.png") });
  await page.evaluate(() => {
    window.fixture.localization.change("en", "en-US", {});
    document.documentElement.style.setProperty("--pi-text", "rgb(24, 28, 36)");
    document.documentElement.style.setProperty("--pi-muted", "rgb(65, 72, 82)");
    document.documentElement.style.setProperty("--pi-surface", "rgb(255, 255, 255)");
    window.fixture.renderNotice("subagent-notify");
  });
  await card.getByRole("heading", { name: "Reported run outcomes", exact: true }).waitFor();
  assert.match(await card.locator(".card").innerText(), /completed/);
  assert.match(await card.locator(".card").innerText(), /paused/);
  assert.ok(await card.evaluate((element) => element.scrollWidth <= element.clientWidth + 1));
  await card.screenshot({ path: join(artifacts, "inline-completion-mobile-light.png") });
  await page.evaluate(() => window.fixture.renderNotice("subagent-notify", "legacy"));
  await card.getByText(/No structured details supplied/).waitFor();
  for (const type of ["subagent-notify", "subagent_supervisor_reply", "subagent-notify-pending", "unknown"]) {
    await page.evaluate((type) => window.fixture.renderNotice(type, "malformed"), type);
    await card.getByText("Generic host fallback", { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.fixture.styles.roots.size), 1);
  }
  await page.evaluate(() => window.fixture.renderNotice("subagent_supervisor_request", undefined, true));
  await card.getByText("Generic host fallback", { exact: true }).waitFor();
  await page.evaluate(() => { window.fixture.renderNotice("subagent_watchdog_warning"); window.fixture.removeTool(); });
  assert.equal(await page.evaluate(() => window.evil), undefined);
  assert.equal(await page.evaluate(() => window.fixture.calls.length), hiddenCalls, "notice rendering performs no RPC reads or mutations");
  assert.equal(await page.evaluate(() => window.fixture.styles.roots.size), 1);
  assert.equal(await page.evaluate(() => window.fixture.localization.subscribers), 1);
  await page.evaluate(() => window.fixture.unmount());
  await page.waitForTimeout(100);
  const calls = await page.evaluate(() => window.fixture.calls.length);
  await page.waitForTimeout(2200);
  assert.equal(await page.evaluate(() => window.fixture.calls.length), calls);
  assert.equal(await page.evaluate(() => window.fixture.subscribed), false);
  assert.equal(await page.evaluate(() => window.fixture.styles.roots.size), 0);
  assert.equal(await page.evaluate(() => window.fixture.localization.subscribers), 0);
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
      "batched visibility transitions use the latest observation",
      "live translated labels, RTL and theme tokens preserve draft/selection without execution",
      "stylesheet/localization registrations release on unmount",
      "escaped output",
      "C1/A12/C4/C9: built inline cards, literal hostile strings, preflight, acceptance/review, watchdog, runner profile provenance, graph/host monitors, child inventory and receipt lanes; call success distinct from run state; no RPC from rendering",
      "B10: simulated host-native dialog remains focusable/clickable over adapter confirmation; host choice neither confirms nor discards pending mutation; NOT real extension-dialog acceptance",
      "C1: fake v5 default-view/unknown/malformed fallback and abort/unmount cleanup; keyboard disclosure retained on repeat rendering; mobile RTL/localization/theme containment",
      "C2–C4: all 14 exact displayed custom-message types; grouped mixed outcomes, decision/interview/progress distinctions, reminders, watchdog evidence and historical held state; no direct controls or RPC",
      "C2–C4: legacy text, unknown/malformed/hidden-entry-type/default fallback; keyboard disclosure/repeat update, escaping, narrow RTL/theme containment, unmount/style/localization cleanup",
      "B4: bounded selected-only follow, scroll-away retention, jump restores auto-scroll, hidden cancels without auto-resume, target change clears output",
      "A11-A13: readable reported workflow trace, host check operation and read-only references",
      "reduced-motion emulation; output scroll behavior is immediate, not smooth",
      "A5–A7/A13: progress/age, tool duration, activity, counts and monitor facts visible without JSON",
      "A9: unlinked fleet input/output/spent/window metrics, no control targets",
      "C5: accessible on-demand usage table including caches and turns; no accounting polling",
      "C6: focused keyboard-opened launch, mode-only fields, cleared mode drafts, JSON-object validation, inherited/explicit model, readable confirmation, focus restoration",
      "C8: on-demand selectable schedules, exact detail/history, escaped evidence, cached list survives reads, all seven actions, four confirmed mutations, duplicate/removal revokes pending action, narrow-screen containment",
      "stop requires confirmation",
      "cancel/confirm focus",
      "scope clears drafts/confirmation",
      "native connected forest and unlinked fleet; duplicate IDs, hostile values, deepest ancestry",
      "keyboard selection/disclosure only; no graph mutation RPC",
      "poll/reorder unique focus and disclosure retention; focused removal fallback",
      "duplicate-ID activity and branch disclosures retain on unchanged polls and safely reset on reorder",
      "mobile Stop explicitly scrolled into view before capability-enabled wait/click",
      "scope resets selection/disclosures; stale/empty/unavailable warnings",
      "unique-root-only stop/interrupt/steer; duplicate and nested read-only inspectors; uncertain spawn does not retry",
      "reported-window filtering preserves disclosures; mobile inspector drill-in and Back focus",
      "R1: needs_attention retains running child/ancestry; active_long_running alone is not attention; no mutation RPC",
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
