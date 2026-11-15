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

test("USD display removes binary noise but preserves tiny nonzero costs across locales", () => {
  const fixture = localizationFixture();
  const content = createContent(fixture.service);
  for (const locale of ["en-US", "de-DE", "ar-EG"]) {
    fixture.change("en", locale, { unknown: "Unknown cost" });
    const money = (value: number, scientific = false) => new Intl.NumberFormat(locale, {
      style: "currency", currency: "USD", minimumFractionDigits: 4, maximumFractionDigits: 8,
      notation: scientific ? "scientific" : "standard",
    }).format(value);
    for (const value of [0, -0, 1.25, -1.25, 1e-8, 0.000012345, 0.0728648 + 0.0876352]) {
      assert.equal(content.cost(value), money(value));
    }
    assert.equal(content.cost(0.0728648 + 0.0876352), money(0.1605));
    assert.equal(content.cost(0.000012345), money(0.00001235));
    for (const value of [1e-9, -1e-9, 1.23456789e-20, Number.MIN_VALUE]) {
      assert.equal(content.cost(value), money(value, true));
      assert.notEqual(content.cost(value), money(0));
    }
    const { cost } = content;
    for (const value of [NaN, Infinity, -Infinity]) assert.equal(cost(value), "Unknown cost");
  }
  assert.equal(englishContent.cost(0.16049999999999998), new Intl.NumberFormat(undefined, {
    style: "currency", currency: "USD", minimumFractionDigits: 4, maximumFractionDigits: 8,
  }).format(0.1605));
  assert.equal(englishContent.cost(NaN), "unknown");
});
