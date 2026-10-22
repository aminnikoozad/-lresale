
import { Localize } from "@/components/site-language";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Heart, PackageCheck, ShoppingBag, MapPin } from "lucide-react";
import { BuyerAccountTools } from "@/components/buyer-account-tools";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function PurchasesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/account/buyer");
  return <Localize>{(
    <main className="account-shell buyer-account-page">

      <section className="account-workspace-intro"><p className="eyebrow dark">Buyer account</p><h1>Your shopping</h1><p>Follow purchases, manage saved items and request help with an order.</p>
        <nav className="account-shortcuts" aria-label="Shopping tools">
          <Link href="#orders"><PackageCheck /> Purchases &amp; returns</Link><Link href="#saved"><Heart /> Saved items</Link><Link href="/account/buyer/delivery"><MapPin /> Delivery details</Link><Link href="/cart"><ShoppingBag /> Shopping bag</Link>
        </nav>
      </section>
      <BuyerAccountTools />
    </main>
  )}</Localize>;
}
