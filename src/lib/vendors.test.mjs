import assert from "node:assert/strict";
import { test } from "node:test";
import { EMPTY_VENDOR_FORM, formatVendorQuote, normalizeVendorForm } from "./vendors.ts";

function withQuote(initial_quote) {
  return { ...EMPTY_VENDOR_FORM, business_name: "ספק", category: "צילום", initial_quote };
}

test("vendor quote accepts shekels and whole agorot without changing the submitted value", () => {
  for (const [input, expected] of [
    ["", null],
    ["0", 0],
    ["12", 12],
    ["12.34", 12.34],
  ]) {
    const result = normalizeVendorForm(withQuote(input));
    assert.equal(result.error, null, input);
    assert.equal(result.payload.initial_quote, expected, input);
  }
});

test("vendor quote rejects a fraction of an agora or ambiguous numeric input", () => {
  for (const input of ["0.001", "12.345", "1e3", "-1", "12,34", "90071992547410"]) {
    assert.ok(normalizeVendorForm(withQuote(input)).error, input);
  }
});

test("vendor quote display preserves stored fractional values", () => {
  assert.match(formatVendorQuote(12.34), /12\.34/u);
  assert.match(formatVendorQuote(0.001), /0\.001/u);
});
