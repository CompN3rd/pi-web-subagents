import type { PiWebHostPiSessionConnection } from "@jmfederico/pi-web/server-plugin-api";
import { parseNativeRpcReply, ProtocolError, type RelayFailure, type RpcInput, type RpcReply } from "../protocol.ts";

export const RPC_REQUEST_EVENT = "subagents:rpc:v1:request";
export const RPC_REPLY_PREFIX = "subagents:rpc:v1:reply:";
export function failure(
  code: RelayFailure["code"],
  outcome: RelayFailure["outcome"],
  message: string,
  requestId?: string,
): RelayFailure {
  return { version: 1, kind: "relay-error", code, outcome, message, ...(requestId === undefined ? {} : { requestId }) };
}

/** A timeout/abort detaches observation, never cancels admitted upstream execution. */
export async function requestRpc(
  connection: PiWebHostPiSessionConnection,
  input: RpcInput,
  signal: AbortSignal,
  timeoutMs: number,
): Promise<RpcReply> {
  let emitted = false;
  let off: (() => void) | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const combined = AbortSignal.any([signal, connection.signal]);
  let onAbort: (() => void) | undefined;
  try {
    return await new Promise<RpcReply>((resolve) => {
      const interrupted = () =>
        resolve(
          failure(
            "closed",
            emitted ? "unknown" : "not-sent",
            emitted
              ? "Connection ended after emit; execution outcome is unknown. Do not resend mutations."
              : "Connection ended before emit.",
            input.requestId,
          ),
        );
      if (combined.aborted) {
        interrupted();
        return;
      }
      onAbort = interrupted;
      combined.addEventListener("abort", onAbort, { once: true });
      timer = setTimeout(
        () =>
          resolve(
            failure(
              "timeout",
              emitted ? "unknown" : "not-sent",
              "No correlated upstream reply before deadline. Execution may continue; do not resend mutations.",
              input.requestId,
            ),
          ),
        timeoutMs,
      );
      try {
        off = connection.on(`${RPC_REPLY_PREFIX}${input.requestId}`, (raw) => {
          try {
            // Relay errors are adapter-only, never a native upstream reply.
            const reply = parseNativeRpcReply(raw, input);
            resolve(
              "kind" in reply
                ? failure("invalid-payload", "unknown", "Unexpected upstream envelope", input.requestId)
                : reply,
            );
          } catch (error) {
            resolve(
              failure(
                error instanceof ProtocolError ? error.code : "invalid-payload",
                "unknown",
                "Invalid or mismatched upstream reply; execution outcome is unknown.",
                input.requestId,
              ),
            );
          }
        });
        if (combined.aborted) {
          interrupted();
          return;
        }
        // Mark before emit: a listener can admit work and then throw.
        emitted = true;
        connection.emit(RPC_REQUEST_EVENT, {
          version: 1,
          requestId: input.requestId,
          method: input.method,
          ...(input.params === undefined ? {} : { params: input.params }),
          source: { extension: "@compn3rd/pi-web-subagents" },
        });
      } catch {
        resolve(
          failure(
            "closed",
            emitted ? "unknown" : "not-sent",
            "Session event transport failed; no automatic retry.",
            input.requestId,
          ),
        );
      }
    });
  } finally {
    clearTimeout(timer);
    if (onAbort) combined.removeEventListener("abort", onAbort);
    off?.();
  }
}
