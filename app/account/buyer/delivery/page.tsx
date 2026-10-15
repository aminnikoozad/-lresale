import Link from "next/link";
import { redirect } from "next/navigation";
import { Localize } from "@/components/site-language";
import { createClient } from "@/lib/supabase/server";

export default async function BuyerDelivery() {
  const supabase = await createClient();
  const {data:{user}} = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/account/buyer/delivery");
  const {data:orders,error} = await supabase.from("orders")
    .select("id,recipient_name,address_line1,address_line2,city,province,postal_code,created_at")
    .eq("buyer_id",user.id).order("created_at",{ascending:false}).limit(10);
  return <Localize><main className="account-shared-page">
    <p className="eyebrow dark">Buyer account</p><h1>Delivery details</h1><p>Enter or update your delivery address during checkout. These are the delivery details recorded on your recent orders.</p>
    {error ? <p role="alert">Delivery details could not be loaded. Please try again.</p> : orders?.length ? orders.map(order=><section className="account-shared-card" key={order.id}><h2>Order {order.id.slice(0,8).toUpperCase()}</h2><address translate="no">{order.recipient_name}<br />{order.address_line1}<br />{order.address_line2 ? <>{order.address_line2}<br /></> : null}{order.city}, {order.province} {order.postal_code}</address></section>) : <section className="account-shared-card"><p>No delivery details yet. You can enter an address when you prepare your first order.</p></section>}
    <Link href="/account/buyer">Back to buyer account</Link>
  </main></Localize>;
}
