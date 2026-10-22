import { downloadText } from "../lib/download";
import { CopyButton } from "./CopyButton";

/** Shows new recovery codes once, with copy and download. */
export function RecoveryCodeList({ codes }: { codes: string[] }) {
  const text = `Offcuts recovery codes (${new Date().toLocaleDateString()})\nEach code works once.\n\n${codes.join("\n")}\n`;
  return (
    <div className="recovery-codes">
      <p>
        <strong>Save these codes now.</strong> Offcuts shows them only once. Each code replaces the authenticator code once, if
        you lose your phone.
      </p>
      <ol className="code-grid">
        {codes.map((c) => (
          <li key={c}>
            <code>{c}</code>
          </li>
        ))}
      </ol>
      <div className="snippet-actions start">
        <CopyButton text={text} label="Copy codes" />
        <button type="button" className="btn btn-small" onClick={() => downloadText("offcuts-recovery-codes.txt", text)}>
          Download codes
        </button>
      </div>
    </div>
  );
}
