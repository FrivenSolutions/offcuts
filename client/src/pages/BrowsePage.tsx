import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigationType, useSearchParams } from "react-router";
import { LANGUAGES } from "../../../shared/languages";
import { LanguageBadge, TagList, VisibilityBadge } from "../components/Badges";
import { CodeBlock } from "../components/CodeBlock";
import { SEARCH_ID } from "../components/Shortcuts";
import { StarButton } from "../components/StarButton";
import { api, type SnippetSummary, type TagCount } from "../lib/api";
import { useAuth } from "../lib/auth";
import { readBrowseScroll, rememberBrowse, saveBrowseScroll } from "../lib/browseState";

type View = "cards" | "list";

const SORT_OPTIONS: { value: string; label: string; authOnly?: boolean }[] = [
  { value: "title", label: "Title A–Z" },
  { value: "-title", label: "Title Z–A" },
  { value: "-updated", label: "Recently updated" },
  { value: "updated", label: "Oldest updated" },
  { value: "-created", label: "Newest" },
  { value: "created", label: "Oldest" },
  { value: "-viewed", label: "Recently viewed", authOnly: true },
];

const RECENT_COUNT = 5;

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
  // null while the tags load.
  const [tags, setTags] = useState<TagCount[] | null>(null);
  const [error, setError] = useState("");
  const [searchDraft, setSearchDraft] = useState(params.get("q") ?? "");
  const location = useLocation();
  const navigationType = useNavigationType();

  // Read the saved position once, before this page's own scroll events change it.
  // Restore it only on Back, or on a link that asks for it ("All snippets", Cancel, Delete).
  const [restoreY] = useState(() =>
    navigationType === "POP" || (location.state as { restoreScroll?: boolean } | null)?.restoreScroll
      ? readBrowseScroll(params.toString())
      : null,
  );
  const restored = useRef(false);
  const searchKey = useRef(params.toString());
  searchKey.current = params.toString();

  const q = params.get("q") ?? "";
  const language = params.get("language") ?? "";
  const sort = params.get("sort") ?? "title";
  const visibility = params.get("visibility") ?? "";
  const starred = params.get("starred") === "1";
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

  useEffect(() => {
    rememberBrowse(params.toString());
  }, [params]);

  // Remember the scroll position while the user scrolls.
  useEffect(() => {
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => saveBrowseScroll(searchKey.current, window.scrollY));
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  // Go back to the saved position once the list has loaded and has its full height.
  useEffect(() => {
    // The tag bar sits above the list, so wait for it too.
    if (!snippets || !tags || restored.current) return;
    restored.current = true;
    if (restoreY) window.scrollTo(0, restoreY);
  }, [snippets, tags, restoreY]);

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
    if (starred) query.set("starred", "1");
    if (activeTags.length) query.set("tags", activeTags.join(","));
    let cancelled = false;
    api<SnippetSummary[]>("GET", `/snippets?${query}`)
      .then((list) => !cancelled && (setSnippets(list), setError("")))
      .catch((e) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [q, language, sort, visibility, starred, activeTags, authed]);

  useEffect(() => {
    api<TagCount[]>("GET", "/tags").then(setTags).catch(() => setTags([]));
  }, [authed]);

  const filtering = q || language || visibility || starred || activeTags.length > 0;

  // The snippets the owner opened last. Shown only on the unfiltered list.
  const recent = useMemo(
    () =>
      authed && !filtering && snippets
        ? snippets
            .filter((s) => s.viewedAt)
            .sort((a, b) => b.viewedAt!.localeCompare(a.viewedAt!))
            .slice(0, RECENT_COUNT)
        : [],
    [authed, filtering, snippets],
  );

  return (
    <div className="browse">
      {!authed && (
        <p className="intro">
          Public snippets. <Link to="/login">Log in</Link> to see and manage all snippets.
        </p>
      )}

      <div className="toolbar">
        <input
          id={SEARCH_ID}
          className="search"
          type="search"
          placeholder="Search titles, code and tags…"
          title="Search titles, fragment titles, comments, code and tags. Press / to jump here."
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
        {authed && (
          <button
            className={`btn ${starred ? "btn-active" : ""}`}
            aria-pressed={starred}
            onClick={() => setParam("starred", starred ? "" : "1")}
            title="Show only starred snippets"
          >
            {starred ? "★" : "☆"} Starred
          </button>
        )}
        <select value={sort} onChange={(e) => setParam("sort", e.target.value)} aria-label="Sort">
          {SORT_OPTIONS.filter((o) => authed || !o.authOnly).map((o) => (
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

      {tags && tags.length > 0 && (
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

      {recent.length > 0 && (
        <nav className="recent" aria-label="Recently viewed">
          <span className="muted small">Recently viewed:</span>
          {recent.map((s) => (
            <Link key={s.id} to={`/s/${s.id}`}>
              {s.title}
            </Link>
          ))}
        </nav>
      )}

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
                {authed && (
                  <span className="card-flags">
                    <VisibilityBadge isPublic={s.isPublic} />
                    <StarButton id={s.id} favorite={s.favorite} />
                  </span>
                )}
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
                <CodeBlock code={s.preview} language={s.previewLanguage} />
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
                  {authed && <StarButton id={s.id} favorite={s.favorite} />}
                  <strong>{s.title}</strong>
                  {s.fragmentTitles.some(Boolean) && (
                    <span className="fragment-names">{s.fragmentTitles.filter(Boolean).join(" · ")}</span>
                  )}
                </div>
                <div className="list-preview">
                  <CodeBlock code={s.preview.split("\n").slice(0, 3).join("\n")} language={s.previewLanguage} />
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
