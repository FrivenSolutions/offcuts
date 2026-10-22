import { useState } from "react";
import { api } from "../lib/api";

interface Props {
  id: number;
  favorite: boolean;
  onChange?: (favorite: boolean) => void;
}

export function StarButton({ id, favorite, onChange }: Props) {
  const [on, setOn] = useState(favorite);
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className={`star ${on ? "on" : ""}`}
      aria-pressed={on}
      title={on ? "Remove star" : "Star this snippet"}
      aria-label={on ? "Remove star" : "Star this snippet"}
      disabled={busy}
      onClick={async (e) => {
        e.preventDefault();
        e.stopPropagation();
        setBusy(true);
        try {
          const r = await api<{ favorite: boolean }>("PUT", `/snippets/${id}/favorite`, { favorite: !on });
          setOn(r.favorite);
          onChange?.(r.favorite);
        } finally {
          setBusy(false);
        }
      }}
    >
      {on ? "★" : "☆"}
    </button>
  );
}
