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
          },
          { index: 2, agent: "reviewer", task: "Review", exitCode: 1, error: "Child failed", outputPartial: true, outputSaveError: "Disk full" },
        ],
        progress: [{ index: 7, agent: "worker", status: "running", task: "Live task", progressText: "Testing changes", toolCount: 3, tokens: 200, durationMs: 12000, currentTool: "read", currentToolArgs: hostile, recentOutput: ["line 1", "line 2"], recentTools: [{ tool: "bash", args: "npm test", endMs: 1000 }] }],
        ...(mode === "chain" ? { chainAgents: ["worker", "reviewer"], totalSteps: 2, currentStepIndex: 0 } : {}),
        ...(mode === "workflow" ? {
          preflight: { version: 1, coverage: "partial", lanes: [{ key: "impl", mode: "mutation", claims: ["src"], decision: "Allowed by supplied plan", expectedOutput: "Patch", independence: "Separate files" }] },
          preflightWarnings: ["Plan coverage partial"],
          workflow: { failureKind: "child", trace: [
            { operation: "run", key: "impl", state: "started", phase: "build", label: "Implementation", agent: "worker", runId: "ref-only", durationMs: 0 },
            { operation: "host", key: "gate", state: "failed", phase: "acceptance", label: "Host check", error: "Checks blocked", warning: "Review required", reused: false },
          ], emits: [], console: [], preflightWarnings: ["Historical warning"] },
        } : {}),
      },
    },
  };
}
