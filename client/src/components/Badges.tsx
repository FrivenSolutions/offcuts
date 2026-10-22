import { languageInfo } from "../../../shared/languages";

export function LanguageBadge({ language }: { language: string }) {
  return <span className={`badge lang lang-${language}`}>{languageInfo(language).label}</span>;
}

export function VisibilityBadge({ isPublic }: { isPublic: boolean }) {
  return isPublic ? <span className="badge public">Public</span> : <span className="badge private">Private</span>;
}

interface TagListProps {
  tags: string[];
  active?: string[];
  onTagClick?: (tag: string) => void;
}

export function TagList({ tags, active = [], onTagClick }: TagListProps) {
  if (tags.length === 0) return null;
  return (
    <span className="tag-list">
      {tags.map((t) =>
        onTagClick ? (
          <button
            key={t}
            className={`tag ${active.some((a) => a.toLowerCase() === t.toLowerCase()) ? "active" : ""}`}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onTagClick(t);
            }}
          >
            #{t}
          </button>
        ) : (
          <span key={t} className="tag">
            #{t}
          </span>
        ),
      )}
    </span>
  );
}
