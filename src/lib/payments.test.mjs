import assert from "node:assert/strict";
import { test } from "node:test";
import { parsePaymentAmount } from "./payments.ts";

test("accepts positive payment amounts in whole agorot", () => {
  assert.equal(parsePaymentAmount("12"), 12);
  assert.equal(parsePaymentAmount("12.3"), 12.3);
  assert.equal(parsePaymentAmount("12.34"), 12.34);
  assert.equal(parsePaymentAmount(" 12.34 "), 12.34);
});

test("rejects fractions of an agora and unsafe or ambiguous amounts", () => {
  for (const value of ["0", "0.001", "12.345", "1e3", "12,34", "", "-1", "90071992547410"]) {
    assert.equal(parsePaymentAmount(value), null, value);
  }
});
