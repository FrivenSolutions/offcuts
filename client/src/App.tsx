import { useEffect, type ReactNode } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router";
import { Header } from "./components/Header";
import { useAuth } from "./lib/auth";
import { BrowsePage } from "./pages/BrowsePage";
import { LoginPage } from "./pages/LoginPage";
import { SettingsPage } from "./pages/SettingsPage";
import { SetupPage } from "./pages/SetupPage";
import { SnippetEditPage } from "./pages/SnippetEditPage";
import { SnippetViewPage } from "./pages/SnippetViewPage";

function RequireAuth({ children }: { children: ReactNode }) {
  const { authed } = useAuth();
  const location = useLocation();
  if (!authed) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <>{children}</>;
}

export function App() {
  const { status } = useAuth();
  const location = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  if (!status) return <div className="page-loading">Loading…</div>;

  // On first run, every page goes to setup. During TOTP enrollment, setup stays open.
  const inSetup = status.setupRequired || status.stage === "enroll";
  if (inSetup && location.pathname !== "/setup") return <Navigate to="/setup" replace />;

  return (
    <>
      <Header />
      <main className="container">
        <Routes>
          <Route path="/" element={<BrowsePage />} />
          <Route path="/s/:id" element={<SnippetViewPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/setup" element={inSetup ? <SetupPage /> : <Navigate to="/" replace />} />
          <Route path="/new" element={<RequireAuth><SnippetEditPage /></RequireAuth>} />
          <Route path="/s/:id/edit" element={<RequireAuth><SnippetEditPage /></RequireAuth>} />
          <Route path="/settings" element={<RequireAuth><SettingsPage /></RequireAuth>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </>
  );
}
