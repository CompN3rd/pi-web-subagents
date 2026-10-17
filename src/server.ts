import { PI_WEB_HOST_PI_SESSION_EVENTS_CAPABILITY } from "@jmfederico/pi-web/server-plugin-api";
import type { PiWebServerPlugin } from "@jmfederico/pi-web/server-plugin-api";
import { failure } from "./server/rpc-client.ts";
import { SessionRelay } from "./server/relay.ts";

const plugin = {
  apiVersion: 3,
  name: "Subagents",
  requires: [PI_WEB_HOST_PI_SESSION_EVENTS_CAPABILITY],
  activate(host) {
    let relay: SessionRelay | undefined;
    return {
      start({ capabilities }) {
        relay = new SessionRelay(capabilities.resolve(PI_WEB_HOST_PI_SESSION_EVENTS_CAPABILITY), host.lifetimeSignal);
      },
      peer: {
        request(context) {
          return relay?.request(context) ?? failure("unavailable", "not-sent", "Subagents backend has not started.");
        },
      },
      health() {
        return relay && !host.lifetimeSignal.aborted
          ? { status: "healthy" as const }
          : { status: "unhealthy" as const, message: "Subagents backend is not active." };
      },
      dispose() {
        relay?.dispose();
        relay = undefined;
      },
    };
  },
} satisfies PiWebServerPlugin;
export default plugin;
