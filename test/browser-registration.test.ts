import { test } from "node:test";
import assert from "node:assert/strict";
import type {
  PluginActivationContextV5 as PluginActivationContext,
  PluginRuntimeContextV5 as PluginRuntimeContext,
  PluginStartContext,
  StylesheetIntegrationCapabilityV1,
} from "@jmfederico/pi-web/plugin-api";
import { html, svg } from "lit";
import plugin from "../src/browser.ts";
import { SubagentsPanel } from "../src/browser/panel.ts";
import { panelContext } from "./browser-fixtures.ts";
import { localizationFixture } from "./host-fixtures.ts";

function activationContext(runtimePluginId = "compn3rd.subagents"): PluginActivationContext {
  return {
    apiVersion: 5,
    pluginId: "compn3rd.subagents",
    runtimePluginId,
    html,
    svg,
    signal: new AbortController().signal,
    lifetimeSignal: new AbortController().signal,
    selection: { getSnapshot: () => ({}), subscribe: () => () => {} },
  };
}

function withRegistry(check: (registered: Map<string, CustomElementConstructor>) => void): void {
  const original = Object.getOwnPropertyDescriptor(globalThis, "customElements");
  const registered = new Map<string, CustomElementConstructor>();
  Object.defineProperty(globalThis, "customElements", {
    configurable: true,
    value: {
      define(name: string, constructor: CustomElementConstructor) {
        assert.ok(!registered.has(name), "activation tags must not collide");
        registered.set(name, constructor);
      },
    },
  });
  try {
    check(registered);
  } finally {
    if (original) Object.defineProperty(globalThis, "customElements", original);
    else Reflect.deleteProperty(globalThis, "customElements");
  }
}

test("browser start resolves shared styles once and localized contributions follow host changes", () => {
  withRegistry((registered) => {
    const localization = localizationFixture();
    const activation = plugin.activate({ ...activationContext(), localization: localization.service });
    const calls: unknown[] = [];
    const styles: StylesheetIntegrationCapabilityV1 = {
      registerRoot: () => () => {},
      subscribe: () => () => {},
      createController: (_host, options) => { calls.push(options); },
    };
    activation.start({
      signal: new AbortController().signal,
      capabilities: {
        resolve(token: typeof plugin.requires[0]) {
          assert.deepEqual([token.pluginId, token.id, token.version], ["pi-web", "stylesheet-integration", 1]);
          assert.throws(() => token.parse!({}), /unavailable/);
          return token.parse!(styles);
        },
      } as PluginStartContext["capabilities"],
    });
    const Constructor = [...registered.values()][0]!;
    const panel = new Constructor() as SubagentsPanel;
    assert.deepEqual(calls, [{ sharedUi: true }]);
    assert.equal(panel.content.localization, localization.service);
    localization.change("es", "es-ES", { title: "Subagentes", open: "Abrir subagentes" });
    assert.equal(activation.contributions.workspacePanels[0]!.title, "Subagentes");
    assert.equal(activation.contributions.actions[0]!.title, "Abrir subagentes");
  });
});

test("browser registration keeps one API5 workspace panel with static hierarchy icon and order 26", () => {
  withRegistry(() => {
    const { contributions } = plugin.activate(activationContext());
    assert.equal(plugin.apiVersion, 5);
    assert.equal(contributions.workspacePanels.length, 1);
    assert.ok(!("applicationPanels" in contributions), "no duplicate application tab");
    const panel = contributions.workspacePanels[0]!;
    assert.equal(panel.id, "subagents");
    assert.equal(panel.title, "Subagents");
    assert.equal(panel.order, 26);
    assert.deepEqual(panel.icon.values, [], "icon has no dynamic/untrusted values");
    const markup = panel.icon.strings.join("");
    assert.match(markup, /<svg\s/);
    assert.match(markup, /viewBox="0 0 24 24"/);
    assert.match(markup, /stroke="currentColor"/);
    assert.match(markup, /aria-hidden="true"/);
    assert.equal((markup.match(/<circle\s/g) ?? []).length, 4, "parent and three children");
    assert.doesNotMatch(markup, /<script|<foreignObject|\bon\w+=|\bhref=/i);
  });
});

test("browser registration preserves local action and runtime-qualified navigation for federated IDs", () => {
  withRegistry(() => {
    for (const runtimeId of ["compn3rd.subagents", "remote-machine.compn3rd.subagents"]) {
      const { contributions } = plugin.activate(activationContext(runtimeId));
      assert.equal(contributions.actions.length, 1);
      const action = contributions.actions[0]!;
      assert.equal(action.id, "open");
      assert.equal(action.title, "Open Subagents");
      assert.equal(action.enabled({ state: {} } as PluginRuntimeContext), false);
      assert.equal(action.enabled({ state: panelContext().state } as PluginRuntimeContext), true);
      let selected = "";
      action.run({
        selectWorkspaceTool: (id: string) => { selected = id; },
      } as PluginRuntimeContext);
      assert.equal(selected, `${runtimeId}:subagents`);
    }
  });
});

test("browser registration retains activation-local constructors and pure escaped context/lifetime bindings", () => {
  withRegistry((registered) => {
    const context = activationContext();
    const first = plugin.activate(context).contributions.workspacePanels[0]!;
    const second = plugin.activate(context).contributions.workspacePanels[0]!;
    assert.equal(registered.size, 2);
    const entries = [...registered];
    assert.notEqual(entries[0]![1], entries[1]![1]);
    for (const [name, constructor] of entries) {
      assert.match(name, /^compn3rd-subagents-[0-9a-f-]+$/);
      assert.equal(Object.getPrototypeOf(constructor.prototype), SubagentsPanel.prototype);
    }
    let calls = 0;
    const workspace = panelContext(async () => { calls++; return null; });
    const untrusted = '<img src=x onerror="alert(1)">';
    workspace.workspace = { ...workspace.workspace, label: untrusted };
    for (let n = 0; n < 10; n++) {
      const template = first.render(workspace);
      const markup = template.strings.join("");
      assert.ok(markup.includes(entries[0]![0]));
      assert.ok(!markup.includes(entries[1]![0]));
      assert.ok(!markup.includes(untrusted));
      assert.deepEqual(template.values, [workspace, context.selection, context.lifetimeSignal]);
    }
    assert.ok(second.render(workspace).strings.join("").includes(entries[1]![0]));
    assert.equal(calls, 0, "contribution render does not perform peer I/O");
    assert.equal(context.lifetimeSignal.aborted, false);
  });
});
