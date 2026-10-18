import type { PiWebPlugin } from "@jmfederico/pi-web/plugin-api";
import { svg } from "lit";
import { html as elementHtml, unsafeStatic } from "lit/static-html.js";
import { SubagentsPanel } from "./browser/panel.js";
import { browserUuid } from "./browser/uuid.js";

const plugin = {
  apiVersion: 4,
  name: "Subagents",
  activate({ runtimePluginId, selection, lifetimeSignal }) {
    // A revision/activation-local element cannot reuse a different federated package's constructor.
    // Only our generated tag enters static markup; all upstream/user text remains ordinary Lit values.
    const name = `compn3rd-subagents-${browserUuid()}`;
    const tag = unsafeStatic(name);
    customElements.define(name, class extends SubagentsPanel {});
    return {
      contributions: {
        actions: [
          {
            id: "open",
            title: "Open Subagents",
            group: "Subagents",
            enabled: ({ state }) => !!state.selectedWorkspace,
            run: ({ selectWorkspaceTool }) =>
              selectWorkspaceTool(`${runtimePluginId}:subagents`),
          },
        ],
        workspacePanels: [
          {
            id: "subagents",
            title: "Subagents",
            // Automations uses 25; host pinning and layout still control placement.
            order: 26,
            icon: svg`<svg
              xmlns="http://www.w3.org/2000/svg"
              width="16" height="16" viewBox="0 0 24 24"
              fill="none" stroke="currentColor" stroke-width="1.5"
              stroke-linecap="round" stroke-linejoin="round"
              aria-hidden="true" focusable="false"
            >
              <circle cx="12" cy="5" r="3" />
              <path d="M12 8v9M5 17v-5h14v5" />
              <circle cx="5" cy="19" r="2" />
              <circle cx="12" cy="19" r="2" />
              <circle cx="19" cy="19" r="2" />
            </svg>`,
            render: (context) =>
              elementHtml`<${tag} .context=${context} .selection=${selection} .lifetime=${lifetimeSignal}></${tag}>`,
          },
        ],
      },
    };
  },
} satisfies PiWebPlugin;
export default plugin;
