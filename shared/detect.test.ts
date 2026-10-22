import { describe, expect, it } from "vitest";
import { detectLanguage } from "./detect";
import { SAMPLES } from "./samples";

describe("detectLanguage", () => {
  for (const [lang, list] of Object.entries(SAMPLES)) {
    list.forEach((code, i) => {
      it(`detects ${lang} sample ${i + 1}`, () => {
        expect(detectLanguage(code)).toBe(lang);
      });
    });
  }

  it("returns plaintext for empty input", () => {
    expect(detectLanguage("   ")).toBe("plaintext");
  });

  it("returns plaintext for ordinary prose", () => {
    expect(detectLanguage("Remember to ask the team about the new list")).toBe("plaintext");
  });
});
