import type { HLJSApi, Language } from "highlight.js";

// Power Query M formula language.
export default function powerquery(hljs: HLJSApi): Language {
  return {
    name: "Power Query M",
    aliases: ["m", "pq"],
    case_insensitive: false,
    keywords: {
      keyword: "let in if then else each and or not try otherwise catch error as is meta section shared",
      literal: "true false null",
      type: "any anynonnull binary date datetime datetimezone duration function list logical none number record table text time type nullable optional",
    },
    contains: [
      hljs.C_LINE_COMMENT_MODE,
      hljs.C_BLOCK_COMMENT_MODE,
      // Quoted identifier: #"Changed Type"
      { scope: "variable", begin: /#"/, end: /"/, contains: [{ begin: /""/ }] },
      // Intrinsic constructors: #date, #table, ...
      { scope: "built_in", match: /#(date|datetime|datetimezone|duration|time|table|binary|infinity|nan|sections|shared)\b/ },
      { scope: "string", begin: /"/, end: /"/, contains: [{ begin: /""/ }] },
      // Library functions: Table.AddColumn, Text.Upper, ...
      { scope: "built_in", match: /\b[A-Z][A-Za-z0-9]*(\.[A-Z][A-Za-z0-9]*)+\b/ },
      // Field access: [Column Name]
      { scope: "attr", begin: /\[(?=[^\]\n]*\])/, end: /\]/, excludeBegin: false },
      hljs.C_NUMBER_MODE,
      { scope: "operator", match: /=>|<>|<=|>=|[=<>&+\-*/]/ },
    ],
  };
}
