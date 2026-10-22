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
  const [useRecovery, setUseRecovery] = useState(false);
  // Set after a login with a recovery code, to tell the user how many are left.
  const [recoveryLeft, setRecoveryLeft] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const from = (location.state as { from?: string } | null)?.from ?? "/";
  if (recoveryLeft !== null) {
    return (
      <div className="auth-box">
        <h1>Logged in with a recovery code</h1>
        <p>
          That code is now used up. You have {recoveryLeft} recovery code{recoveryLeft === 1 ? "" : "s"} left.
        </p>
        <p>If you lost your phone, reset two-factor login with the command in Settings, then make new recovery codes.</p>
        <button
          className="btn btn-primary btn-block"
          onClick={async () => {
            await refresh();
            navigate(from, { replace: true });
          }}
        >
          Continue
        </button>
      </div>
    );
  }

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
      const r = await api<{ usedRecoveryCode?: boolean; remaining?: number }>("POST", "/auth/totp", { code });
      if (r.usedRecoveryCode) {
        setRecoveryLeft(r.remaining ?? 0);
        return;
      }
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
          {useRecovery ? (
            <>
              <p>Enter one of your recovery codes. Each code works once.</p>
              <label className="field">
                <span>Recovery code</span>
                <input
                  key="recovery"
                  className="otp"
                  value={code}
                  onChange={(e) => setCode(e.target.value.slice(0, 9))}
                  placeholder="xxxx-xxxx"
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  autoFocus
                  required
                />
              </label>
            </>
          ) : (
            <>
              <p>Enter the 6-digit code from your authenticator app.</p>
              <label className="field">
                <span>Code</span>
                <input
                  key="totp"
                  className="otp"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  autoFocus
                  required
                />
              </label>
            </>
          )}
          <button className="btn btn-primary btn-block" disabled={busy || (useRecovery ? code.replace(/[\s-]/g, "").length !== 8 : code.length !== 6)}>
            Log in
          </button>
          <button
            type="button"
            className="link-button switch-code"
            onClick={() => {
              setUseRecovery(!useRecovery);
              setCode("");
              setError("");
            }}
          >
            {useRecovery ? "Use the authenticator code" : "Lost your phone? Use a recovery code"}
          </button>
        </form>
      )}
    </div>
  );
}
