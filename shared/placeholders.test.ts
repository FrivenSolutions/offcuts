import { describe, expect, it } from "vitest";
import { fillPlaceholders, findPlaceholders } from "./placeholders";

describe("placeholders", () => {
  const code = `_api/web/lists/getbytitle('{{ListName:Projects}}')/items({{ItemId}})
"Title": "{{ Title }}", "List": "{{ListName}}"`;

  it("finds each name once, with defaults", () => {
    expect(findPlaceholders(code)).toEqual([
      { name: "ListName", defaultValue: "Projects" },
      { name: "ItemId", defaultValue: "" },
      { name: "Title", defaultValue: "" },
    ]);
  });

  it("fills every use, and falls back to the default", () => {
    expect(fillPlaceholders(code, { ItemId: "42", Title: "Hello" })).toBe(
      `_api/web/lists/getbytitle('Projects')/items(42)
"Title": "Hello", "List": "Projects"`,
    );
  });

  it("allows spaces, dots and dashes in names, and colons in defaults", () => {
    expect(findPlaceholders("{{Site Url:https://contoso.sharepoint.com}} {{env.name}} {{a-b}}")).toEqual([
      { name: "Site Url", defaultValue: "https://contoso.sharepoint.com" },
      { name: "env.name", defaultValue: "" },
      { name: "a-b", defaultValue: "" },
    ]);
  });

  it("ignores Power Automate expressions and empty braces", () => {
    expect(findPlaceholders("@{triggerBody()?['ID']} {{}} {{ 1abc }} { {x} }")).toEqual([]);
  });

  it("uses a later default when the first use has none", () => {
    expect(findPlaceholders("{{A}} {{A:x}}")).toEqual([{ name: "A", defaultValue: "x" }]);
  });
});
