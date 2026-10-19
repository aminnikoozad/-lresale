import { useId } from "react";
/** Tint the approved symbol with the original Shikimomo green. */
export function BrandSymbol() {
  const filterId = "shikimomo-green-" + useId().replace(/:/g, "");
  return <svg viewBox="610 200 330 425" aria-hidden="true" focusable="false" style={{display:"block",width:"100%",height:"100%"}}>
    <defs><filter id={filterId} colorInterpolationFilters="sRGB">
      <feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -1 -1 -1 0 2.85" result="ink" />
      <feFlood floodColor="#37654f" />
      <feComposite operator="in" in2="ink" />
    </filter></defs>
    <image href="/brand/shikimomo-approved.png" width="1536" height="1024" filter={`url(#${filterId})`} />
  </svg>;
}
