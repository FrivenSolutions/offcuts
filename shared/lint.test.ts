import { describe, expect, it } from "vitest";
import { lintCode } from "./lint";
import { SAMPLES } from "./samples";

describe("lintCode", () => {
  it("finds no issues in the valid samples", () => {
    for (const [lang, list] of Object.entries(SAMPLES)) {
      for (const code of list) expect(lintCode(code, lang), `${lang}: ${code.slice(0, 40)}`).toEqual([]);
    }
  });

  it("reports an unclosed bracket with its line", () => {
    expect(lintCode("CALCULATE(\n  SUM(Sales[Amount]),\n  ALL('Date'\n", "dax")).toEqual([
      { line: 3, message: 'Line 3: "(" is never closed.' },
      { line: 1, message: 'Line 1: "(" is never closed.' },
    ].reverse());
  });

  it("reports an extra or wrong closing bracket", () => {
    expect(lintCode("Patch(Items, {Title: 1}))", "powerfx")[0]!.message).toBe('Line 1: ")" has no matching "(".');
    expect(lintCode("Table.SelectRows(x, each [A] = 1]", "powerquery")[0]!.message).toBe('Line 1: "]" does not match "(" from line 1.');
  });

  it("ignores brackets inside strings and comments", () => {
    expect(lintCode('Text.Contains([Name], "(") // ) unmatched in comment', "powerquery")).toEqual([]);
    expect(lintCode("SELECT ')' AS x -- (\nFROM t /* ( */", "sql")).toEqual([]);
    expect(lintCode(`Set(x, "He said ""(hi"" ")`, "powerfx")).toEqual([]);
  });

  it("reports an unclosed string", () => {
    expect(lintCode('Notify("Saved, NotificationType.Success)', "powerfx")[0]!.message).toBe(
      "The string that starts on line 1 is never closed.",
    );
    expect(lintCode("x = 'abc\ny = 1", "python")[0]!.message).toBe("The string that starts on line 1 is never closed.");
  });

  it("checks Power Query let/in and DAX VAR/RETURN", () => {
    expect(lintCode('let\n  Source = 1,\n  #"Step" = Source + 1', "powerquery")).toEqual([
      { line: 1, message: '"let" has no matching "in" (1 let, 0 in).' },
    ]);
    expect(lintCode("Total =\nVAR x = SUM(Sales[Amount])", "dax")).toEqual([{ line: 1, message: '"VAR" needs a "RETURN".' }]);
  });

  it("reports invalid JSON with a line", () => {
    const [issue] = lintCode('{\n  "a": 1,\n  "b": \n}', "json");
    expect(issue!.line).toBe(4);
  });

  it("skips languages without rules", () => {
    expect(lintCode("<div>(", "html")).toEqual([]);
    expect(lintCode("key: [", "yaml")).toEqual([]);
  });
});
