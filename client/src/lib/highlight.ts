import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import csharp from "highlight.js/lib/languages/csharp";
import css from "highlight.js/lib/languages/css";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import markdown from "highlight.js/lib/languages/markdown";
import plaintext from "highlight.js/lib/languages/plaintext";
import powershell from "highlight.js/lib/languages/powershell";
import python from "highlight.js/lib/languages/python";
import sql from "highlight.js/lib/languages/sql";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";
import { languageInfo } from "../../../shared/languages";
import dax from "./grammars/dax";
import powerautomate from "./grammars/powerautomate";
import powerfx from "./grammars/powerfx";
import powerquery from "./grammars/powerquery";
import pyspark from "./grammars/pyspark";

hljs.registerLanguage("bash", bash);
hljs.registerLanguage("csharp", csharp);
hljs.registerLanguage("css", css);
hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("json", json);
hljs.registerLanguage("markdown", markdown);
hljs.registerLanguage("plaintext", plaintext);
hljs.registerLanguage("powershell", powershell);
hljs.registerLanguage("python", python);
hljs.registerLanguage("sql", sql);
hljs.registerLanguage("typescript", typescript);
hljs.registerLanguage("xml", xml);
hljs.registerLanguage("yaml", yaml);
hljs.registerLanguage("dax", dax);
hljs.registerLanguage("powerautomate", powerautomate);
hljs.registerLanguage("powerfx", powerfx);
hljs.registerLanguage("powerquery", powerquery);
hljs.registerLanguage("pyspark", pyspark);

/** Returns highlighted HTML. highlight.js escapes the code text. */
export function highlight(code: string, languageId: string): string {
  const name = languageInfo(languageId).hljs;
  try {
    return hljs.highlight(code, { language: name, ignoreIllegals: true }).value;
  } catch {
    return hljs.highlight(code, { language: "plaintext" }).value;
  }
}
