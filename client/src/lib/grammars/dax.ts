import type { HLJSApi, Language } from "highlight.js";

// DAX (Data Analysis Expressions) for Power BI, Analysis Services and Power Pivot.
export default function dax(hljs: HLJSApi): Language {
  return {
    name: "DAX",
    case_insensitive: true,
    keywords: {
      keyword: "var return define evaluate measure column table order by asc desc start at in not and or",
      literal: "true false blank",
    },
    contains: [
      hljs.C_LINE_COMMENT_MODE,
      hljs.C_BLOCK_COMMENT_MODE,
      hljs.COMMENT(/--/, /$/),
      { scope: "string", begin: /"/, end: /"/, contains: [{ begin: /""/ }] },
      // Table reference: 'Sales Table'
      { scope: "title", begin: /'/, end: /'/, contains: [{ begin: /''/ }] },
      // Column or measure reference: [Total Sales]
      { scope: "attr", begin: /\[/, end: /\]/ },
      // Function call: CALCULATE(, DATESYTD(
      { scope: "built_in", match: /\b[A-Za-z][A-Za-z0-9_.]*(?=\s*\()/ },
      hljs.C_NUMBER_MODE,
      { scope: "operator", match: /:=|&&|\|\||<>|<=|>=|==|[=<>&+\-*/^]/ },
    ],
  };
}
