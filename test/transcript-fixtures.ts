import type { TranscriptToolRendererInput } from "@jmfederico/pi-web/plugin-api";

// Synthetic public-entry fixtures derived from the verified 0.88.1 declarations
// and bundle producers, not recorded provider executions or panel RPC responses.
export const hostile = '<img src=x onerror="window.evil=true">';
export function toolFixture(mode = "parallel"): TranscriptToolRendererInput {
  return {
    scope: { machineId: "remote", sessionId: "historical-parent", projectId: "project", workspaceId: "workspace" },
    signal: new AbortController().signal,
    fail: () => { throw new Error("Synchronous renderer must not call fail"); },
    entry: {
      toolName: "subagent", status: "success", args: { action: "status" },
      resultText: `Literal result ${hostile}`,
      details: {
        mode, runId: "display-only-run", context: "mixed", background: true,
        results: [
          { index: 7, agent: "worker", task: `Authored task\n${hostile}`, exitCode: 0, finalOutput: "Substantive output", model: "provider/model", thinking: "high", context: "fork",
            usage: { input: 0, output: 5, cacheRead: 6, cacheWrite: 7, turns: 2, cost: 0.00000012 },
            acceptance: { status: "review-required", evidenceStatus: "checked", runtimeChecks: [{ id: "tests", status: "passed", message: "Checks passed" }] },
            ...(mode === "workflow" ? {
              review: { status: "blockers", findings: [{ severity: "blocker", file: "src/worker.ts", issue: "Review found regression", rationale: hostile }] },
              watchdog: { phase: "stale", seq: 0, lastUpdate: 0, reason: "Awaiting review", warnings: [{ severity: "blocker", importance: "high", category: "test-gap", summary: "Missing regression test", evidence: hostile, recommendedAction: "Add focused test", addressed: true, stalemate: false }] },
              runner: { type: "external-cli", command: "wrapper", args: ["--read-only", hostile], promptDelivery: "stdin", adapter: { id: "codex-exec", version: 1, executionMode: "one-shot-stdin" }, safety: { sandbox: "read-only", approvalPolicy: "never", ephemeral: true }, safetySource: { measured: false, command: "wrapper" }, nonResumableReason: "One-shot adapter" },
            } : {}),
          },
          { index: 2, agent: "reviewer", task: "Review", exitCode: 1, error: "Child failed", outputPartial: true, outputSaveError: "Disk full" },
        ],
        progress: [{ index: 7, agent: "worker", status: "running", task: "Live task", progressText: "Testing changes", toolCount: 3, tokens: 200, durationMs: 12000, currentTool: "read", currentToolArgs: hostile, recentOutput: ["line 1", "line 2"], recentTools: [{ tool: "bash", args: "npm test", endMs: 1000 }] }],
        ...(mode === "chain" ? { chainAgents: ["worker", "reviewer"], totalSteps: 2, currentStepIndex: 0 } : {}),
        ...(mode === "workflow" ? {
          preflight: { version: 1, coverage: "partial", lanes: [{ key: "impl", mode: "mutation", claims: ["src"], decision: "Allowed by supplied plan", expectedOutput: "Patch", independence: "Separate files" }] },
          preflightWarnings: ["Plan coverage partial"],
          workflowChildren: { version: 1, parentToolCallId: "parent-tool-ref", workflowRunId: "inventory-ref", inventoryComplete: false, workflowState: "running", children: [{ childId: "child-ref", agent: "inventory-worker", model: "reported/model", thinking: "medium", state: "running", activity: { currentTool: "grep", toolCount: 0, durationMs: 1200 } }] },
          workflowGraph: { runId: "graph-ref", mode: "workflow", currentNodeId: "monitor", phases: [{ title: "Acceptance phase", nodeIds: ["monitor"] }], nodes: [
            { id: "group", kind: "parallel-group", label: "Reported fanout", status: "partial", children: [
              { id: "worker", kind: "agent", label: "Graph worker", status: "completed", agent: "worker", outputName: "patch", acceptanceStatus: "review-required" },
              { id: "monitor", kind: "host-step", label: "Graph gate", status: "failed", hostStep: { version: 1, kind: "host-step", monitorKind: "ci", id: "monitor", label: "Graph gate", state: "done", verdict: "fail", detail: hostile, freshness: { expectedRef: "new-head", observedRef: "old-head", stale: true } } },
            ] },
          ] },
          workflow: { failureKind: "child", receipt: { version: 1, workflowRunId: "receipt-ref", state: "paused", hostSteps: [{ version: 1, kind: "host-step", monitorKind: "gate", id: "receipt-monitor", label: "Receipt gate", state: "done", verdict: "inconclusive", detail: "Gate needs evidence" }], entries: {
            impl: { key: "impl", agent: "worker", latestRunId: "latest-ref", requestedContext: "fork", resolvedContext: "fresh", resumability: { state: "not-resumable", reason: "Review first" }, continuation: { runIds: ["first-ref", "latest-ref"] }, lane: { version: 1, key: "impl", mode: "mutation", sourceRef: "base-ref", claims: ["src/**"], outputPaths: [hostile] }, terminalOutcome: { state: "partial", reason: "budget_exhausted" }, outputReference: "/private/output.md" },
          } }, trace: [
            { operation: "run", key: "impl", state: "started", phase: "build", label: "Implementation", agent: "worker", runId: "ref-only", durationMs: 0 },
            { operation: "host", key: "gate", state: "failed", phase: "acceptance", label: "Host check", error: "Checks blocked", warning: "Review required", reused: false },
          ], emits: [], console: [], preflightWarnings: ["Historical warning"] },
        } : {}),
      },
    },
  };
}
