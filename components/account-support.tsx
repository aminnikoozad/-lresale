"use client";
import { CustomerSupport } from "@/components/customer-support";
import { useLocale } from "@/components/site-language";
export function AccountSupport({userId}:{userId:string}) {
  const {locale}=useLocale();
  return <CustomerSupport userId={userId} fr={locale==="fr"} loginReturnTo="/account/messages" />;
}
