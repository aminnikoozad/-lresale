import { BrandSymbol } from "./brand-symbol";
/** Use the approved artwork to preserve the supplied lettering and symbol. */
export function BrandWordmark() {
  return <span className="shikimomo-wordmark" role="img" aria-label="Shikimomo" translate="no" style={{display:"inline-flex",alignItems:"center",gap:".16em",lineHeight:1,verticalAlign:"middle"}}>
    <svg viewBox="305 638 930 172" aria-hidden="true" focusable="false" style={{display:"block",width:"5.4em",height:"1em",flexShrink:0,mixBlendMode:"multiply"}}><image href="/brand/shikimomo-approved.png" width="1536" height="1024" /></svg>
    <span style={{display:"inline-block",width:".86em",height:"1.12em",flexShrink:0}}><BrandSymbol /></span>
  </span>;
}
