import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router";
import { api, type AppSettings, type TagCount } from "../lib/api";
import { RecoveryCodeList } from "./RecoveryCodeList";

function OtpInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      className="otp"
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
      inputMode="numeric"
      autoComplete="one-time-code"
      aria-label="Authenticator code"
      required
    />
  );
}

export function RecoveryPanel() {
  const [remaining, setRemaining] = useState<number | null>(null);
  const [code, setCode] = useState("");
  const [codes, setCodes] = useState<string[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<{ remaining: number }>("GET", "/auth/recovery").then((r) => setRemaining(r.remaining));
  }, []);

  async function make(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const r = await api<{ recoveryCodes: string[] }>("POST", "/auth/recovery", { code });
      setCodes(r.recoveryCodes);
      setRemaining(r.recoveryCodes.length);
      setCode("");
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <section className="panel">
      <h2>Recovery codes</h2>
      {remaining !== null && (
        <p className={remaining <= 2 ? "error" : ""}>
          {remaining === 0 ? "You have no recovery codes." : `You have ${remaining} unused recovery code${remaining === 1 ? "" : "s"}.`}
        </p>
      )}
      {codes ? (
        <RecoveryCodeList codes={codes} />
      ) : (
        <form onSubmit={make} className="narrow">
          <p className="muted small">New codes replace all old codes. Enter your authenticator code to continue.</p>
          {error && <p className="error">{error}</p>}
          <label className="field">
            <span>Authenticator code</span>
            <OtpInput value={code} onChange={setCode} />
          </label>
          <button className="btn btn-primary" disabled={code.length !== 6}>
            Make new recovery codes
          </button>
        </form>
      )}
    </section>
  );
}

interface Backup {
  name: string;
  size: number;
  createdAt: string;
}

function size(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function BackupPanel() {
  const [data, setData] = useState<{ keep: number; backups: Backup[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = () => api<{ keep: number; backups: Backup[] }>("GET", "/backups").then(setData);
  useEffect(() => {
    void load();
  }, []);

  async function now() {
    setBusy(true);
    setError("");
    try {
      await api("POST", "/backups");
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <h2>Backups</h2>
      <p>
        {data && data.keep > 0
          ? `Offcuts makes a backup of the database once a day and keeps the newest ${data.keep}.`
          : "Automatic backups are off (BACKUP_KEEP=0)."}{" "}
        The backups are in the <code>backups</code> folder next to the database. Copy them somewhere else too, for example with
        a Proxmox backup job.
      </p>
      {error && <p className="error">{error}</p>}
      <button className="btn" onClick={now} disabled={busy}>
        {busy ? "Backing up…" : "Back up now"}
      </button>
      {data && data.backups.length > 0 && (
        <table className="simple-table">
          <tbody>
            {data.backups.map((b) => (
              <tr key={b.name}>
                <td>{new Date(b.createdAt).toLocaleString()}</td>
                <td className="muted">{size(b.size)}</td>
                <td>
                  <a href={`/api/backups/${b.name}`} download>
                    Download
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="muted small">
        To restore, stop Offcuts, replace <code>offcuts.db</code> with a backup file, and delete <code>offcuts.db-wal</code> and{" "}
        <code>offcuts.db-shm</code>. Then start Offcuts again.
      </p>
    </section>
  );
}

export function TagsPanel() {
  const [tags, setTags] = useState<TagCount[] | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = () => api<TagCount[]>("GET", "/tags").then(setTags);
  useEffect(() => {
    void load();
  }, []);

  async function rename(e: FormEvent) {
    e.preventDefault();
    if (!editing) return;
    const to = newName.trim().replace(/^#/, "");
    const merging = tags?.some((t) => t.tag.toLowerCase() === to.toLowerCase() && t.tag.toLowerCase() !== editing.toLowerCase());
    if (merging && !confirm(`#${to} already exists. Merge #${editing} into #${to}?`)) return;
    setError("");
    try {
      await api("POST", "/tags/rename", { from: editing, to });
      setMessage(merging ? `Merged #${editing} into #${to}.` : `Renamed #${editing} to #${to}.`);
      setEditing(null);
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function remove(tag: string, count: number) {
    if (!confirm(`Remove #${tag} from ${count} snippet${count === 1 ? "" : "s"}? The snippets stay.`)) return;
    await api("DELETE", `/tags/${encodeURIComponent(tag)}`);
    setMessage(`Removed #${tag}.`);
    await load();
  }

  return (
    <section className="panel">
      <h2>Tags</h2>
      <p className="muted small">Rename a tag on every snippet. Give it the name of another tag to merge the two.</p>
      {message && <p className="success">{message}</p>}
      {error && <p className="error">{error}</p>}
      {tags?.length === 0 && <p className="muted">No tags yet.</p>}
      {tags && tags.length > 0 && (
        <table className="simple-table tag-table">
          <tbody>
            {tags.map((t) => (
              <tr key={t.tag}>
                {editing === t.tag ? (
                  <td colSpan={3}>
                    <form onSubmit={rename} className="inline-form">
                      <input value={newName} onChange={(e) => setNewName(e.target.value)} aria-label={`New name for ${t.tag}`} autoFocus />
                      <button className="btn btn-small btn-primary" disabled={!newName.trim()}>
                        Save
                      </button>
                      <button type="button" className="btn btn-small" onClick={() => setEditing(null)}>
                        Cancel
                      </button>
                    </form>
                  </td>
                ) : (
                  <>
                    <td>
                      <Link to={`/?tags=${encodeURIComponent(t.tag)}`}>#{t.tag}</Link>
                    </td>
                    <td className="muted">
                      {t.count} snippet{t.count === 1 ? "" : "s"}
                    </td>
                    <td className="row-actions">
                      <button
                        className="btn btn-small"
                        onClick={() => {
                          setEditing(t.tag);
                          setNewName(t.tag);
                          setMessage("");
                        }}
                      >
                        Rename
                      </button>
                      <button className="btn btn-small btn-danger" onClick={() => remove(t.tag, t.count)}>
                        Remove
                      </button>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

export function FormatterPanel() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<AppSettings>("GET", "/settings").then(setSettings);
  }, []);

  async function toggle(on: boolean) {
    // Show the change at once. Undo it if the save fails.
    setSettings((s) => (s ? { ...s, externalFormatters: on } : s));
    setError("");
    try {
      setSettings(await api<AppSettings>("PUT", "/settings", { externalFormatters: on }));
    } catch (e) {
      setSettings((s) => (s ? { ...s, externalFormatters: !on } : s));
      setError((e as Error).message);
    }
  }

  return (
    <section className="panel">
      <h2>Code formatters</h2>
      <p>
        The editor can show a <strong>Format</strong> button for DAX and Power Query M. It sends the code to an outside service:
        DAX Formatter (daxformatter.com, by SQLBI) or Power Query Formatter (powerqueryformatter.com).
      </p>
      <p className="muted small">Your code leaves your server when you click Format. Keep this off if your code is confidential.</p>
      {error && <p className="error">{error}</p>}
      {settings && (
        <label className="check">
          <input type="checkbox" checked={settings.externalFormatters} onChange={(e) => toggle(e.target.checked)} />
          Allow the Format button to use these outside services
        </label>
      )}
    </section>
  );
}
