import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { LANGUAGES } from "../../../shared/languages";
import { LanguageBadge, TagList, VisibilityBadge } from "../components/Badges";
import { CodeBlock } from "../components/CodeBlock";
import { api, type SnippetSummary, type TagCount } from "../lib/api";
import { useAuth } from "../lib/auth";

type View = "cards" | "list";

const SORT_OPTIONS = [
  { value: "title", label: "Title A–Z" },
  { value: "-title", label: "Title Z–A" },
  { value: "-updated", label: "Recently updated" },
  { value: "updated", label: "Oldest updated" },
  { value: "-created", label: "Newest" },
  { value: "created", label: "Oldest" },
];

function readView(): View {
  try {
    return localStorage.getItem("offcuts-view") === "list" ? "list" : "cards";
  } catch {
    return "cards";
  }
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function BrowsePage() {
  const { authed } = useAuth();
  const [params, setParams] = useSearchParams();
  const [view, setView] = useState<View>(readView);
  const [snippets, setSnippets] = useState<SnippetSummary[] | null>(null);
  const [tags, setTags] = useState<TagCount[]>([]);
  const [error, setError] = useState("");
  const [searchDraft, setSearchDraft] = useState(params.get("q") ?? "");

  const q = params.get("q") ?? "";
  const language = params.get("language") ?? "";
  const sort = params.get("sort") ?? "title";
  const visibility = params.get("visibility") ?? "";
  const activeTags = useMemo(() => (params.get("tags") ?? "").split(",").filter(Boolean), [params]);

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  }

  function toggleTag(tag: string) {
    const lower = tag.toLowerCase();
    const has = activeTags.some((t) => t.toLowerCase() === lower);
    setParam("tags", (has ? activeTags.filter((t) => t.toLowerCase() !== lower) : [...activeTags, tag]).join(","));
  }

  // Wait until typing stops before searching.
  useEffect(() => {
    const t = setTimeout(() => {
      if (searchDraft !== q) setParam("q", searchDraft.trim());
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchDraft]);

  useEffect(() => {
    try {
      localStorage.setItem("offcuts-view", view);
    } catch {
      // Storage can be blocked. The view still works for this visit.
    }
  }, [view]);

  useEffect(() => {
    const query = new URLSearchParams();
    if (q) query.set("q", q);
    if (language) query.set("language", language);
    if (sort) query.set("sort", sort);
    if (visibility) query.set("visibility", visibility);
    if (activeTags.length) query.set("tags", activeTags.join(","));
    let cancelled = false;
    api<SnippetSummary[]>("GET", `/snippets?${query}`)
      .then((list) => !cancelled && (setSnippets(list), setError("")))
      .catch((e) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [q, language, sort, visibility, activeTags, authed]);

  useEffect(() => {
    api<TagCount[]>("GET", "/tags").then(setTags).catch(() => setTags([]));
  }, [authed]);

  const filtering = q || language || visibility || activeTags.length > 0;

  return (
    <div className="browse">
      {!authed && (
        <p className="intro">
          Public snippets. <Link to="/login">Log in</Link> to see and manage all snippets.
        </p>
      )}

      <div className="toolbar">
        <input
          className="search"
          type="search"
          placeholder="Search titles, fragments, code and tags…"
          value={searchDraft}
          onChange={(e) => setSearchDraft(e.target.value)}
          aria-label="Search"
        />
        <select value={language} onChange={(e) => setParam("language", e.target.value)} aria-label="Language">
          <option value="">All languages</option>
          {LANGUAGES.map((l) => (
            <option key={l.id} value={l.id}>
              {l.label}
            </option>
          ))}
        </select>
        {authed && (
          <select value={visibility} onChange={(e) => setParam("visibility", e.target.value)} aria-label="Visibility">
            <option value="">Public and private</option>
            <option value="public">Public only</option>
            <option value="private">Private only</option>
          </select>
        )}
        <select value={sort} onChange={(e) => setParam("sort", e.target.value)} aria-label="Sort">
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <div className="segmented" role="group" aria-label="View">
          <button className={view === "cards" ? "active" : ""} onClick={() => setView("cards")} title="Card view">
            ▦ Cards
          </button>
          <button className={view === "list" ? "active" : ""} onClick={() => setView("list")} title="List view">
            ☰ List
          </button>
        </div>
      </div>

      {tags.length > 0 && (
        <div className="tag-bar">
          {tags.map((t) => (
            <button
              key={t.tag}
              className={`tag ${activeTags.some((a) => a.toLowerCase() === t.tag.toLowerCase()) ? "active" : ""}`}
              onClick={() => toggleTag(t.tag)}
            >
              #{t.tag} <span className="count">{t.count}</span>
            </button>
          ))}
        </div>
      )}

      {error && <p className="error">{error}</p>}

      {snippets && (
        <p className="result-count">
          {snippets.length} snippet{snippets.length === 1 ? "" : "s"}
          {filtering && (
            <button
              className="link-button"
              onClick={() => {
                setSearchDraft("");
                setParams(sort !== "title" ? { sort } : {}, { replace: true });
              }}
            >
              Clear filters
            </button>
          )}
        </p>
      )}

      {snippets?.length === 0 && (
        <div className="empty">
          {filtering ? (
            <p>No snippets match these filters.</p>
          ) : authed ? (
            <p>
              No snippets yet. <Link to="/new">Create your first snippet</Link>.
            </p>
          ) : (
            <p>No public snippets yet.</p>
          )}
        </div>
      )}

      {snippets && view === "cards" && (
        <div className="card-grid">
          {snippets.map((s) => (
            <Link key={s.id} to={`/s/${s.id}`} className="card">
              <div className="card-head">
                <h3>{s.title}</h3>
                {authed && <VisibilityBadge isPublic={s.isPublic} />}
              </div>
              <div className="meta-row">
                <LanguageBadge language={s.language} />
                <span className="muted">
                  {s.fragmentTitles.length} fragment{s.fragmentTitles.length === 1 ? "" : "s"}
                </span>
              </div>
              {s.fragmentTitles.some(Boolean) && (
                <div className="fragment-names">{s.fragmentTitles.filter(Boolean).join(" · ")}</div>
              )}
              <div className={`preview ${s.previewTruncated ? "truncated" : ""}`}>
                <CodeBlock code={s.preview} language={s.language} />
              </div>
              <div className="card-foot">
                <TagList tags={s.tags} active={activeTags} onTagClick={toggleTag} />
                <span className="muted small">{formatDate(s.updatedAt)}</span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {snippets && view === "list" && (
        <div className="list">
          {snippets.map((s) => (
            <Link key={s.id} to={`/s/${s.id}`} className="list-row">
              <div className="list-main">
                <div className="list-title">
                  <strong>{s.title}</strong>
                  {s.fragmentTitles.some(Boolean) && (
                    <span className="fragment-names">{s.fragmentTitles.filter(Boolean).join(" · ")}</span>
                  )}
                </div>
                <div className="list-preview">
                  <CodeBlock code={s.preview.split("\n").slice(0, 3).join("\n")} language={s.language} />
                </div>
              </div>
              <div className="list-meta">
                <LanguageBadge language={s.language} />
                {authed && <VisibilityBadge isPublic={s.isPublic} />}
                <TagList tags={s.tags} active={activeTags} onTagClick={toggleTag} />
                <span className="muted small">{formatDate(s.updatedAt)}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
