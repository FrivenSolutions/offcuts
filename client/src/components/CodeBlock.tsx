import { useMemo } from "react";
import { highlight } from "../lib/highlight";

interface Props {
  code: string;
  language: string;
  lineNumbers?: boolean;
  // Wrap long lines. Line numbers are hidden then, because a wrapped line takes several rows.
  wrap?: boolean;
  className?: string;
}

export function CodeBlock({ code, language, lineNumbers = false, wrap = false, className = "" }: Props) {
  const showNumbers = lineNumbers && !wrap;
  // highlight.js escapes the code, so this HTML is safe to insert.
  const html = useMemo(() => highlight(code, language), [code, language]);
  const lines = useMemo(() => (showNumbers ? code.split("\n").length : 0), [code, showNumbers]);

  return (
    <div className={`code-block ${wrap ? "wrap" : ""} ${className}`}>
      {showNumbers && (
        <pre className="line-numbers" aria-hidden="true">
          {Array.from({ length: lines }, (_, i) => i + 1).join("\n")}
        </pre>
      )}
      <pre className="code">
        <code className="hljs" dangerouslySetInnerHTML={{ __html: html }} />
      </pre>
    </div>
  );
}
