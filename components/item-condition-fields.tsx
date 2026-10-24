import { ITEM_CONDITIONS, itemConditionLabel } from "@/lib/item-condition";

export function ItemConditionGuide({fr=false}:{fr?:boolean}) {
  return <details>
    <summary>{fr ? "Guide de l’état des vêtements" : "Clothing condition guide"}</summary>
    <ul>{ITEM_CONDITIONS.map(condition => <li key={condition.value}>
      <strong>{itemConditionLabel(condition.value,fr)}: </strong>
      {fr ? condition.frDescription : condition.enDescription}
    </li>)}</ul>
    <p>{fr
      ? "Les fibres naturelles du tissu ne sont pas un défaut en soi. Une étiquette de marque abîmée ne change pas forcément l’état du vêtement. Signalez toute étiquette absente ou illisible, surtout pour la taille et l’entretien."
      : "Natural fabric fibres are not a defect on their own. A damaged brand label does not necessarily lower the clothing’s condition. Disclose missing or unreadable labels, especially size and care labels."}</p>
    <p>{fr
      ? "Décrivez chaque défaut connu et ajoutez-en une photo nette. Aucun nombre fixe d’angles n’est requis."
      : "Describe every known defect and add a clear photo of it. No fixed number of photo angles is required."}</p>
  </details>;
}

export function ItemConditionFields({value,fr=false}:{value?:string|null;fr?:boolean}) {
  const legacy = value && !ITEM_CONDITIONS.some(condition => condition.value === value);
  return <div>
    <label>{fr ? "État du vêtement" : "Clothing condition"}
      <select name="item_condition" defaultValue={value ?? ""}>
        <option value="">{fr ? "À choisir avant l’envoi pour révision" : "Choose before submitting for review"}</option>
        {legacy && <option value={value}>{value}</option>}
        {ITEM_CONDITIONS.map(condition => <option key={condition.value} value={condition.value} disabled={condition.value === "Poor"}>
          {itemConditionLabel(condition.value,fr)}{condition.value === "Poor" ? (fr ? " — non proposé à la vente" : " — not offered for sale") : ""}
        </option>)}
      </select>
    </label>
    <ItemConditionGuide fr={fr}/>
  </div>;
}
