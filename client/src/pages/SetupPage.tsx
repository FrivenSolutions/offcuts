import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { RecoveryCodeList } from "../components/RecoveryCodeList";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";

interface Enrollment {
  secret: string;
  otpauthUrl: string;
  qrSvg: string;
}

export function SetupPage() {
  const { status, refresh } = useAuth();
  const navigate = useNavigate();
  const [setupCode, setSetupCode] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [code, setCode] = useState("");
  // Set after enrollment. The page shows the codes once before it opens the app.
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const enrolling = status?.stage === "enroll";

  useEffect(() => {
    if (enrolling) api<Enrollment>("GET", "/auth/enroll").then(setEnrollment).catch((e) => setError(e.message));
  }, [enrolling]);

  async function createAccount(e: FormEvent) {
    e.preventDefault();
    if (password !== confirmPw) {
      setError("The passwords are not the same.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api("POST", "/auth/setup", { setupCode, username, password });
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function confirmCode(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await api<{ recoveryCodes: string[] }>("POST", "/auth/enroll", { code });
      setRecoveryCodes(r.recoveryCodes);
    } catch (err) {
      setError((err as Error).message);
      setCode("");
    } finally {
      setBusy(false);
    }
  }

  if (recoveryCodes) {
    return (
      <div className="auth-box wide">
        <h1>Two-factor login is on</h1>
        <RecoveryCodeList codes={recoveryCodes} />
        <button
          className="btn btn-primary btn-block"
          onClick={async () => {
            await refresh();
            navigate("/", { replace: true });
          }}
        >
          I saved my codes. Open Offcuts
        </button>
      </div>
    );
  }

  if (enrolling) {
    return (
      <div className="auth-box wide">
        <h1>Set up two-factor login</h1>
        <ol className="steps">
          <li>Open an authenticator app on your phone (for example Microsoft Authenticator, Google Authenticator, 2FAS or Aegis).</li>
          <li>Scan this QR code. If you cannot scan it, type the key below into the app.</li>
          <li>Enter the 6-digit code that the app shows.</li>
        </ol>
        {enrollment && (
          <>
            {/* The server makes this SVG from the otpauth URL. It contains no user content. */}
            <div className="qr" dangerouslySetInnerHTML={{ __html: enrollment.qrSvg }} />
            <p className="secret">
              Key: <code>{enrollment.secret.match(/.{1,4}/g)?.join(" ")}</code>
            </p>
          </>
        )}
        {error && <p className="error">{error}</p>}
        <form onSubmit={confirmCode}>
          <label className="field">
            <span>Code from the app</span>
            <input
              className="otp"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              required
            />
          </label>
          <button className="btn btn-primary btn-block" disabled={busy || code.length !== 6}>
            Finish setup
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="auth-box">
      <h1>Welcome to Offcuts</h1>
      <p>Create your account. Find the setup code in the server log:</p>
      <pre className="hint-block">docker logs offcuts{"\n"}# or, in the LXC:{"\n"}journalctl -u offcuts</pre>
      {error && <p className="error">{error}</p>}
      <form onSubmit={createAccount}>
        <label className="field">
          <span>Setup code</span>
          <input className="otp" value={setupCode} onChange={(e) => setSetupCode(e.target.value.trim())} inputMode="numeric" autoFocus required />
        </label>
        <label className="field">
          <span>Username</span>
          <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required />
        </label>
        <label className="field">
          <span>Password (at least 10 characters)</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" minLength={10} required />
        </label>
        <label className="field">
          <span>Confirm password</span>
          <input type="password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} autoComplete="new-password" minLength={10} required />
        </label>
        <button className="btn btn-primary btn-block" disabled={busy}>
          Create account
        </button>
      </form>
    </div>
  );
}
