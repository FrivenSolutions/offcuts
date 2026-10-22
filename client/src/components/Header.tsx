import { Link, useNavigate } from "react-router";
import { useAuth } from "../lib/auth";
import { ThemeToggle } from "./ThemeToggle";

export function Header() {
  const { authed, status, logout } = useAuth();
  const navigate = useNavigate();
  const inSetup = status?.setupRequired || status?.stage === "enroll";

  return (
    <header className="site-header">
      <div className="container header-inner">
        <Link to="/" className="brand">
          <img src="/favicon.svg" alt="" width={24} height={24} />
          Offcuts
        </Link>
        <nav className="header-actions">
          {authed && (
            <Link to="/new" className="btn btn-primary">
              + New snippet
            </Link>
          )}
          <ThemeToggle />
          {authed ? (
            <>
              <Link to="/trash" className="btn btn-ghost" title="Trash">
                Trash
              </Link>
              <Link to="/settings" className="btn btn-ghost" title="Settings">
                Settings
              </Link>
              <button
                className="btn btn-ghost"
                onClick={async () => {
                  await logout();
                  navigate("/");
                }}
              >
                Log out
              </button>
            </>
          ) : (
            !inSetup && (
              <Link to="/login" className="btn">
                Log in
              </Link>
            )
          )}
        </nav>
      </div>
    </header>
  );
}
