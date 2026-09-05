export default function AdminLoading() {
  return (
    <main className="page-skeleton" aria-label="Loading administration">
      <div className="skeleton-header"><div className="skeleton-brand" /><div className="skeleton-line" style={{ width: 300 }} /></div>
      <div style={{ maxWidth: 1280, margin: "34px auto 0" }}>
        <div className="skeleton-line" style={{ width: 180, marginBottom: 14 }} />
        <div className="skeleton-box" style={{ width: "min(680px,100%)", height: 66, marginBottom: 24 }} />
        <div className="skeleton-grid skeleton-stats">
          {Array.from({ length: 6 }).map((_, index) => <div className="skeleton-box" style={{ height: 112 }} key={index} />)}
        </div>
        <div className="skeleton-box" style={{ height: 320, marginTop: 22 }} />
      </div>
    </main>
  );
}
