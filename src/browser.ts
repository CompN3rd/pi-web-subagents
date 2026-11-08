import type { PiWebPluginV5, PluginCapability, PluginStartContext, StylesheetIntegrationCapabilityV1 } from "@jmfederico/pi-web/plugin-api";
import { svg } from "lit";
import { html as elementHtml, unsafeStatic } from "lit/static-html.js";
import { SubagentsPanel } from "./browser/panel.js";
import { browserUuid } from "./browser/uuid.js";
import { createContent } from "./browser/localization.js";

const stylesheetIntegration: PluginCapability<StylesheetIntegrationCapabilityV1> = {
  pluginId: "pi-web", id: "stylesheet-integration", version: 1,
  parse(value) {
    if (!value || typeof value !== "object" ||
        !("registerRoot" in value) || typeof value.registerRoot !== "function" ||
        !("createController" in value) || typeof value.createController !== "function" ||
        !("subscribe" in value) || typeof value.subscribe !== "function")
      throw new Error("Stylesheet integration v1 unavailable");
    return value as StylesheetIntegrationCapabilityV1;
  },
};

const plugin = {
  apiVersion: 5,
  name: "Subagents",
  requires: [stylesheetIntegration],
  activate({ runtimePluginId, selection, lifetimeSignal, localization }) {
    const content = createContent(localization);
    const { t } = content;
    let styles: StylesheetIntegrationCapabilityV1 | undefined;
    // A revision/activation-local element cannot reuse a different federated package's constructor.
    // Only our generated tag enters static markup; all upstream/user text remains ordinary Lit values.
    const name = `compn3rd-subagents-${browserUuid()}`;
    const tag = unsafeStatic(name);
    customElements.define(name, class extends SubagentsPanel {
      constructor() {
        super();
        this.content = content;
        if (!styles) throw new Error("Subagents panel mounted before plugin start");
        styles.createController(this, { sharedUi: true });
        localization?.controller(this);
      }
    });
    return {
      start({ capabilities }: PluginStartContext) {
        styles = capabilities.resolve(stylesheetIntegration);
      },
      contributions: {
        actions: [
          {
            id: "open",
            get title() { return t("open"); },
            get group() { return t("title"); },
            enabled: ({ state }) => !!state.selectedWorkspace,
            run: ({ selectWorkspaceTool }) =>
              selectWorkspaceTool(`${runtimePluginId}:subagents`),
          },
        ],
        workspacePanels: [
          {
            id: "subagents",
            get title() { return t("title"); },
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
} satisfies PiWebPluginV5;
export default plugin;
