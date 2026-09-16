-- Customer-facing knowledge for the managed resale quality workflow.
with entries(title,question_examples,approved_answer,category_code,tags) as (
  values
  ('What Inspected by REWEAR means',
   array['What does Inspected by REWEAR mean?','Is an inspected item authenticated?','What does the inspection badge mean?','Que signifie inspecté par REWEAR ?']::text[],
   '“Inspected by REWEAR” means Rewear staff recorded a condition review before publication. The item page can show the recorded condition, customer-facing inspection notes and completed checks. Inspection is not the same as brand authentication unless Rewear explicitly says a separate authenticity verification was performed.',
   'selling.item_status',array['inspected by rewear','inspection badge','condition review','not authentication']::text[]),
  ('Condition report on a product page',
   array['Where can I see condition details?','Does the product page show defects?','Where is the inspection report?','Où voir l’état détaillé de l’article ?']::text[],
   'A published item can have a Rewear condition grade plus customer-facing inspection notes and recorded checks on its product detail page. These details are intended to make second-hand condition easier to understand before buying.',
   'selling.item_status',array['condition report','product detail','inspection notes','condition grade']::text[]),
  ('Last Chance label',
   array['What does Last Chance mean?','Why does an item say last chance?','Does Last Chance change my commission?','Que signifie Last Chance ?']::text[],
   'Last Chance means a listed item is nearing the end of the current Rewear selling period. It is an urgency/status label and does not by itself change the seller’s locked commission percentage or automatically promise a specific discount.',
   'selling.item_status',array['last chance','selling period','90 days','commission lock']::text[]),
  ('Seller item journey timeline',
   array['What are the steps after pickup?','What does the item timeline mean?','Where can I follow my item?','Comment suivre les étapes de mon article ?']::text[],
   'The Customer Account can show an item journey through stages such as Received, Inspection, Pricing, Approved, Listed, Sold and Paid. A stage describes recorded progress; it is not a promise of an exact completion date.',
   'selling.item_status',array['timeline','received','inspection','pricing','approved','listed','sold','paid']::text[]),
  ('Unsold or rejected item preference',
   array['Can I choose return or donate?','What happens if my item is unsold?','Can I save a donation preference?','Puis-je choisir retour ou don ?']::text[],
   'For eligible seller items, the Customer Account can record a preference to Return to me or Donate if the item later needs end-of-cycle handling. Saving a preference does not itself create a shipment, donation transaction or immediate return; Rewear confirms the operational next step when the item reaches that stage.',
   'selling.item_status',array['return preference','donate preference','unsold item','rejected item','end of cycle']::text[]),
  ('Available Pending and Paid Out wallet labels',
   array['What is pending balance?','What does paid out mean?','What do the wallet balance labels mean?','Que signifient Disponible En attente et Versé ?']::text[],
   'Wallet summaries are based only on transactions actually recorded in the customer account. Available reflects completed wallet transactions, Pending reflects recorded transactions that are not completed yet, and Paid out reflects completed payout or withdrawal records when such records exist. A displayed label does not mean a payout integration is active if the payout control is still unavailable.',
   'account.profile',array['available balance','pending balance','paid out','wallet labels']::text[]),
  ('How Rewear uses pricing guidance',
   array['How does Rewear decide a suggested price?','Do you compare previous sales?','Is the suggested price guaranteed?','Comment Rewear estime le prix ?']::text[],
   'Rewear staff may use internal completed-sale history and comparable items as one pricing signal when enough data exists, together with condition, brand, item type, demand and other relevant factors. A pricing signal is guidance only, not a guaranteed sale price or guaranteed earnings amount. Seller price approval and the current commission rules still apply.',
   'selling.pricing',array['suggested price','comparable sales','pricing guidance','not guaranteed']::text[]),
  ('Pre-pickup eligibility check is not final acceptance',
   array['If I pass the checklist is my item accepted?','Does the eligibility check guarantee listing?','What is the quick eligibility check?','Le contrôle avant ramassage garantit-il l’acceptation ?']::text[],
   'The pre-pickup checklist helps customers prepare likely eligible items before collection. It does not guarantee acceptance or publication. Rewear makes the final resale decision after the item is received and inspected.',
   'selling.item_acceptance',array['eligibility check','not final acceptance','pickup checklist','inspection']::text[])
)
insert into public.knowledge_base(title,question_examples,approved_answer,category_code,tags,status,source_kind,source_ref,approved_at)
select e.title,e.question_examples,e.approved_answer,e.category_code,e.tags,'approved','admin','managed-resale-upgrades-20260916',now()
from entries e
where not exists(select 1 from public.knowledge_base kb where kb.title=e.title and kb.status='approved');

with rules(rule_name,instruction,priority) as (
  values
  ('Do not equate inspection with authentication','Never describe an Inspected by REWEAR badge as proof of brand authenticity unless an approved customer-facing source explicitly says a separate authentication was performed for that item.',980),
  ('Saved disposition is a preference only','When a customer saves Return to me or Donate, describe it as a recorded preference. Do not claim a return shipment, donation or other fulfillment has already occurred until the live system records that action.',960),
  ('Pricing signals are not guarantees','If discussing Rewear pricing guidance or comparable-sale signals, clearly distinguish guidance from a guaranteed listing price, sale price, sale timing or seller earnings.',920),
  ('Last Chance does not alter locked commission','A Last Chance status or later price reduction must never be described as changing the seller commission percentage that was locked from the initial approved price.',940)
)
insert into public.ai_behavior_rules(rule_name,instruction,priority,status,approved_at)
select r.rule_name,r.instruction,r.priority,'approved',now()
from rules r
where not exists(select 1 from public.ai_behavior_rules x where x.rule_name=r.rule_name);
