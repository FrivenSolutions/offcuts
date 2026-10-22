import type { HLJSApi, Language } from "highlight.js";

// Power Fx, the formula language of Power Apps.
export default function powerfx(hljs: HLJSApi): Language {
  const STRING = {
    scope: "string",
    variants: [
      {
        // Interpolated string: $"Hello {User().FullName}"
        begin: /\$"/,
        end: /"/,
        contains: [{ begin: /""/ }, { scope: "subst", begin: /\{/, end: /\}/ }],
      },
      { begin: /"/, end: /"/, contains: [{ begin: /""/ }] },
    ],
  };
  return {
    name: "Power Fx",
    case_insensitive: false,
    keywords: {
      keyword: "And Or Not in exactin As",
      literal: "true false",
      "variable.language": "ThisItem ThisRecord Self Parent",
    },
    contains: [
      hljs.C_LINE_COMMENT_MODE,
      hljs.C_BLOCK_COMMENT_MODE,
      STRING,
      // Quoted name: 'Project List', '@odata.type'
      { scope: "title", begin: /'/, end: /'/, contains: [{ begin: /''/ }] },
      // Function call: Patch(, LookUp(, Office365Users.MyProfileV2(
      { scope: "built_in", match: /\b[A-Za-z][A-Za-z0-9]*(\.[A-Za-z][A-Za-z0-9]*)*(?=\s*\()/ },
      // Enum value: Color.Red, ScreenTransition.Fade
      { scope: "type", match: /\b(Color|ScreenTransition|NotificationType|DisplayMode|Align|VerticalAlign|FontWeight|Icon|SortOrder|TextFormat|DataSourceInfo|ErrorKind|RecordInfo|StartScreen)\.[A-Za-z]+\b/ },
      // Record field name: { Title: ... }
      { scope: "attr", match: /\b[A-Za-z_][A-Za-z0-9_]*(?=\s*:(?!=))/ },
      hljs.C_NUMBER_MODE,
      { scope: "operator", match: /&&|\|\||<>|<=|>=|[=<>&+\-*/^!@]/ },
    ],
  };
}
