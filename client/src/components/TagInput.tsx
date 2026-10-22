import { useId, useState } from "react";

interface Props {
  value: string[];
  onChange: (tags: string[]) => void;
  suggestions: string[];
}

export function TagInput({ value, onChange, suggestions }: Props) {
  const [draft, setDraft] = useState("");
  const listId = useId();

  function add(raw: string) {
    const tags = raw
      .split(",")
      .map((t) => t.trim().replace(/^#/, ""))
      .filter(Boolean);
    const next = [...value];
    for (const t of tags) if (!next.some((v) => v.toLowerCase() === t.toLowerCase())) next.push(t);
    onChange(next);
    setDraft("");
  }

  return (
    <div className="tag-input">
      {value.map((t) => (
        <span key={t} className="tag">
          #{t}
          <button type="button" aria-label={`Remove tag ${t}`} onClick={() => onChange(value.filter((v) => v !== t))}>
            ×
          </button>
        </span>
      ))}
      <input
        list={listId}
        value={draft}
        placeholder={value.length ? "" : "Type a tag, press Enter"}
        onChange={(e) => {
          if (e.target.value.endsWith(",")) add(e.target.value);
          else setDraft(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && draft.trim()) {
            e.preventDefault();
            add(draft);
          } else if (e.key === "Backspace" && !draft && value.length) {
            onChange(value.slice(0, -1));
          }
        }}
        onBlur={() => draft.trim() && add(draft)}
      />
      <datalist id={listId}>
        {suggestions
          .filter((s) => !value.some((v) => v.toLowerCase() === s.toLowerCase()))
          .map((s) => (
            <option key={s} value={s} />
          ))}
      </datalist>
    </div>
  );
}
