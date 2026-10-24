// Stored values stay language-independent. Older records are never regraded.
export const ITEM_CONDITIONS = [
  { value: "New", fr: "Neuf", enDescription: "Never worn, with no defects. Say whether the original tags are attached.", frDescription: "Jamais porté, sans défaut. Précisez si les étiquettes d’origine sont présentes." },
  { value: "Very good", fr: "Très bon état", enDescription: "Lightly worn, with only minor signs of use, such as a small loose thread. Show and describe them.", frDescription: "Peu porté, avec de légères traces d’usage, comme un petit fil lâche. Montrez-les et décrivez-les." },
  { value: "Good", fr: "Bon état", enDescription: "Regular signs of wear, such as light pilling or slight fading. Show and describe them.", frDescription: "Traces d’usage normales, comme un léger boulochage ou une couleur un peu passée. Montrez-les et décrivez-les." },
  { value: "Acceptable", fr: "État acceptable", enDescription: "Noticeable wear, but still wearable, such as a small stain, worn patch or visible repair. Show and describe each defect.", frDescription: "Usure visible, mais encore portable : petite tache, zone usée ou réparation apparente. Montrez et décrivez chaque défaut." },
  { value: "Poor", fr: "Mauvais état", enDescription: "Major damage or repairs needed, such as a large tear or a broken zip. Not offered for sale.", frDescription: "Dommages importants ou réparation nécessaire, comme une grande déchirure ou une fermeture brisée. Non proposé à la vente." },
] as const;
export function itemConditionLabel(value: string, fr: boolean) {
  return (fr ? ITEM_CONDITIONS.find(condition => condition.value === value)?.fr : null) ?? value;
}
