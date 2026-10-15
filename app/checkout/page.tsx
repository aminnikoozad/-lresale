
import { Localize } from "@/components/site-language";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import {
  CheckoutClient,
  type CheckoutDeliveryDefaults,
} from "./checkout-client";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export const dynamic = "force-dynamic";

export default async function CheckoutPage({ searchParams }: Props) {
  const params = await searchParams;
  const raw = typeof params.items === "string" ? params.items : "";
  const itemIds = raw
    .split(",")
    .filter((id) => /^[0-9a-f-]{36}$/i.test(id))
    .slice(0, 25);

  let initialDelivery: CheckoutDeliveryDefaults | null = null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    const { data: profile, error } = await supabase
      .from("profiles")
      .select("full_name,address_line1,city,province,postal_code")
      .eq("id", user.id)
      .maybeSingle();
    if (error) {
      console.error("[checkout] profile prefill failed", {
        code: error.code,
        message: error.message,
      });
    } else if (profile) {
      initialDelivery = {
        recipientName: profile.full_name ?? "",
        addressLine1: profile.address_line1 ?? "",
        city: profile.city ?? "",
        province: profile.province ?? "QC",
        postalCode: profile.postal_code ?? "",
      };
    }
  }

  if (user) {
    try {
      const draft = JSON.parse(
        (await cookies()).get("rewear-delivery-draft")?.value || "null",
      );
      if (
        draft?.userId === user.id &&
        [
          "recipientName",
          "addressLine1",
          "city",
          "province",
          "postalCode",
        ].every((k) => typeof draft[k] === "string" && draft[k].length <= 200)
      )
        initialDelivery = draft;
    } catch {}
  }
  return <Localize>{(
    <main className="checkout-page section-wrap">
      <CheckoutClient itemIds={itemIds} initialDelivery={initialDelivery} />
    </main>
  )}</Localize>;
}
