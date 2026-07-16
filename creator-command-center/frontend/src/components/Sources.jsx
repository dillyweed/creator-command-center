// Renders the list of web-search source links the Research bot found.
export default function Sources({ sources }) {
  if (!sources || sources.length === 0) return null;
  return (
    <div className="mt-2">
      <div className="mb-1 flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-tm">
        <i className="ti ti-world-search text-[12px]" aria-hidden="true" />
        Sources ({sources.length})
      </div>
      <div className="flex flex-col gap-1">
        {sources.map((s, i) => (
          <a
            key={i}
            href={s.url}
            target="_blank"
            rel="noreferrer noopener"
            title={s.url}
            className="flex items-center gap-1.5 truncate text-[11px] text-accent hover:underline"
          >
            <i className="ti ti-external-link flex-shrink-0 text-[12px]" aria-hidden="true" />
            <span className="truncate">{s.title}</span>
          </a>
        ))}
      </div>
    </div>
  );
}
