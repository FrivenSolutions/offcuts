import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { LanguageBadge, TagList, VisibilityBadge } from "../components/Badges";
import { CodeBlock } from "../components/CodeBlock";
import { CopyButton } from "../components/CopyButton";
import { LinkedText } from "../components/LinkedText";
import { api, isUrl, type Snippet } from "../lib/api";
import { useAuth } from "../lib/auth";
import { browseHref, RESTORE_SCROLL } from "../lib/browseState";

export function SnippetViewPage() {
  const { id } = useParams();
  const { authed } = useAuth();
  const navigate = useNavigate();
  const [snippet, setSnippet] = useState<Snippet | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setSnippet(null);
    api<Snippet>("GET", `/snippets/${id}`)
      .then(setSnippet)
      .catch((e) => setError(e.status === 404 ? "This snippet does not exist, or you must log in to see it." : e.message));
  }, [id, authed]);

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
    if (!confirm(`Delete "${snippet!.title}"? You cannot undo this.`)) return;
    await api("DELETE", `/snippets/${snippet!.id}`);
    navigate(browseHref(), { state: RESTORE_SCROLL });
  }

  const allCode = snippet.fragments.map((f) => f.code).join("\n\n");

  return (
    <article className="snippet-view">
      <div className="snippet-head">
        <div>
          <Link to={browseHref()} state={RESTORE_SCROLL} className="back">
            ← All snippets
          </Link>
          <h1>{snippet.title}</h1>
          <div className="meta-row">
            <LanguageBadge language={snippet.language} />
            {authed && <VisibilityBadge isPublic={snippet.isPublic} />}
            <TagList tags={snippet.tags} onTagClick={(t) => navigate(`/?tags=${encodeURIComponent(t)}`)} />
            <span className="muted small">Updated {new Date(snippet.updatedAt).toLocaleString()}</span>
          </div>
        </div>
        <div className="snippet-actions">
          {snippet.fragments.length > 1 && <CopyButton text={allCode} label="Copy all" />}
          {snippet.isPublic && <CopyButton text={window.location.href} label="Copy link" />}
          {authed && (
            <>
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

      {snippet.fragments.length > 1 && (
        <nav className="fragment-toc">
          {snippet.fragments.map((f, i) => (
            <a key={i} href={`#fragment-${i + 1}`}>
              {f.title || `Fragment ${i + 1}`}
            </a>
          ))}
        </nav>
      )}

      {snippet.fragments.map((f, i) => (
        <section key={i} id={`fragment-${i + 1}`} className="fragment">
          <div className="fragment-head">
            <h2>{f.title || (snippet.fragments.length > 1 ? `Fragment ${i + 1}` : "Code")}</h2>
            <CopyButton text={f.code} />
          </div>
          {f.comment && <LinkedText text={f.comment} className="fragment-comment" />}
          <CodeBlock code={f.code} language={snippet.language} lineNumbers />
        </section>
      ))}
    </article>
  );
}
