// Shows plain text, keeps line breaks, and turns web addresses into links.
const URL_PATTERN = /(https?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]])/g;

export function LinkedText({ text, className = "" }: { text: string; className?: string }) {
  const parts = text.split(URL_PATTERN);
  return (
    <p className={className}>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <a key={i} href={part} target="_blank" rel="noopener noreferrer">
            {part}
          </a>
        ) : (
          part
        ),
      )}
    </p>
  );
}
