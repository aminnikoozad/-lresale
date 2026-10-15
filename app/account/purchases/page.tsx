import { redirect } from "next/navigation";
import { legacyAccountDestination } from "@/lib/account-workspaces";

export default async function LegacyPurchases({ searchParams }: {searchParams: Promise<Record<string, string | string[] | undefined>>}) {
  redirect(legacyAccountDestination("/account/buyer", await searchParams));
}
