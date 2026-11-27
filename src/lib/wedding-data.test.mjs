import assert from "node:assert/strict";
import { test } from "node:test";
import { formatILS } from "./wedding-data.ts";

test("currency display shows whole shekels without decimals and preserves agorot", () => {
  assert.equal(formatILS(12), "12 ₪");
  assert.equal(formatILS(0.01), "0.01 ₪");
  assert.equal(formatILS(12.34), "12.34 ₪");
});
