import { useMemo } from "react";
import { highlight } from "../lib/highlight";

interface Props {
  code: string;
  language: string;
  lineNumbers?: boolean;
  className?: string;
}

export function CodeBlock({ code, language, lineNumbers = false, className = "" }: Props) {
  // highlight.js escapes the code, so this HTML is safe to insert.
  const html = useMemo(() => highlight(code, language), [code, language]);
  const lines = useMemo(() => (lineNumbers ? code.split("\n").length : 0), [code, lineNumbers]);

  return (
    <div className={`code-block ${className}`}>
      {lineNumbers && (
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
