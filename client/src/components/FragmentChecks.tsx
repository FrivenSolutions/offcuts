import { useDeferredValue, useMemo } from "react";
import { lintCode } from "../../../shared/lint";
import { findPlaceholders } from "../../../shared/placeholders";

/** Shows code check warnings and found placeholders under a fragment in the editor. */
export function FragmentChecks({ code, language }: { code: string; language: string }) {
  // Checks run on a deferred copy, so typing stays smooth in long code.
  const deferred = useDeferredValue(code);
  const issues = useMemo(() => lintCode(deferred, language), [deferred, language]);
  const names = useMemo(() => findPlaceholders(deferred).map((p) => p.name), [deferred]);
  if (issues.length === 0 && names.length === 0) return null;
  return (
    <div className="fragment-checks">
      {issues.length > 0 && (
        <ul className="lint-list" aria-label="Code check warnings">
          {issues.map((i, k) => (
            <li key={k}>⚠ {i.message}</li>
          ))}
        </ul>
      )}
      {names.length > 0 && (
        <p className="muted small">Placeholders found: {names.map((n) => `{{${n}}}`).join(", ")}</p>
      )}
    </div>
  );
}
