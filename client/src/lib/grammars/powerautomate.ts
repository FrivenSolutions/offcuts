import type { HLJSApi, Language, Mode } from "highlight.js";

// Power Automate (Logic Apps) workflow definition language.
// Handles flow JSON, plain expressions, and @{...} expressions inside strings.
export default function powerautomate(hljs: HLJSApi): Language {
  const SINGLE_QUOTED: Mode = { scope: "string", begin: /'/, end: /'/, contains: [{ begin: /''/ }] };
  const FUNCTION: Mode = { scope: "built_in", match: /\b[a-zA-Z_][a-zA-Z0-9_]*(?=\()/ };
  const NUMBER: Mode = { scope: "number", match: /-?\b\d+(\.\d+)?\b/ };
  const LITERAL: Mode = { scope: "literal", match: /\b(true|false|null)\b/ };
  const EXPRESSION_BODY: Mode[] = [FUNCTION, SINGLE_QUOTED, NUMBER, LITERAL, { scope: "operator", match: /\?/ }];

  // @{ ... } inside a string.
  const INTERPOLATION: Mode = {
    scope: "subst",
    begin: /@\{/,
    end: /\}/,
    contains: EXPRESSION_BODY,
  };
  // A string that is one whole expression: "@triggerBody()?['ID']"
  const EXPRESSION_STRING: Mode = {
    scope: "subst",
    begin: /"(?=@[a-zA-Z])/,
    end: /"/,
    contains: [{ match: /@/ }, ...EXPRESSION_BODY],
  };
  const KEY: Mode = {
    scope: "attr",
    begin: /"(?=(\\.|[^"\\])*"\s*:)/,
    end: /"/,
    contains: [hljs.BACKSLASH_ESCAPE],
  };
  const STRING: Mode = {
    scope: "string",
    begin: /"/,
    end: /"/,
    contains: [hljs.BACKSLASH_ESCAPE, INTERPOLATION],
  };

  return {
    name: "Power Automate",
    aliases: ["logicapps", "flow"],
    contains: [
      KEY,
      EXPRESSION_STRING,
      STRING,
      INTERPOLATION,
      { scope: "meta", match: /@(?=[a-zA-Z{])/ },
      ...EXPRESSION_BODY,
      { scope: "punctuation", match: /[{}[\],:]/, relevance: 0 },
    ],
  };
}
