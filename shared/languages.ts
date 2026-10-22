// The list of languages a snippet can use.
// "id" is stored in the database. "hljs" is the highlight.js grammar name.
export interface LanguageInfo {
  id: string;
  label: string;
  hljs: string;
  // File extension for downloads.
  ext: string;
}

export const LANGUAGES: readonly LanguageInfo[] = [
  { id: "powerquery", label: "Power Query M", hljs: "powerquery", ext: "pq" },
  { id: "dax", label: "DAX (Power BI)", hljs: "dax", ext: "dax" },
  { id: "powerfx", label: "Power Fx (Power Apps)", hljs: "powerfx", ext: "fx" },
  { id: "powerautomate", label: "Power Automate", hljs: "powerautomate", ext: "json" },
  { id: "pyspark", label: "PySpark", hljs: "pyspark", ext: "py" },
  { id: "python", label: "Python", hljs: "python", ext: "py" },
  { id: "sql", label: "SQL", hljs: "sql", ext: "sql" },
  { id: "json", label: "JSON", hljs: "json", ext: "json" },
  { id: "yaml", label: "YAML", hljs: "yaml", ext: "yaml" },
  { id: "powershell", label: "PowerShell", hljs: "powershell", ext: "ps1" },
  { id: "javascript", label: "JavaScript", hljs: "javascript", ext: "js" },
  { id: "typescript", label: "TypeScript", hljs: "typescript", ext: "ts" },
  { id: "html", label: "HTML", hljs: "xml", ext: "html" },
  { id: "css", label: "CSS", hljs: "css", ext: "css" },
  { id: "bash", label: "Bash", hljs: "bash", ext: "sh" },
  { id: "csharp", label: "C#", hljs: "csharp", ext: "cs" },
  { id: "markdown", label: "Markdown", hljs: "markdown", ext: "md" },
  { id: "plaintext", label: "Plain text", hljs: "plaintext", ext: "txt" },
];

const BY_ID = new Map(LANGUAGES.map((l) => [l.id, l]));

export function isLanguageId(id: string): boolean {
  return BY_ID.has(id);
}

export function languageInfo(id: string): LanguageInfo {
  return BY_ID.get(id) ?? BY_ID.get("plaintext")!;
}
