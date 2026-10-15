import { AssistantMark } from "./assistant-mark";
/** Visual heart is decorative; the accessible brand remains Shikimomo. */
export function BrandWordmark() {
  return <span className="shikimomo-wordmark" role="img" aria-label="Shikimomo" translate="no"><b aria-hidden="true">shiki<em>momo</em><AssistantMark /></b></span>;
}
