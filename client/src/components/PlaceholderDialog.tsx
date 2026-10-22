import { useEffect, useMemo, useRef, useState } from "react";
import { fillPlaceholders, findPlaceholders } from "../../../shared/placeholders";
import { CodeBlock } from "./CodeBlock";
import { copyText } from "./CopyButton";

interface Props {
  title: string;
  code: string;
  language: string;
  onClose: () => void;
}

/** Asks for a value for each {{placeholder}}, shows the result, and copies it. */
export function PlaceholderDialog({ title, code, language, onClose }: Props) {
  const placeholders = useMemo(() => findPlaceholders(code), [code]);
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(placeholders.map((p) => [p.name, p.defaultValue])),
  );
  const [copied, setCopied] = useState("");
  const filled = useMemo(() => fillPlaceholders(code, values), [code, values]);
  const first = useRef<HTMLInputElement>(null);

  useEffect(() => {
    first.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function copy(text: string, label: string) {
    await copyText(text);
    setCopied(label);
    setTimeout(onClose, 600);
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={`Fill in placeholders for ${title}`}>
        <h2>Fill in placeholders</h2>
        <p className="muted small">{title}</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void copy(filled, "filled");
          }}
        >
          <div className="placeholder-fields">
            {placeholders.map((p, i) => (
              <label key={p.name} className="field">
                <span>{p.name}</span>
                <input
                  ref={i === 0 ? first : undefined}
                  value={values[p.name] ?? ""}
                  placeholder={p.defaultValue ? `Default: ${p.defaultValue}` : ""}
                  onChange={(e) => setValues((v) => ({ ...v, [p.name]: e.target.value }))}
                />
              </label>
            ))}
          </div>
          <div className="modal-preview">
            <CodeBlock code={filled} language={language} />
          </div>
          <div className="snippet-actions start">
            <button className="btn btn-primary" type="submit">
              {copied === "filled" ? "Copied ✓" : "Copy filled code"}
            </button>
            <button className="btn" type="button" onClick={() => void copy(code, "raw")}>
              {copied === "raw" ? "Copied ✓" : "Copy as it is"}
            </button>
            <button className="btn btn-ghost" type="button" onClick={onClose}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
