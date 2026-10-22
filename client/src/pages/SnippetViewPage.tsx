import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { findPlaceholders } from "../../../shared/placeholders";
import { LanguageBadge, TagList, VisibilityBadge } from "../components/Badges";
import { CodeBlock } from "../components/CodeBlock";
import { CopyButton, copyText } from "../components/CopyButton";
import { LinkedText } from "../components/LinkedText";
import { PlaceholderDialog } from "../components/PlaceholderDialog";
import { StarButton } from "../components/StarButton";
import { api, isUrl, type Snippet } from "../lib/api";
import { useAuth } from "../lib/auth";
import { browseHref, RESTORE_SCROLL } from "../lib/browseState";
import { downloadText, fileName } from "../lib/download";
import { isShortcut } from "../lib/keys";

interface CopyRequest {
  title: string;
  code: string;
  language: string;
}

function readWrap(): boolean {
  try {
    return localStorage.getItem("offcuts-wrap") === "1";
  } catch {
    return false;
  }
}

/** Copy button that opens the placeholder form when the code has {{placeholders}}. */
function SmartCopy({ request, label = "Copy", onPlaceholders }: { request: CopyRequest; label?: string; onPlaceholders: (r: CopyRequest) => void }) {
  if (findPlaceholders(request.code).length === 0) return <CopyButton text={request.code} label={label} />;
  return (
    <button className="btn btn-small" onClick={() => onPlaceholders(request)} title="This code has placeholders">
      {label}…
    </button>
  );
}

export function SnippetViewPage() {
  const { id } = useParams();
  const { authed } = useAuth();
  const navigate = useNavigate();
  const [snippet, setSnippet] = useState<Snippet | null>(null);
  const [error, setError] = useState("");
  const [wrap, setWrap] = useState(readWrap);
  const [filling, setFilling] = useState<CopyRequest | null>(null);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    setSnippet(null);
    api<Snippet>("GET", `/snippets/${id}`)
      .then(setSnippet)
      .catch((e) => setError(e.status === 404 ? "This snippet does not exist, or you must log in to see it." : e.message));
  }, [id, authed]);

  useEffect(() => {
    try {
      localStorage.setItem("offcuts-wrap", wrap ? "1" : "0");
    } catch {
      // Storage can be blocked. The setting still works for this visit.
    }
  }, [wrap]);

  const copyRequest = useCallback(
    (index: number): CopyRequest | null => {
      const f = snippet?.fragments[index];
      if (!snippet || !f) return null;
      return { title: f.title || snippet.title, code: f.code, language: f.language ?? snippet.language };
    },
    [snippet],
  );

  // E edits. C copies the first fragment.
  useEffect(() => {
    const onKey = async (e: KeyboardEvent) => {
      if (!snippet || filling || !isShortcut(e)) return;
      if ((e.key === "e" || e.key === "E") && authed) {
        e.preventDefault();
        navigate(`/s/${snippet.id}/edit`);
      } else if (e.key === "c" || e.key === "C") {
        e.preventDefault();
        const req = copyRequest(0)!;
        if (findPlaceholders(req.code).length) setFilling(req);
        else {
          await copyText(req.code);
          setNotice("First fragment copied.");
          setTimeout(() => setNotice(""), 1500);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [snippet, authed, filling, navigate, copyRequest]);

  if (error)
    return (
      <div className="empty">
        <p>{error}</p>
        <Link to={browseHref()} state={RESTORE_SCROLL}>
          Back to all snippets
        </Link>
      </div>
    );
  if (!snippet) return <div className="page-loading">Loading…</div>;

  async function remove() {
    if (!confirm(`Move "${snippet!.title}" to the trash? You can restore it for 30 days.`)) return;
    await api("DELETE", `/snippets/${snippet!.id}`);
    navigate(browseHref(), { state: RESTORE_SCROLL });
  }

  const allCode = snippet.fragments.map((f) => f.code).join("\n\n");
  const multi = snippet.fragments.length > 1;

  return (
    <article className="snippet-view">
      <div className="snippet-head">
        <div>
          <Link to={browseHref()} state={RESTORE_SCROLL} className="back">
            ← All snippets
          </Link>
          <h1 className="title-row">
            {authed && <StarButton id={snippet.id} favorite={snippet.favorite} />}
            {snippet.title}
          </h1>
          <div className="meta-row">
            <LanguageBadge language={snippet.language} />
            {authed && <VisibilityBadge isPublic={snippet.isPublic} />}
            <TagList tags={snippet.tags} onTagClick={(t) => navigate(`/?tags=${encodeURIComponent(t)}`)} />
            <span className="muted small">Updated {new Date(snippet.updatedAt).toLocaleString()}</span>
          </div>
        </div>
        <div className="snippet-actions">
          <button className={`btn btn-small ${wrap ? "btn-active" : ""}`} aria-pressed={wrap} onClick={() => setWrap(!wrap)}>
            Wrap lines
          </button>
          {multi && (
            <SmartCopy request={{ title: `${snippet.title} (all fragments)`, code: allCode, language: snippet.language }} label="Copy all" onPlaceholders={setFilling} />
          )}
          {snippet.isPublic && <CopyButton text={window.location.href} label="Copy link" />}
          {authed && (
            <>
              <Link to={`/new?from=${snippet.id}`} className="btn btn-small">
                Duplicate
              </Link>
              <Link to={`/s/${snippet.id}/history`} className="btn btn-small">
                History
              </Link>
              <Link to={`/s/${snippet.id}/edit`} className="btn btn-small">
                Edit
              </Link>
              <button className="btn btn-small btn-danger" onClick={remove}>
                Delete
              </button>
            </>
          )}
        </div>
      </div>

      {notice && <p className="success">{notice}</p>}

      {snippet.source && (
        <p className="source">
          <span className="muted">Source: </span>
          {isUrl(snippet.source) ? (
            <a href={snippet.source} target="_blank" rel="noopener noreferrer">
              {snippet.source}
            </a>
          ) : (
            snippet.source
          )}
        </p>
      )}

      {snippet.description && <p className="description">{snippet.description}</p>}

      {multi && (
        <nav className="fragment-toc">
          {snippet.fragments.map((f, i) => (
            <a key={i} href={`#fragment-${i + 1}`}>
              {f.title || `Fragment ${i + 1}`}
            </a>
          ))}
        </nav>
      )}

      {snippet.fragments.map((f, i) => {
        const lang = f.language ?? snippet.language;
        const names = findPlaceholders(f.code).map((p) => p.name);
        const heading = f.title || (multi ? `Fragment ${i + 1}` : "Code");
        return (
          <section key={i} id={`fragment-${i + 1}`} className="fragment">
            <div className="fragment-head">
              <h2>
                {heading} {f.language && <LanguageBadge language={f.language} />}
              </h2>
              <div className="snippet-actions">
                <button
                  className="btn btn-small"
                  title="Save this fragment as a file"
                  onClick={() => downloadText(fileName(multi && f.title ? `${snippet.title} - ${f.title}` : snippet.title, lang), f.code)}
                >
                  Download
                </button>
                <SmartCopy request={copyRequest(i)!} onPlaceholders={setFilling} />
              </div>
            </div>
            {f.comment && <LinkedText text={f.comment} className="fragment-comment" />}
            {names.length > 0 && (
              <p className="muted small placeholder-note">
                Placeholders: {names.map((n) => `{{${n}}}`).join(", ")}. Copy asks for their values.
              </p>
            )}
            <CodeBlock code={f.code} language={lang} lineNumbers wrap={wrap} />
          </section>
        );
      })}

      {filling && <PlaceholderDialog {...filling} onClose={() => setFilling(null)} />}
    </article>
  );
}
