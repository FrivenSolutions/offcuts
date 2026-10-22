import type { HLJSApi, Language } from "highlight.js";
import python from "highlight.js/lib/languages/python";

const SPARK_BUILT_INS = [
  "spark", "sc", "F", "T", "Window", "SparkSession", "DataFrame", "Row", "col", "lit", "when", "expr",
  "display", "dbutils", "mssparkutils", "notebookutils",
];

// PySpark: Python with Spark names highlighted as built-ins.
export default function pyspark(hljs: HLJSApi): Language {
  const base = python(hljs);
  const keywords = base.keywords as Record<string, string | string[]>;
  const builtIns = keywords.built_in;
  return {
    ...base,
    name: "PySpark",
    aliases: [],
    keywords: {
      ...keywords,
      built_in: [...(Array.isArray(builtIns) ? builtIns : String(builtIns ?? "").split(" ")), ...SPARK_BUILT_INS],
    },
  };
}
