// Placeholders in code: {{Name}} or {{Name:default value}}.
// On copy, the app asks for a value for each name and fills it in everywhere.

export interface Placeholder {
  name: string;
  defaultValue: string;
}

// A name starts with a letter or "_", then letters, digits, spaces, ".", "_" or "-".
const PATTERN = /\{\{\s*([A-Za-z_][\w .-]*?)\s*(?::([^{}\n]*))?\}\}/g;

/** Lists each placeholder name once, in order of first use. The first non-empty default wins. */
export function findPlaceholders(code: string): Placeholder[] {
  const found = new Map<string, Placeholder>();
  for (const m of code.matchAll(PATTERN)) {
    const name = m[1]!;
    const def = (m[2] ?? "").trim();
    const prev = found.get(name);
    if (!prev) found.set(name, { name, defaultValue: def });
    else if (!prev.defaultValue && def) prev.defaultValue = def;
  }
  return [...found.values()];
}

/** Replaces every placeholder. An empty value falls back to the default. */
export function fillPlaceholders(code: string, values: Record<string, string>): string {
  const defaults = new Map(findPlaceholders(code).map((p) => [p.name, p.defaultValue]));
  return code.replace(PATTERN, (_all, name: string) => {
    const v = values[name];
    return v !== undefined && v !== "" ? v : (defaults.get(name) ?? "");
  });
}
