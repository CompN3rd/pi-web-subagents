import type {
  LocalizedMessages, MessageDefinitions, PluginLocalization,
  StylesheetIntegrationCapabilityV1,
} from "@jmfederico/pi-web/plugin-api";

/** Small public-contract fake, not a PI WEB localization or CSS implementation. */
export function localizationFixture() {
  const listeners = new Set<() => void | Promise<void>>();
  const preferences = { language: "en", formatLocale: "en-US", timeZone: "UTC", hourCycle: "h23" as const };
  let translations: Record<string, string> = {};
  let direction: "ltr" | "rtl" = "ltr";
  const service: PluginLocalization = {
    preferences,
    get language() { return preferences.language; },
    get direction() { return direction; },
    ready: Promise.resolve(),
    message: (message, description) => ({ message, description }),
    subscribe(fn) { listeners.add(fn); return () => { listeners.delete(fn); }; },
    registerMessages<Definitions extends MessageDefinitions>(_namespace: string, definitions: Definitions): LocalizedMessages<Definitions> {
      const t = (key: keyof Definitions & string, values: Record<string, unknown> = {}) => {
        const source = translations[key] ?? definitions[key]!.message;
        return source.replace(/\{(\w+)\}/g, (_, name: string) => String(values[name] ?? ""));
      };
      return { t, rich: t } as LocalizedMessages<Definitions>;
    },
    registerCatalog() { return () => {}; },
    controller(host) {
      let off: (() => void) | undefined;
      const controller = {
        hostConnected() { off = service.subscribe(() => host.requestUpdate()); },
        hostDisconnected() { off?.(); off = undefined; },
      };
      host.addController(controller);
      return controller;
    },
    number: (value, options) => new Intl.NumberFormat(preferences.formatLocale, options).format(value),
    date: (value, options) => new Intl.DateTimeFormat(preferences.formatLocale, { timeZone: preferences.timeZone, hourCycle: preferences.hourCycle, ...options }).format(value),
    time: (value, options) => new Intl.DateTimeFormat(preferences.formatLocale, options).format(value),
    relativeTime: (value, unit, options) => new Intl.RelativeTimeFormat(preferences.formatLocale, options).format(value, unit),
    list: (values, options) => new Intl.ListFormat(preferences.formatLocale, options).format(values),
  };
  return {
    service,
    get subscribers() { return listeners.size; },
    change(language: string, formatLocale: string, messages: Record<string, string>, dir: "ltr" | "rtl" = "ltr") {
      preferences.language = language;
      preferences.formatLocale = formatLocale;
      translations = messages;
      direction = dir;
      for (const listener of listeners) void listener();
    },
  };
}

export function stylesheetFixture() {
  const roots = new Set<ShadowRoot>();
  const service: StylesheetIntegrationCapabilityV1 = {
    registerRoot(root, options) {
      roots.add(root);
      // Only enough shared control presentation for isolated interaction tests.
      // This fake does not certify the current host's experimental CSS bundle.
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(options?.sharedUi ? `.ui-button,.ui-select{font:inherit;color:var(--pi-text,inherit);background:var(--pi-surface,transparent);border:1px solid var(--pi-border,#888);padding:6px 10px;min-height:32px}.ui-button{cursor:pointer}.ui-button:disabled{opacity:.45;cursor:default}` : "");
      root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet];
      return () => {
        roots.delete(root);
        root.adoptedStyleSheets = root.adoptedStyleSheets.filter((value) => value !== sheet);
      };
    },
    subscribe() { return () => {}; },
    createController(host, options) {
      let off: (() => void) | undefined;
      let connected = false;
      host.addController({
        hostConnected() { connected = true; },
        hostUpdated() {
          if (connected && !off && host.renderRoot instanceof ShadowRoot) off = service.registerRoot(host.renderRoot, options);
        },
        hostDisconnected() { connected = false; off?.(); off = undefined; },
      });
    },
  };
  return { service, roots };
}
