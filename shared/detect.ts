// Best-guess language detection for pasted code.
// Each rule adds points to one language when its pattern matches.
// The language with the most points wins. The user can always change it.

interface Rule {
  lang: string;
  re: RegExp;
  points: number;
  // When set, the rule counts each match (up to this many) instead of once.
  maxHits?: number;
}

const RULES: Rule[] = [
  // Power Automate: workflow expressions and flow definition JSON.
  { lang: "powerautomate", re: /@\{[^}]*\}/, points: 6 },
  { lang: "powerautomate", re: /"@[a-zA-Z]+\(/, points: 6 },
  { lang: "powerautomate", re: /(^|[^\w.])@?(triggerBody|triggerOutputs|outputs|body|items|variables|parameters|actions|workflow|item|utcNow|formatDateTime|addDays|createArray|coalesce|empty)\(/, points: 3, maxHits: 4 },
  { lang: "powerautomate", re: /\)\?\[['"]/, points: 4 },
  { lang: "powerautomate", re: /"type"\s*:\s*"(OpenApiConnection|ApiConnection|Compose|InitializeVariable|SetVariable|Foreach|If|Http|Response|Request|Scope|Until|Switch|Query|Select|ParseJson|Table)"/, points: 6 },
  { lang: "powerautomate", re: /"runAfter"\s*:/, points: 5 },
  { lang: "powerautomate", re: /__metadata|odata\.type|_api\/web\/lists/i, points: 3 },

  // Power Query M.
  { lang: "powerquery", re: /^\s*let\b/, points: 2 },
  { lang: "powerquery", re: /^\s*in\b\s*\n?\s*[#\w"]+\s*$/m, points: 4 },
  { lang: "powerquery", re: /#"[^"]+"/, points: 4, maxHits: 3 },
  { lang: "powerquery", re: /\b(Table|List|Text|Record|Number|Date|DateTime|Duration|Json|Web|Sql|Excel|SharePoint|Csv|Odbc|OData|Folder|File|Binary|Value|Splitter|Combiner|Replacer|Comparer|Lines|Expression)\.[A-Z][A-Za-z]*\(/, points: 4, maxHits: 4 },
  { lang: "powerquery", re: /\beach\s+[_\[]/, points: 4 },
  { lang: "powerquery", re: /\btype\s+(text|number|date|datetime|logical|table|list|record|nullable)\b/, points: 3 },
  { lang: "powerquery", re: /#(date|datetime|datetimezone|duration|time|table|binary)\(/, points: 4 },

  // DAX.
  { lang: "dax", re: /\b(CALCULATE|CALCULATETABLE|SUMX|AVERAGEX|COUNTX|MAXX|MINX|ALLEXCEPT|ALLSELECTED|RELATED|RELATEDTABLE|DIVIDE|SELECTEDVALUE|DATEADD|SAMEPERIODLASTYEAR|TOTALYTD|TOTALMTD|COUNTROWS|DISTINCTCOUNT|SUMMARIZE|SUMMARIZECOLUMNS|ADDCOLUMNS|EARLIER|USERELATIONSHIP|KEEPFILTERS|REMOVEFILTERS|TREATAS|LOOKUPVALUE|HASONEVALUE|ISINSCOPE|DATESYTD|DATESBETWEEN|FORMAT|SWITCH|BLANK|ISBLANK)\s*\(/, points: 3, maxHits: 5 },
  { lang: "dax", re: /\b(FILTER|ALL|VALUES|IF|SUM|MAX|MIN|AVERAGE)\s*\(/, points: 1, maxHits: 3 },
  { lang: "dax", re: /'[^'\n]+'\[[^\]"'\n]+\]/, points: 4 },
  { lang: "dax", re: /\b[A-Za-z_]\w*\[[^\]"'\n]+\]/, points: 2, maxHits: 3 },
  { lang: "dax", re: /^\s*(VAR|RETURN|EVALUATE|DEFINE|MEASURE)\b/m, points: 4, maxHits: 2 },
  { lang: "dax", re: /^\s*[\w ]+\s*:?=\s*(CALCULATE|SUM|DIVIDE|VAR|IF|COUNTROWS|SWITCH)/m, points: 3 },

  // Power Fx (Power Apps).
  { lang: "powerfx", re: /\b(Patch|LookUp|Collect|ClearCollect|Set|UpdateContext|Navigate|Notify|SubmitForm|ResetForm|NewForm|EditForm|Defaults|ForAll|IsBlank|IsEmpty|Coalesce|Concat|SortByColumns|AddColumns|ShowColumns|DropColumns|RenameColumns|RemoveIf|UpdateIf|Concurrent|Launch|Refresh|Reset|With|Office365Users\.\w+|User)\s*\(/, points: 3, maxHits: 5 },
  { lang: "powerfx", re: /\b(ThisItem|ThisRecord|Self|Parent)\.\w+/, points: 5 },
  { lang: "powerfx", re: /\b\w+\.(Selected|SelectedItems|Text|Value|AllItems|Updates|LastSubmit|Default|Items|DisplayName|Email)\b/, points: 1, maxHits: 4 },
  { lang: "powerfx", re: /\{\s*'?[A-Za-z][\w ]*'?\s*:\s*/, points: 2, maxHits: 3 },
  { lang: "powerfx", re: /'@odata\.type'\s*:/, points: 5 },
  { lang: "powerfx", re: /\b(Filter|Search|Sort|First|Last|Remove|If|Switch)\s*\(/, points: 1, maxHits: 3 },
  { lang: "powerfx", re: /;\s*\n\s*(Set|Patch|Navigate|Notify|Collect|Reset|UpdateContext)\(/, points: 3 },

  // PySpark.
  { lang: "pyspark", re: /\b(from|import)\s+pyspark\b/, points: 8 },
  { lang: "pyspark", re: /\bspark\.(read|sql|table|createDataFrame|range|catalog|conf)\b/, points: 6 },
  { lang: "pyspark", re: /\.(withColumn|withColumnRenamed|groupBy|orderBy|agg|alias|toPandas|createOrReplaceTempView|saveAsTable|partitionBy|cache|persist|unionByName|dropDuplicates)\(/, points: 3, maxHits: 4 },
  { lang: "pyspark", re: /\bF\.(col|lit|when|sum|count|avg|max|min|concat|to_date|current_date|expr|explode)\(/, points: 4, maxHits: 3 },
  { lang: "pyspark", re: /\bSparkSession\b|\bDataFrame\b|\bdisplay\(df/, points: 4 },

  // Python.
  { lang: "python", re: /^\s*(def|class)\s+\w+.*:\s*$/m, points: 5 },
  { lang: "python", re: /^\s*(import\s+\w+|from\s+[\w.]+\s+import\s+)/m, points: 4 },
  { lang: "python", re: /^\s*(elif|except|finally|with)\b.*:\s*$/m, points: 3 },
  { lang: "python", re: /^\s*(if|for|while)\b[^{;]*:\s*$/m, points: 2 },
  { lang: "python", re: /\b(print|len|range|self\.\w+|None|True|False)\b/, points: 1, maxHits: 3 },
  { lang: "python", re: /f"[^"]*\{[^}]+\}[^"]*"/, points: 2 },

  // SQL.
  { lang: "sql", re: /\bSELECT\b[\s\S]+?\bFROM\b/i, points: 5 },
  { lang: "sql", re: /\b(INSERT\s+INTO|UPDATE\s+[\w.\[\]]+\s+SET|DELETE\s+FROM|CREATE\s+(OR\s+REPLACE\s+)?(TABLE|VIEW|PROCEDURE|FUNCTION|INDEX)|ALTER\s+TABLE|MERGE\s+INTO|TRUNCATE\s+TABLE)\b/i, points: 5 },
  { lang: "sql", re: /\b(INNER|LEFT|RIGHT|FULL|CROSS)\s+(OUTER\s+)?JOIN\b|\bGROUP\s+BY\b|\bORDER\s+BY\b|\bWHERE\b/i, points: 2, maxHits: 3 },
  { lang: "sql", re: /^\s*(--|DECLARE\s+@|GO\s*$|WITH\s+\w+\s+AS\s*\()/im, points: 2 },

  // JSON gets a bonus later when the text parses.
  { lang: "json", re: /^\s*[{[]/, points: 1 },
  { lang: "json", re: /"[\w$@.-]+"\s*:\s*/, points: 1, maxHits: 3 },

  // YAML.
  { lang: "yaml", re: /^---\s*$/m, points: 3 },
  { lang: "yaml", re: /^[ \t]*[\w.-]+:[ \t]*(\S[^{};]*)?$/m, points: 1, maxHits: 5 },
  { lang: "yaml", re: /^[ \t]*-[ \t]+[\w"']/m, points: 2 },
  { lang: "yaml", re: /^(apiVersion|kind|services|version|steps|jobs|name|on):/m, points: 3 },

  // PowerShell.
  { lang: "powershell", re: /\b(Get|Set|New|Remove|Add|Invoke|Import|Export|Write|Connect|Disconnect|Start|Stop|Test|Select|Where|ForEach|Out|ConvertTo|ConvertFrom|Update|Install)-[A-Z]\w+/, points: 5, maxHits: 3 },
  { lang: "powershell", re: /\$[A-Za-z_]\w*/, points: 1, maxHits: 3 },
  { lang: "powershell", re: /\s-(eq|ne|gt|lt|ge|le|like|notlike|match|contains|and|or|not)\s/i, points: 3 },
  { lang: "powershell", re: /\[CmdletBinding\(\)\]|\bparam\s*\(|\$PSScriptRoot|\$_\.|\$null\b/i, points: 4 },

  // JavaScript and TypeScript.
  { lang: "javascript", re: /\b(const|let|var)\s+\w+\s*=/, points: 2, maxHits: 3 },
  { lang: "javascript", re: /=>|\bfunction\s*\w*\s*\(|console\.log\(|\brequire\(|\bmodule\.exports\b|\bdocument\.|\bwindow\.|\bawait\s+fetch\(/, points: 2, maxHits: 4 },
  { lang: "javascript", re: /^\s*(import\s+.+\s+from\s+['"]|export\s+(default|const|function|class))/m, points: 3 },
  { lang: "typescript", re: /^\s*(interface|type)\s+\w+\s*(=|\{|<)/m, points: 5 },
  { lang: "typescript", re: /:\s*(string|number|boolean|void|unknown|any)(\[\])?\s*[,;=)]/, points: 4 },

  // HTML.
  { lang: "html", re: /<!DOCTYPE\s+html|<html\b/i, points: 8 },
  { lang: "html", re: /<(div|span|p|a|table|tr|td|ul|li|head|body|script|style|section|button|input|form|img)\b[^>]*>/i, points: 3, maxHits: 3 },
  { lang: "html", re: /<\/(div|span|p|a|table|ul|li|body|section|button|form)>/i, points: 2 },

  // CSS.
  { lang: "css", re: /^[ \t]*[.#]?[\w-]+(\s*[,>+~]\s*[.#]?[\w-]+)*\s*\{\s*$/m, points: 2 },
  { lang: "css", re: /^\s*[a-z-]+\s*:\s*[^;{}]+;\s*$/m, points: 2, maxHits: 3 },
  { lang: "css", re: /@media\b|:root\s*\{|--[\w-]+\s*:/, points: 3 },

  // Bash.
  { lang: "bash", re: /^#!.*\b(ba)?sh\b/, points: 8 },
  { lang: "bash", re: /^\s*(sudo|apt(-get)?|echo|export|cd|chmod|chown|curl|wget|docker|systemctl|grep|mkdir)\s/m, points: 2, maxHits: 3 },
  { lang: "bash", re: /^\s*(fi|done|esac|then)\s*$/m, points: 3 },

  // C#.
  { lang: "csharp", re: /^\s*using\s+System(\.\w+)*\s*;/m, points: 6 },
  { lang: "csharp", re: /\b(public|private|internal|protected)\s+(static\s+)?(class|void|async|string|int|bool)\b|\bnamespace\s+\w|Console\.WriteLine/, points: 3, maxHits: 2 },

  // Markdown.
  { lang: "markdown", re: /^#{1,6}\s+\S/m, points: 2, maxHits: 2 },
  { lang: "markdown", re: /^```/m, points: 3 },
  { lang: "markdown", re: /\[[^\]]+\]\([^)]+\)/, points: 2 },
];

export interface Detection {
  language: string;
  score: number;
}

function countHits(re: RegExp, text: string, max: number): number {
  const global = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
  let hits = 0;
  while (hits < max && global.exec(text) !== null) hits++;
  return hits;
}

function parsesAsJson(text: string): boolean {
  const t = text.trim();
  if (!(t.startsWith("{") || t.startsWith("["))) return false;
  try {
    JSON.parse(t);
    return true;
  } catch {
    return false;
  }
}

/** Returns every language with a score above zero, best first. */
export function scoreLanguages(code: string): Detection[] {
  const text = code.slice(0, 20000);
  const scores = new Map<string, number>();
  const add = (lang: string, pts: number) => scores.set(lang, (scores.get(lang) ?? 0) + pts);

  for (const rule of RULES) {
    const hits = rule.maxHits ? countHits(rule.re, text, rule.maxHits) : rule.re.test(text) ? 1 : 0;
    if (hits > 0) add(rule.lang, rule.points * hits);
  }

  if (parsesAsJson(text)) add("json", 8);

  // PySpark is Python. Python signals also support a PySpark guess.
  const spark = scores.get("pyspark") ?? 0;
  if (spark > 0) add("pyspark", Math.min(scores.get("python") ?? 0, 6));

  // TypeScript is a superset of JavaScript.
  const ts = scores.get("typescript") ?? 0;
  if (ts > 0) add("typescript", scores.get("javascript") ?? 0);

  return [...scores.entries()]
    .map(([language, score]) => ({ language, score }))
    .sort((a, b) => b.score - a.score);
}

/** Returns the best-guess language id, or "plaintext" when nothing matches well. */
export function detectLanguage(code: string): string {
  if (code.trim().length === 0) return "plaintext";
  const [best] = scoreLanguages(code);
  return best && best.score >= 3 ? best.language : "plaintext";
}
