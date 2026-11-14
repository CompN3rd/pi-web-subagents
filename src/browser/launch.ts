import { parseRpcInput, type JsonObject } from "../protocol.js";

/** Build and validate the exact confirmation payload; inactive fields never leak. */
export function launchParams(data: FormData): JsonObject {
  const kind = String(data.get("kind"));
  if (!["agent", "script", "workflow"].includes(kind)) throw new Error("Unknown launch type");
  const params: JsonObject = { [kind]: String(data.get("source") ?? "").trim(), async: true };
  if (kind === "agent" && data.get("task")) params.task = String(data.get("task"));
  const args = String(data.get("args") ?? "").trim();
  if (kind !== "agent" && args) params.args = JSON.parse(args) as JsonObject;
  const model = String(data.get("model") ?? "").trim();
  if (model) params.model = model;
  const label = String(data.get("label") ?? "").trim();
  if (label) params.label = label;
  params.context = String(data.get("context"));
  parseRpcInput({ version: 1, sessionId: "validation", requestId: "validation", method: "spawn", params });
  return params;
}
