import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { languageInfo } from "../../../shared/languages";
import { api, type SnippetInput } from "../lib/api";
import { diffLines } from "../lib/diff";

interface VersionSnapshot extends SnippetInput {
  updatedAt: string;
}

interface Versions {
  current: VersionSnapshot;
  versions: { id: number; savedAt: string; snapshot: VersionSnapshot }[];
}

function when(iso: string): string {
  return new Date(iso).toLocaleString();
}

function Diff({ before, after }: { before: string; after: string }) {
  const lines = useMemo(() => diffLines(before, after), [before, after]);
  if (before === after) return <p className="muted small">No change.</p>;
  return (
    <pre className="diff">
      {lines.map((l, i) => (
        <div key={i} className={`diff-${l.kind}`}>
          <span className="diff-sign">{l.kind === "add" ? "+" : l.kind === "remove" ? "−" : " "}</span>
          {l.text || " "}
        </div>
      ))}
    </pre>
  );
}

type Frag = SnippetInput["fragments"][number];

function sameFragment(a: Frag | undefined, b: Frag | undefined): boolean {
  return !!a && !!b && a.title === b.title && a.code === b.code && a.comment === b.comment && (a.language ?? null) === (b.language ?? null);
}

/** Lists what changed between an old version and the current content. */
function Changes({ old, now }: { old: VersionSnapshot; now: VersionSnapshot }) {
  const fields: [string, string, string][] = [
    ["Title", old.title, now.title],
    ["Language", languageInfo(old.language).label, languageInfo(now.language).label],
    ["Visibility", old.isPublic ? "Public" : "Private", now.isPublic ? "Public" : "Private"],
    ["Tags", old.tags.join(", ") || "(none)", now.tags.join(", ") || "(none)"],
    ["Source", old.source || "(empty)", now.source || "(empty)"],
  ];
  const changedFields = fields.filter(([, a, b]) => a !== b);
  const count = Math.max(old.fragments.length, now.fragments.length);

  return (
    <div className="changes">
      {changedFields.length > 0 && (
        <table className="field-changes">
          <thead>
            <tr>
              <th />
              <th>This version</th>
              <th>Current</th>
            </tr>
          </thead>
          <tbody>
            {changedFields.map(([name, a, b]) => (
              <tr key={name}>
                <th>{name}</th>
                <td className="diff-remove">{a}</td>
                <td className="diff-add">{b}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {old.description !== now.description && (
        <>
          <h3>Description</h3>
          <Diff before={old.description} after={now.description} />
        </>
      )}
      {Array.from({ length: count }, (_, i) => {
        const a = old.fragments[i];
        const b = now.fragments[i];
        const name = b?.title || a?.title || `Fragment ${i + 1}`;
        if (sameFragment(a, b)) return null;
        return (
          <section key={i} className="fragment-change">
            <h3>
              {name} {!a && <span className="badge public">Added since</span>}
              {!b && <span className="badge private">Removed since</span>}
              {a && b && a.title !== b.title && <span className="muted small"> (was “{a.title}”)</span>}
            </h3>
            {(a?.comment ?? "") !== (b?.comment ?? "") && (
              <>
                <p className="muted small">Comments</p>
                <Diff before={a?.comment ?? ""} after={b?.comment ?? ""} />
              </>
            )}
            <Diff before={a?.code ?? ""} after={b?.code ?? ""} />
          </section>
        );
      })}
      {changedFields.length === 0 &&
        old.description === now.description &&
        old.fragments.length === now.fragments.length &&
        old.fragments.every((a, i) => sameFragment(a, now.fragments[i])) && (
          <p className="muted">This version is the same as the current content.</p>
        )}
    </div>
  );
}

export function HistoryPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState<Versions | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<Versions>("GET", `/snippets/${id}/versions`)
      .then((d) => {
        setData(d);
        setSelected(d.versions[0]?.id ?? null);
      })
      .catch((e) => setError(e.message));
  }, [id]);

  if (error) return <p className="error">{error}</p>;
  if (!data) return <div className="page-loading">Loading…</div>;

  const version = data.versions.find((v) => v.id === selected);

  async function restore() {
    if (!version) return;
    if (!confirm(`Restore the version from ${when(version.savedAt)}? The current content is kept as a version too.`)) return;
    setBusy(true);
    try {
      await api("POST", `/snippets/${id}/versions/${version.id}/restore`);
      navigate(`/s/${id}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="history">
      <Link to={`/s/${id}`} className="back">
        ← Back to the snippet
      </Link>
      <h1>History: {data.current.title}</h1>
      {data.versions.length === 0 ? (
        <p className="muted">No earlier versions yet. Each save keeps the previous content here (up to 50 versions).</p>
      ) : (
        <div className="history-layout">
          <ol className="version-list">
            <li className="muted small">Current: {when(data.current.updatedAt)}</li>
            {data.versions.map((v) => (
              <li key={v.id}>
                <button className={v.id === selected ? "active" : ""} onClick={() => setSelected(v.id)}>
                  <span>{when(v.savedAt)}</span>
                  <span className="muted small">{v.snapshot.title}</span>
                </button>
              </li>
            ))}
          </ol>
          {version && (
            <div className="version-detail">
              <div className="editor-head">
                <h2>Changes from {when(version.savedAt)} to now</h2>
                <button className="btn btn-primary" onClick={restore} disabled={busy}>
                  Restore this version
                </button>
              </div>
              <p className="muted small">Red lines are only in this version. Green lines are only in the current content.</p>
              <Changes old={version.snapshot} now={data.current} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
