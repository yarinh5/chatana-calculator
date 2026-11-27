import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MAX_DOCUMENT_BYTES,
  validateDocumentFile,
  validateDocumentMetadata,
} from "../src/lib/document-draft.ts";

const file = (name, type, bytes) => new File([Uint8Array.from(bytes)], name, { type });

test("accepts supported file signatures with matching extension and MIME", async () => {
  const samples = [
    ["contract.pdf", "application/pdf", [37, 80, 68, 70, 45, 49]],
    ["photo.jpg", "image/jpeg", [255, 216, 255, 224]],
    ["scan.png", "image/png", [137, 80, 78, 71, 13, 10, 26, 10]],
    ["preview.webp", "image/webp", [82, 73, 70, 70, 0, 0, 0, 0, 87, 69, 66, 80]],
  ];
  for (const [name, type, bytes] of samples) {
    assert.ok(await validateDocumentFile(file(name, type, bytes)));
  }
});

test("rejects disguised, unsupported, empty and oversized files", async () => {
  await assert.rejects(
    validateDocumentFile(file("fake.pdf", "application/pdf", [0, 1, 2])),
    /תוכן/,
  );
  await assert.rejects(
    validateDocumentFile(file("fake.pdf", "image/png", [37, 80, 68, 70, 45])),
    /סוג/,
  );
  await assert.rejects(validateDocumentFile(file("script.svg", "image/svg+xml", [1])), /PDF/);
  await assert.rejects(validateDocumentFile(file("empty.pdf", "application/pdf", [])), /ריק/);
  const large = new File([new Uint8Array(MAX_DOCUMENT_BYTES + 1)], "large.pdf", {
    type: "application/pdf",
  });
  await assert.rejects(validateDocumentFile(large), /גדול/);
});

test("normalizes metadata and rejects unknown vendor or oversized text", () => {
  assert.deepEqual(
    validateDocumentMetadata(
      { title: " חוזה ", category: "contract", vendorId: "v1", note: " הערה " },
      ["v1"],
    ),
    { title: "חוזה", category: "contract", vendorId: "v1", note: "הערה" },
  );
  assert.throws(
    () =>
      validateDocumentMetadata({ title: "שם", category: "contract", vendorId: "v2", note: "" }, [
        "v1",
      ]),
    /ספק/,
  );
  assert.throws(
    () =>
      validateDocumentMetadata({ title: " ", category: "contract", vendorId: null, note: "" }, []),
    /שם/,
  );
  assert.throws(
    () =>
      validateDocumentMetadata(
        { title: "שם", category: "contract", vendorId: null, note: "a".repeat(2001) },
        [],
      ),
    /ארוכה/,
  );
});
