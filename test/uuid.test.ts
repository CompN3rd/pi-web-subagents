import { test } from "node:test";
import assert from "node:assert/strict";
import { browserUuid } from "../src/browser/uuid.ts";

const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

test("browserUuid prefers native randomUUID with its crypto receiver", (t) => {
  const expected = "12345678-1234-4234-8234-123456789abc";
  const source = {
    randomUUID() {
      assert.equal(this, source);
      return expected;
    },
    getRandomValues() {
      assert.fail("native UUID must not use the fallback");
    },
  };
  t.mock.getter(globalThis, "crypto", () => source as unknown as Crypto);
  assert.equal(browserUuid(), expected);
});

test("browserUuid fallback produces distinct UUID v4 values from secure randomness", (t) => {
  const getRandomValues = crypto.getRandomValues.bind(crypto);
  t.mock.getter(globalThis, "crypto", () => ({ getRandomValues }) as Crypto);
  const ids = Array.from({ length: 1000 }, () => browserUuid());
  for (const id of ids) assert.match(id, uuidV4);
  assert.equal(new Set(ids).size, ids.length);
});

test("browserUuid fallback sets version and variant bits and preserves zero padding", (t) => {
  const source = {
    getRandomValues(bytes: Uint8Array) {
      assert.equal(this, source);
      assert.equal(bytes.length, 16);
      bytes[6] = 0xff;
      bytes[8] = 0xff;
      return bytes;
    },
  };
  t.mock.getter(globalThis, "crypto", () => source as unknown as Crypto);
  assert.equal(browserUuid(), "00000000-0000-4f00-bf00-000000000000");
});
