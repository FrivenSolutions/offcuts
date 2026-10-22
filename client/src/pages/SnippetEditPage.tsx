import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { detectLanguage } from "../../../shared/detect";
import { LANGUAGES, languageInfo } from "../../../shared/languages";
import { CodeEditor } from "../components/CodeEditor";
import { TagInput } from "../components/TagInput";
import { api, type Snippet, type SnippetInput, type TagCount } from "../lib/api";
import { browseHref, RESTORE_SCROLL } from "../lib/browseState";

interface DraftFragment {
  key: number;
  title: string;
  comment: string;
  code: string;
}

let nextKey = 1;
const newFragment = (title = "", comment = "", code = ""): DraftFragment => ({ key: nextKey++, title, comment, code });

export function SnippetEditPage() {
  const { id } = useParams();
  const isNew = id === undefined;
  const navigate = useNavigate();

  const [loaded, setLoaded] = useState(isNew);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [source, setSource] = useState("");
  const [language, setLanguage] = useState("plaintext");
  // "auto": the app picks the language from the code. "manual": the user picked it.
  const [languageMode, setLanguageMode] = useState<"auto" | "manual">(isNew ? "auto" : "manual");
  const [isPublic, setIsPublic] = useState(false);
  const [tags, setTags] = useState<string[]>([]);
  const [fragments, setFragments] = useState<DraftFragment[]>([newFragment()]);
  const [tagSuggestions, setTagSuggestions] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const dirty = useRef(false);

  useEffect(() => {
    api<TagCount[]>("GET", "/tags")
      .then((t) => setTagSuggestions(t.map((x) => x.tag)))
      .catch(() => undefined);
    if (isNew) return;
    api<Snippet>("GET", `/snippets/${id}`)
      .then((s) => {
        setTitle(s.title);
        setDescription(s.description);
        setSource(s.source);
        setLanguage(s.language);
        setIsPublic(s.isPublic);
        setTags(s.tags);
        setFragments(s.fragments.map((f) => newFragment(f.title, f.comment, f.code)));
        setLoaded(true);
      })
      .catch((e) => setError(e.message));
  }, [id, isNew]);

  // Guess the language while the code changes, until the user picks one.
  const allCode = useMemo(() => fragments.map((f) => f.code).join("\n\n"), [fragments]);
  useEffect(() => {
    if (languageMode !== "auto") return;
    const t = setTimeout(() => setLanguage(detectLanguage(allCode)), 200);
    return () => clearTimeout(t);
  }, [allCode, languageMode]);

  // Warn before the user leaves with unsaved changes.
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirty.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  function change<T>(setter: (v: T) => void) {
    return (v: T) => {
      dirty.current = true;
      setter(v);
    };
  }

  function updateFragment(key: number, patch: Partial<DraftFragment>) {
    dirty.current = true;
    setFragments((list) => list.map((f) => (f.key === key ? { ...f, ...patch } : f)));
  }

  function moveFragment(index: number, delta: number) {
    dirty.current = true;
    setFragments((list) => {
      const next = [...list];
      const [item] = next.splice(index, 1);
      next.splice(index + delta, 0, item!);
      return next;
    });
  }

  async function save() {
    if (!title.trim()) {
      setError("Give the snippet a title.");
      return;
    }
    setSaving(true);
    setError("");
    const body: SnippetInput = {
      title,
      description,
      source,
      // The delayed detection may not have run yet if the user saves right after a paste.
      language: languageMode === "auto" ? detectLanguage(allCode) : language,
      isPublic,
      tags,
      fragments: fragments.map(({ title, comment, code }) => ({ title, comment, code })),
    };
    try {
      const saved = isNew ? await api<Snippet>("POST", "/snippets", body) : await api<Snippet>("PUT", `/snippets/${id}`, body);
      dirty.current = false;
      navigate(`/s/${saved.id}`);
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  }

  // Ctrl+S or Cmd+S saves.
  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void saveRef.current();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  if (!loaded) return error ? <p className="error">{error}</p> : <div className="page-loading">Loading…</div>;

  return (
    <div className="editor">
      <div className="editor-head">
        <h1>{isNew ? "New snippet" : "Edit snippet"}</h1>
        <div className="snippet-actions">
          <Link to={isNew ? browseHref() : `/s/${id}`} state={isNew ? RESTORE_SCROLL : undefined} className="btn">
            Cancel
          </Link>
          <button className="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      {error && <p className="error">{error}</p>}

      <div className="form-grid">
        <label className="field span-2">
          <span>Title</span>
          <input value={title} onChange={(e) => change(setTitle)(e.target.value)} placeholder="REST API Patches" autoFocus={isNew} />
        </label>

        <label className="field">
          <span>
            Language{" "}
            {languageMode === "auto" ? (
              <em className="hint">auto-detected</em>
            ) : (
              <button type="button" className="link-button hint" onClick={() => setLanguageMode("auto")}>
                detect again
              </button>
            )}
          </span>
          <select
            value={language}
            onChange={(e) => {
              dirty.current = true;
              setLanguage(e.target.value);
              setLanguageMode("manual");
            }}
          >
            {LANGUAGES.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>Visibility</span>
          <select value={isPublic ? "public" : "private"} onChange={(e) => change(setIsPublic)(e.target.value === "public")}>
            <option value="private">Private (only you)</option>
            <option value="public">Public (anyone, no login)</option>
          </select>
        </label>

        <label className="field span-2">
          <span>Source</span>
          <input value={source} onChange={(e) => change(setSource)(e.target.value)} placeholder="A URL, or a note such as “From the Contoso flow”" />
        </label>

        <div className="field span-2">
          <span>Tags</span>
          <TagInput value={tags} onChange={change(setTags)} suggestions={tagSuggestions} />
        </div>

        <label className="field span-2">
          <span>Description</span>
          <textarea rows={3} value={description} onChange={(e) => change(setDescription)(e.target.value)} placeholder="Optional notes" />
        </label>
      </div>

      <h2 className="section-title">
        Fragments <span className="muted small">({languageInfo(language).label})</span>
      </h2>

      {fragments.map((f, i) => (
        <div key={f.key} className="fragment-edit">
          <div className="fragment-edit-head">
            <input
              value={f.title}
              onChange={(e) => updateFragment(f.key, { title: e.target.value })}
              placeholder={`Fragment title, e.g. “Lookup”`}
              aria-label={`Fragment ${i + 1} title`}
            />
            <div className="fragment-tools">
              <button type="button" className="btn btn-small" disabled={i === 0} onClick={() => moveFragment(i, -1)} title="Move up">
                ↑
              </button>
              <button
                type="button"
                className="btn btn-small"
                disabled={i === fragments.length - 1}
                onClick={() => moveFragment(i, 1)}
                title="Move down"
              >
                ↓
              </button>
              <button
                type="button"
                className="btn btn-small btn-danger"
                disabled={fragments.length === 1}
                onClick={() => {
                  if (f.code.trim() && !confirm("Remove this fragment?")) return;
                  dirty.current = true;
                  setFragments((list) => list.filter((x) => x.key !== f.key));
                }}
                title="Remove fragment"
              >
                Remove
              </button>
            </div>
          </div>
          <textarea
            className="fragment-comment-input"
            rows={2}
            value={f.comment}
            onChange={(e) => updateFragment(f.key, { comment: e.target.value })}
            placeholder="Comments (optional), e.g. “Use the ID column, not the title.”"
            aria-label={`Fragment ${i + 1} comments`}
          />
          <CodeEditor
            value={f.code}
            language={language}
            onChange={(code) => updateFragment(f.key, { code })}
            placeholder="Paste or type code here"
          />
        </div>
      ))}

      <button
        type="button"
        className="btn add-fragment"
        onClick={() => {
          dirty.current = true;
          setFragments((list) => [...list, newFragment()]);
        }}
      >
        + Add fragment
      </button>
    </div>
  );
}
