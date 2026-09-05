export default function Loading() {
  return (
    <main className="page-skeleton" aria-label="Loading Rewear">
      <div className="skeleton-header"><div className="skeleton-brand" /><div className="skeleton-line" style={{ width: 170 }} /></div>
      <div className="skeleton-box" style={{ maxWidth: 1360, height: 560, margin: "24px auto 0" }} />
      <div className="skeleton-grid">
        {Array.from({ length: 8 }).map((_, index) => <div className="skeleton-card" key={index} />)}
      </div>
    </main>
  );
}
