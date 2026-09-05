export default function AccountLoading() {
  return (
    <main className="page-skeleton" aria-label="Loading customer account">
      <div className="skeleton-header"><div className="skeleton-brand" /><div className="skeleton-line" style={{ width: 120 }} /></div>
      <div style={{ maxWidth: 1240, margin: "42px auto 0" }}>
        <div className="skeleton-line" style={{ width: 150, marginBottom: 14 }} />
        <div className="skeleton-box" style={{ width: "min(620px,100%)", height: 64, marginBottom: 28 }} />
        <div className="skeleton-grid" style={{ gridTemplateColumns: "repeat(3,minmax(0,1fr))", margin: 0 }}>
          {Array.from({ length: 3 }).map((_, index) => <div className="skeleton-box" style={{ height: 150 }} key={index} />)}
        </div>
        <div className="skeleton-box" style={{ height: 360, marginTop: 22 }} />
      </div>
    </main>
  );
}
