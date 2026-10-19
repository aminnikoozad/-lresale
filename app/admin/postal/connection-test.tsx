"use client";

import { useActionState } from "react";
import { useLocale } from "@/components/site-language";
import { testCanadaPostConnection, type PostalConnectionTest } from "./actions";

export function PostalConnectionTestForm({ origin }: { origin: string }) {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const t = (en:string,french:string) => fr ? french : en;
  const [result, action, pending] = useActionState<PostalConnectionTest,FormData>(testCanadaPostConnection,{status:"idle"});
  const messages: Record<PostalConnectionTest["status"],string> = {
    idle: "", not_configured: t("Add production API credentials and set production mode in Vercel first. No carrier request was sent.","Ajoutez les identifiants API de production et activez le mode production dans Vercel. Aucune requête n’a été envoyée au transporteur."),
    invalid_input: t("Enter valid Canadian postal codes, a packed weight of 1–30,000 g and dimensions of 1–2,000 mm.","Saisissez des codes postaux canadiens valides, un poids emballé de 1 à 30 000 g et des dimensions de 1 à 2 000 mm."),
    authentication: t("Canada Post rejected the credentials or API access. Check the production app, API key, secret and Rating API access.","Postes Canada a refusé les identifiants ou l’accès API. Vérifiez l’application de production, la clé, le secret et l’accès à l’API Tarification."),
    rate_limited: t("Canada Post is limiting requests. Wait a minute and try again.","Postes Canada limite les requêtes. Attendez une minute et réessayez."),
    invalid_request: t("Canada Post rejected the request. Check the postal codes, package measurements and customer or contract number.","Postes Canada a refusé la requête. Vérifiez les codes postaux, les mesures et le numéro de client ou de contrat."),
    unavailable: t("Canada Post could not be reached or returned an invalid response. No shipping price was confirmed.","Postes Canada est inaccessible ou a renvoyé une réponse invalide. Aucun tarif n’a été confirmé."),
    no_services: t("The connection responded but no supported service was offered for this package and route.","La connexion a répondu, mais aucun service pris en charge n’est proposé pour ce colis et ce trajet."),
    ok: t("Live Canada Post rates received. This test did not create a shipment or purchase a label. Customer quotes are not enabled automatically.","Tarifs réels de Postes Canada reçus. Ce test n’a créé aucun envoi ni acheté d’étiquette. Les devis clients ne sont pas activés automatiquement."),
  };
  return <section className="admin-items-card postal-connection-test">
    <h2>{t("Test Canada Post connection","Tester la connexion à Postes Canada")}</h2>
    <p>{t("Get a real rate before enabling customer quotes. No inventory item is required. This only checks rates; it does not buy postage.","Obtenez un tarif réel avant d’activer les devis clients. Aucun article en stock n’est requis. Ce test consulte uniquement les tarifs et n’achète aucun affranchissement.")}</p>
    <form action={action}><input type="hidden" name="locale" value={locale}/><fieldset disabled={pending} style={{border:0,padding:0,minWidth:0}}><div className="postal-admin-grid">
      <label>{t("Origin postal code","Code postal de départ")}<input name="origin" required maxLength={7} defaultValue={origin} placeholder="H2X 1Y4" autoComplete="off"/></label>
      <label>{t("Destination postal code","Code postal de destination")}<input name="destination" required maxLength={7} placeholder="K1A 0B1" autoComplete="off"/></label>
      <label>{t("Packed weight (grams)","Poids emballé (grammes)")}<input name="weight" type="number" min={1} max={30000} step={1} required/></label>
      {[["length",t("Length (mm)","Longueur (mm)")],["width",t("Width (mm)","Largeur (mm)")],["height",t("Height (mm)","Hauteur (mm)")]].map(([name,label])=><label key={name}>{label}<input name={name} type="number" min={1} max={2000} step={1} required/></label>)}
    </div><button disabled={pending} type="submit">{pending?t("Testing…","Test en cours…"):t("Test connection & rates","Tester la connexion et les tarifs")}</button></fieldset></form>
    {result.status!=="idle"?<div className={`postal-test-result ${result.status==="ok"?"success":"error"}`} role="status"><p>{messages[result.status]}</p>{result.testedAt?<small>{new Intl.DateTimeFormat(fr?"fr-CA":"en-CA",{dateStyle:"medium",timeStyle:"short",timeZone:"America/Toronto"}).format(new Date(result.testedAt))} · Montréal</small>:null}</div>:null}
    {result.status==="ok"&&result.rates?.length?<div className="postal-test-rates"><table><thead><tr><th>{t("Service","Service")}</th><th>{t("Total incl. shipping taxes","Total, taxes d’expédition incluses")}</th><th>{t("Estimated business days","Jours ouvrables estimés")}</th></tr></thead><tbody>{result.rates.map(rate=><tr key={rate.serviceCode}><td>{rate.serviceName}</td><td>{new Intl.NumberFormat(fr?"fr-CA":"en-CA",{style:"currency",currency:"CAD"}).format(rate.totalCents/100)}</td><td>{rate.transitDays ?? "—"}</td></tr>)}</tbody></table></div>:null}
  </section>;
}
