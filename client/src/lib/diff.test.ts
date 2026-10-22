import { describe, expect, it } from "vitest";
import { diffLines } from "./diff";

describe("diffLines", () => {
  it("marks added, removed and unchanged lines", () => {
    expect(diffLines("a\nb\nc", "a\nx\nc\nd")).toEqual([
      { kind: "same", text: "a" },
      { kind: "remove", text: "b" },
      { kind: "add", text: "x" },
      { kind: "same", text: "c" },
      { kind: "add", text: "d" },
    ]);
  });

  it("handles empty text", () => {
    expect(diffLines("", "a")).toEqual([{ kind: "add", text: "a" }]);
    expect(diffLines("a", "")).toEqual([{ kind: "remove", text: "a" }]);
    expect(diffLines("", "")).toEqual([]);
  });
});
