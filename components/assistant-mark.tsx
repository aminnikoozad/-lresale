export function AssistantMark({ active = false }: { active?: boolean }) {
  return (
    <span className="assistant-mark" data-active={active} aria-hidden="true">
      <svg viewBox="0 0 64 64" fill="none">
        <path
          d="M17 39C5 19 21 7 33 17c12-10 28 2 16 22L33 53 17 39Z"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinejoin="round"
        />
        <path
          d="M24 29v5m17-5v5M28 40c3 2 6 2 9 0"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}
