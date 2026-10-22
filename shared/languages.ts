// The list of languages a snippet can use.
// "id" is stored in the database. "hljs" is the highlight.js grammar name.
export interface LanguageInfo {
  id: string;
  label: string;
  hljs: string;
}

export const LANGUAGES: readonly LanguageInfo[] = [
  { id: "powerquery", label: "Power Query M", hljs: "powerquery" },
  { id: "dax", label: "DAX (Power BI)", hljs: "dax" },
  { id: "powerfx", label: "Power Fx (Power Apps)", hljs: "powerfx" },
  { id: "powerautomate", label: "Power Automate", hljs: "powerautomate" },
  { id: "pyspark", label: "PySpark", hljs: "pyspark" },
  { id: "python", label: "Python", hljs: "python" },
  { id: "sql", label: "SQL", hljs: "sql" },
  { id: "json", label: "JSON", hljs: "json" },
  { id: "yaml", label: "YAML", hljs: "yaml" },
  { id: "powershell", label: "PowerShell", hljs: "powershell" },
  { id: "javascript", label: "JavaScript", hljs: "javascript" },
  { id: "typescript", label: "TypeScript", hljs: "typescript" },
  { id: "html", label: "HTML", hljs: "xml" },
  { id: "css", label: "CSS", hljs: "css" },
  { id: "bash", label: "Bash", hljs: "bash" },
  { id: "csharp", label: "C#", hljs: "csharp" },
  { id: "markdown", label: "Markdown", hljs: "markdown" },
  { id: "plaintext", label: "Plain text", hljs: "plaintext" },
];

const BY_ID = new Map(LANGUAGES.map((l) => [l.id, l]));

export function isLanguageId(id: string): boolean {
  return BY_ID.has(id);
}

export function languageInfo(id: string): LanguageInfo {
  return BY_ID.get(id) ?? BY_ID.get("plaintext")!;
}
