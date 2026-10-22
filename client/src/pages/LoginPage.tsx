import { useState, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate } from "react-router";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";

export function LoginPage() {
  const { authed, status, refresh } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [step, setStep] = useState<"password" | "totp">(status?.stage === "totp" ? "totp" : "password");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const from = (location.state as { from?: string } | null)?.from ?? "/";
  if (authed) return <Navigate to={from} replace />;

  async function submitPassword(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await api<{ next: "totp" | "enroll" }>("POST", "/auth/login", { username, password });
      setPassword("");
      if (r.next === "enroll") {
        await refresh();
        navigate("/setup");
      } else {
        setStep("totp");
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function submitCode(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("POST", "/auth/totp", { code });
      await refresh();
      navigate(from, { replace: true });
    } catch (err) {
      setError((err as Error).message);
      setCode("");
      if ((err as { status?: number }).status === 403) setStep("password");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-box">
      <h1>Log in</h1>
      {error && <p className="error">{error}</p>}
      {step === "password" ? (
        <form onSubmit={submitPassword}>
          <label className="field">
            <span>Username</span>
            <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoFocus required />
          </label>
          <label className="field">
            <span>Password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </label>
          <button className="btn btn-primary btn-block" disabled={busy}>
            Continue
          </button>
        </form>
      ) : (
        <form onSubmit={submitCode}>
          <p>Enter the 6-digit code from your authenticator app.</p>
          <label className="field">
            <span>Code</span>
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
            Log in
          </button>
        </form>
      )}
    </div>
  );
}
