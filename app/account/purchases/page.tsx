import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { BuyerAccountTools } from "@/components/buyer-account-tools";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function PurchasesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return (
    <main className="account-shell buyer-account-page">
      <header className="account-top">
        <Link href="/" className="brand">REWEAR<span>.</span></Link>
        <Link href="/account" className="back-home"><ArrowLeft /> Selling dashboard</Link>
      </header>
      <BuyerAccountTools />
    </main>
  );
}
