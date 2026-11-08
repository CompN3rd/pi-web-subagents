import { test } from "node:test";
import assert from "node:assert/strict";
import { createContent, englishContent } from "../src/browser/localization.ts";
import { snapshotNotice } from "../src/browser/panel.ts";
import { SubagentsController } from "../src/browser/controller.ts";
import { localizationFixture } from "./host-fixtures.ts";

test("panel messages and regional formats follow host preferences with English fallback", () => {
  const fixture = localizationFixture();
  const content = createContent(fixture.service);
  const state = new SubagentsController(() => {}).state;
  assert.equal(content.t("refresh"), "Refresh status");
  assert.equal(snapshotNotice(state, content), "No status snapshot yet.");
  state.observedAt = Date.UTC(2026, 10, 8, 15, 30);
  fixture.change("es", "de-DE", { refresh: "Actualizar", staleSnapshot: "Datos antiguos" });
  assert.equal(content.t("refresh"), "Actualizar");
  assert.equal(content.t("stop"), englishContent.t("stop"));
  assert.equal(content.number(1234.5), "1.234,5");
  assert.equal(content.cost(1.25), new Intl.NumberFormat("de-DE", {
    style: "currency", currency: "USD", minimumFractionDigits: 4, maximumFractionDigits: 4,
  }).format(1.25));
  assert.equal(snapshotNotice(state, content), `Datos antiguos · ${new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium", timeStyle: "medium", timeZone: "UTC", hourCycle: "h23",
  }).format(state.observedAt)}`);
  const hostile = '<img src=x onerror="evil()">';
  assert.equal(content.t("confirmNote", { session: hostile }).includes(hostile), true, "localized strings remain text for Lit, not HTML");
});
