import { useRef, useState } from "react";
import { api } from "../lib/api";

type Mode = "skip" | "replace" | "keep";

interface Check {
  total: number;
  valid: number;
  invalid: { index: number; title: string; error: string }[];
  duplicates: string[];
}

interface Result {
  created: number;
  replaced: number;
  skipped: number;
  failed: number;
}

const SHOW = 10;

function ShortList({ items }: { items: string[] }) {
  return (
    <ul className="import-list">
      {items.slice(0, SHOW).map((item, i) => (
        <li key={i}>{item}</li>
      ))}
      {items.length > SHOW && <li className="muted">and {items.length - SHOW} more</li>}
    </ul>
  );
}

export function ImportPanel() {
  const fileInput = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [snippets, setSnippets] = useState<unknown[] | null>(null);
  const [check, setCheck] = useState<Check | null>(null);
  const [mode, setMode] = useState<Mode | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function clearCheck() {
    setFileName("");
    setSnippets(null);
    setCheck(null);
    setMode(null);
  }

  function reset() {
    clearCheck();
    if (fileInput.current) fileInput.current.value = "";
  }

  async function chooseFile(file: File | undefined) {
    clearCheck();
    setResult(null);
    setError("");
    if (!file) return;
    setFileName(file.name);
    let list: unknown;
    try {
      const data = JSON.parse(await file.text());
      list = Array.isArray(data) ? data : data?.snippets;
    } catch {
      setError("This file is not valid JSON.");
      return;
    }
    if (!Array.isArray(list)) {
      setError("This is not an Offcuts export file. It has no list of snippets.");
      return;
    }
    setBusy(true);
    try {
      setCheck(await api<Check>("POST", "/import", { snippets: list, dryRun: true }));
      setSnippets(list);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function runImport() {
    if (!snippets || !check) return;
    setBusy(true);
    setError("");
    try {
      setResult(await api<Result>("POST", "/import", { snippets, mode: check.duplicates.length ? mode : "keep" }));
      reset();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const needsMode = !!check && check.duplicates.length > 0;

  return (
    <section className="panel">
      <h2>Import</h2>
      <p>Import a JSON file made by Export. Offcuts checks the file first and saves nothing until you confirm.</p>

      <input
        ref={fileInput}
        type="file"
        accept=".json,application/json"
        onChange={(e) => chooseFile(e.target.files?.[0])}
        disabled={busy}
        aria-label="Import file"
      />

      {error && <p className="error">{error}</p>}

      {result && (
        <p className="success">
          Import complete: {result.created} added, {result.replaced} replaced, {result.skipped} skipped
          {result.failed > 0 && `, ${result.failed} not imported`}.
        </p>
      )}

      {check && (
        <div className="import-check">
          <p>
            <strong>{fileName}</strong> has {check.total} snippet{check.total === 1 ? "" : "s"}. {check.valid} can be
            imported.
          </p>

          {check.invalid.length > 0 && (
            <>
              <p className="error">
                {check.invalid.length} cannot be imported and will be left out:
              </p>
              <ShortList items={check.invalid.map((i) => `${i.title}: ${i.error}`)} />
            </>
          )}

          {needsMode && (
            <fieldset className="import-mode">
              <legend>
                {check.duplicates.length} snippet{check.duplicates.length === 1 ? " has" : "s have"} the same title as an
                existing snippet:
              </legend>
              <ShortList items={check.duplicates} />
              <label>
                <input type="radio" name="mode" checked={mode === "skip"} onChange={() => setMode("skip")} />
                Skip them. Keep the existing snippets as they are.
              </label>
              <label>
                <input type="radio" name="mode" checked={mode === "replace"} onChange={() => setMode("replace")} />
                Replace the existing snippets with the imported ones.
              </label>
              <label>
                <input type="radio" name="mode" checked={mode === "keep"} onChange={() => setMode("keep")} />
                Keep both. Add the imported snippets as new ones.
              </label>
              <p className="muted small">The title match ignores upper and lower case. If several existing snippets share a title, Replace changes the oldest one.</p>
            </fieldset>
          )}

          <div className="snippet-actions start">
            <button className="btn btn-primary" onClick={runImport} disabled={busy || check.valid === 0 || (needsMode && !mode)}>
              Import {check.valid} snippet{check.valid === 1 ? "" : "s"}
            </button>
            <button className="btn" onClick={reset} disabled={busy}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
