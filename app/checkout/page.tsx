import { CheckoutClient } from "./checkout-client";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function CheckoutPage({ searchParams }: Props) {
  const params = await searchParams;
  const raw = typeof params.items === "string" ? params.items : "";
  const itemIds = raw.split(",").filter((id) => /^[0-9a-f-]{36}$/i.test(id)).slice(0, 25);
  return <main className="checkout-page section-wrap"><CheckoutClient itemIds={itemIds} /></main>;
}
