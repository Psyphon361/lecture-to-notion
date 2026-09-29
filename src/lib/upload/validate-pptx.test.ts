import { describe, expect, it } from "vitest";

import {
  uploadRejectionMessage,
  validatePptx,
} from "@/lib/upload/validate-pptx";

const zipMagic = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);

describe("validatePptx", () => {
  it("accepts a zip-backed pptx under the cap", () => {
    expect(
      validatePptx({
        filename: "Lecture.PPTX",
        byteLength: 1024,
        magic: zipMagic,
      }),
    ).toEqual({ ok: true });
  });

  it("rejects other extensions, oversized files, and non-zip bytes", () => {
    expect(
      validatePptx({ filename: "notes.pdf", byteLength: 10, magic: zipMagic })
        .ok,
    ).toBe(false);
    expect(
      validatePptx({
        filename: "notes.pptx",
        byteLength: 50 * 1024 * 1024 + 1,
        magic: zipMagic,
      }),
    ).toEqual({ ok: false, reason: "size" });
    expect(
      validatePptx({
        filename: "notes.pptx",
        byteLength: 10,
        magic: new Uint8Array([0x25, 0x50, 0x44, 0x46]),
      }),
    ).toEqual({ ok: false, reason: "magic" });
    expect(uploadRejectionMessage("extension")).toMatch(/\.pptx/);
  });
});
