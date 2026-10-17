import type { PiWebPlugin } from "@jmfederico/pi-web/plugin-api";
import { html as elementHtml, unsafeStatic } from "lit/static-html.js";
import { SubagentsPanel } from "./browser/panel.js";

const plugin = {
  apiVersion: 4,
  name: "Subagents",
  activate({ runtimePluginId, selection, lifetimeSignal }) {
    // A revision/activation-local element cannot reuse a different federated package's constructor.
    // Only our generated tag enters static markup; all upstream/user text remains ordinary Lit values.
    const name = `compn3rd-subagents-${crypto.randomUUID()}`;
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
            render: (context) =>
              elementHtml`<${tag} .context=${context} .selection=${selection} .lifetime=${lifetimeSignal}></${tag}>`,
          },
        ],
      },
    };
  },
} satisfies PiWebPlugin;
export default plugin;
