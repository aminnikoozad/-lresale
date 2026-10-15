import { ShoppingBag, Shirt, ArrowUpRight } from "lucide-react";
import { selectAccountWorkspace } from "@/app/account/workspace-actions";

export function AccountWorkspaceChoice() {
  return <main className="account-workspace-choice">
    <div className="account-choice-heading"><p className="eyebrow dark">One account, two ways to use it</p><h1>What would you like to do?</h1><p>Buy something you love or follow the items you sell with Shikimomo.</p></div>
    <div className="account-choice-options">
      <form action={selectAccountWorkspace}><input type="hidden" name="workspace" value="buyer" /><button type="submit" className="account-choice-card"><ShoppingBag aria-hidden="true" /><span><strong>Buyer</strong><small>Purchases, saved items, delivery and returns</small></span><ArrowUpRight aria-hidden="true" /></button></form>
      <form action={selectAccountWorkspace}><input type="hidden" name="workspace" value="seller" /><button type="submit" className="account-choice-card"><Shirt aria-hidden="true" /><span><strong>Seller</strong><small>Collections, item tracking, prices and earnings</small></span><ArrowUpRight aria-hidden="true" /></button></form>
    </div>
    <p className="account-choice-note">Switch between buying and selling at any time. Your profile and support messages are shared.</p>
  </main>;
}
