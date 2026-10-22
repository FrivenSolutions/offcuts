import { describe, expect, it } from "vitest";
import { SAMPLES } from "../../../shared/samples";
import { highlight } from "./highlight";

describe("highlight", () => {
  for (const [lang, list] of Object.entries(SAMPLES)) {
    it(`highlights ${lang} samples`, () => {
      for (const code of list) {
        const html = highlight(code, lang);
        expect(html).toContain('class="hljs-');
        // The text must survive highlighting unchanged.
        const text = html.replace(/<[^>]+>/g, "").replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
        expect(text).toBe(code);
      }
    });
  }

  it("escapes HTML in code", () => {
    expect(highlight("<script>alert(1)</script>", "plaintext")).not.toContain("<script>");
  });

  it("marks Power Automate expressions inside strings", () => {
    expect(highlight(`"Title": "@{triggerBody()?['Title']}"`, "powerautomate")).toContain('hljs-subst');
  });
});
