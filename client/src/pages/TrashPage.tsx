import { useEffect, useState } from "react";
import { LanguageBadge } from "../components/Badges";
import { api, type SnippetSummary } from "../lib/api";

interface Trash {
  days: number;
  snippets: SnippetSummary[];
}

function daysLeft(deletedAt: string, days: number): number {
  return Math.max(0, Math.ceil((Date.parse(deletedAt) + days * 86400_000 - Date.now()) / 86400_000));
}

export function TrashPage() {
  const [trash, setTrash] = useState<Trash | null>(null);
  const [error, setError] = useState("");

  function load() {
    api<Trash>("GET", "/trash")
      .then(setTrash)
      .catch((e) => setError(e.message));
  }
  useEffect(load, []);

  async function act(fn: () => Promise<unknown>) {
    setError("");
    try {
      await fn();
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (!trash) return error ? <p className="error">{error}</p> : <div className="page-loading">Loading…</div>;

  return (
    <div className="trash">
      <div className="editor-head">
        <h1>Trash</h1>
        {trash.snippets.length > 0 && (
          <button
            className="btn btn-danger"
            onClick={() =>
              confirm(`Delete all ${trash.snippets.length} snippets in the trash for good? You cannot undo this.`) &&
              act(() => api("DELETE", "/trash"))
            }
          >
            Empty trash
          </button>
        )}
      </div>
      <p className="muted">Deleted snippets stay here for {trash.days} days. Then the app removes them for good.</p>
      {error && <p className="error">{error}</p>}
      {trash.snippets.length === 0 ? (
        <div className="empty">
          <p>The trash is empty.</p>
        </div>
      ) : (
        <div className="list">
          {trash.snippets.map((s) => (
            <div key={s.id} className="list-row static">
              <div className="list-main">
                <div className="list-title">
                  <strong>{s.title}</strong>
                  {s.fragmentTitles.some(Boolean) && <span className="fragment-names">{s.fragmentTitles.filter(Boolean).join(" · ")}</span>}
                </div>
                <p className="muted small">
                  Deleted {new Date(s.deletedAt!).toLocaleString()}. Removed for good in {daysLeft(s.deletedAt!, trash.days)} days.
                </p>
              </div>
              <div className="list-meta">
                <LanguageBadge language={s.language} />
                <button className="btn btn-small" onClick={() => act(() => api("POST", `/trash/${s.id}/restore`))}>
                  Restore
                </button>
                <button
                  className="btn btn-small btn-danger"
                  onClick={() => confirm(`Delete "${s.title}" for good? You cannot undo this.`) && act(() => api("DELETE", `/trash/${s.id}`))}
                >
                  Delete for good
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
