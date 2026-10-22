import { useState, type FormEvent } from "react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";

export function SettingsPage() {
  const { status } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function changePassword(e: FormEvent) {
    e.preventDefault();
    setMessage("");
    setError("");
    if (newPassword !== confirmPw) {
      setError("The new passwords are not the same.");
      return;
    }
    try {
      await api("POST", "/auth/password", { currentPassword, newPassword, code });
      setMessage("Password changed. All other devices are logged out.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPw("");
      setCode("");
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="settings">
      <h1>Settings</h1>
      <p className="muted">Logged in as {status?.username}.</p>

      <section className="panel">
        <h2>Change password</h2>
        {message && <p className="success">{message}</p>}
        {error && <p className="error">{error}</p>}
        <form onSubmit={changePassword} className="narrow">
          <label className="field">
            <span>Current password</span>
            <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} autoComplete="current-password" required />
          </label>
          <label className="field">
            <span>New password (at least 10 characters)</span>
            <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" minLength={10} required />
          </label>
          <label className="field">
            <span>Confirm new password</span>
            <input type="password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} autoComplete="new-password" minLength={10} required />
          </label>
          <label className="field">
            <span>Authenticator code</span>
            <input
              className="otp"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              required
            />
          </label>
          <button className="btn btn-primary">Change password</button>
        </form>
      </section>

      <section className="panel">
        <h2>Backup</h2>
        <p>Download all snippets as one JSON file.</p>
        <a className="btn" href="/api/export" download>
          Export snippets
        </a>
        <p className="muted small">
          For a full backup, copy the <code>offcuts.db</code> file from the data folder.
        </p>
      </section>

      <section className="panel">
        <h2>Lost your phone?</h2>
        <p>Run this command on the server to reset two-factor login. Then log in with your password and scan a new QR code.</p>
        <pre className="hint-block">docker exec offcuts npm run cli -- reset-totp{"\n"}# or, in the LXC:{"\n"}offcuts-cli reset-totp</pre>
      </section>
    </div>
  );
}
