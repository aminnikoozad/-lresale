import { BrandSymbol } from "./brand-symbol";
export function AssistantMark({ active = false }: { active?: boolean }) {
  return <span className="assistant-mark" data-active={active} aria-hidden="true"><BrandSymbol /></span>;
}
