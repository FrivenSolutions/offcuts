import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { useAuth } from "../lib/auth";
import { isShortcut } from "../lib/keys";

const SEARCH_ID = "browse-search";

export function focusSearch(): void {
  const el = document.getElementById(SEARCH_ID) as HTMLInputElement | null;
  el?.focus();
  el?.select();
}

export { SEARCH_ID };

const LIST: [string, string][] = [
  ["/", "Search"],
  ["N", "New snippet"],
  ["E", "Edit this snippet (snippet page)"],
  ["C", "Copy the first fragment (snippet page)"],
  ["Ctrl + S", "Save (editor)"],
  ["?", "Show or hide this list"],
  ["Esc", "Close a dialog"],
];

/** App-wide keyboard shortcuts, and the help panel that lists them. */
export function Shortcuts() {
  const { authed } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [help, setHelp] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && help) return setHelp(false);
      if (!isShortcut(e)) return;
      if (e.key === "?") {
        e.preventDefault();
        setHelp((h) => !h);
      } else if (e.key === "/") {
        e.preventDefault();
        if (location.pathname === "/") focusSearch();
        else {
          navigate("/");
          setTimeout(focusSearch, 50);
        }
      } else if ((e.key === "n" || e.key === "N") && authed) {
        e.preventDefault();
        navigate("/new");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [authed, help, location.pathname, navigate]);

  if (!help) return null;
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setHelp(false)}>
      <div className="modal narrow-modal" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts">
        <h2>Keyboard shortcuts</h2>
        <table className="shortcut-table">
          <tbody>
            {LIST.map(([key, what]) => (
              <tr key={key}>
                <td>
                  <kbd>{key}</kbd>
                </td>
                <td>{what}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <button className="btn" onClick={() => setHelp(false)}>
          Close
        </button>
      </div>
    </div>
  );
}
