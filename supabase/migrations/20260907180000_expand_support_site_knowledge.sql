-- Expand the approved customer-facing knowledge base from verified live Rewear functionality.
-- This is intentionally limited to customer-visible behavior and does not expose admin/internal details.

with entries(title, question_examples, approved_answer, category_code, tags) as (
  values
  (
    'How Rewear works',
    array['How does Rewear work?','How does selling with Rewear work?','What happens after I send my items?','Comment fonctionne Rewear ?']::text[],
    'Rewear is a managed second-hand marketplace. Customers can shop published, inspected items, or sign in and arrange a Bag or pickup for items they want Rewear to resell. After collection, Rewear reviews the items, prepares accepted items, photographs and prices them, and publishes eligible listings. Sellers can follow item status, review pricing and commission, and see earnings information from their customer account.',
    'other.general',
    array['how it works','rewear','selling process','managed resale','getting started']::text[]
  ),
  (
    'Shopping the Rewear catalog',
    array['How do I shop?','What can I buy on the site?','How do I filter products?','Where are the products?','Comment trouver un article ?']::text[],
    'The Shop section shows only items that Rewear staff have published. Current catalog categories include Women, Men, Kids, Shoes, Accessories and Electronics. Customers can browse by category and use available Brand and Size filters. Product cards show the published photo, brand, item name, condition or size when available, and the CAD price.',
    'other.general',
    array['shop','catalog','products','categories','brand filter','size filter','women','men','kids','shoes','accessories','electronics']::text[]
  ),
  (
    'Customer account dashboard',
    array['What can I do in my account?','What is in the customer dashboard?','Where do I see my items?','Where do I see my requests?','Que puis-je voir dans mon compte ?']::text[],
    'After signing in, the customer dashboard shows your available balance, number of items with Rewear and total completed sale credits. The My Items tab shows seller items and pricing details, My Requests shows Bag and pickup requests, and the Payout tab shows the current payout status. The dashboard also provides controls to request a Bag or pickup and shows your customer username and customer code.',
    'account.profile',
    array['customer dashboard','my account','my items','my requests','balance','customer code','account navigation']::text[]
  ),
  (
    'Where to find the commission guide',
    array['Where can I see the commission table?','Where are the seller percentages?','Where do I see my share?','Where is the commission guide?','Où voir la commission ?']::text[],
    'The commission guide is inside the signed-in Customer Account, not on the public homepage. It shows the current seller share and platform share by initial approved item price. Each individual seller item also shows its own seller share and platform commission in My Items.',
    'selling.commission',
    array['commission guide','commission table','seller share','platform share','customer account']::text[]
  ),
  (
    'Seller price approval and commission lock',
    array['Why do I need to approve the price?','What happens when I approve pricing?','Can my commission change after a discount?','How do I approve my item price?','Pourquoi dois-je approuver le prix ?']::text[],
    'When an accepted item needs seller approval, My Items shows the proposed initial approved price, seller share and platform commission. The seller can use Approve price & commission. After approval, the commission percentage is locked from that initial approved price and does not change if the item is later discounted. Estimated earnings can change with the final selling price, but the locked percentage stays the same.',
    'selling.pricing',
    array['price approval','approve price','commission lock','locked percentage','initial approved price','discount']::text[]
  ),
  (
    'Understanding seller item details',
    array['What information do I see for my item?','What is estimated earnings?','What is final earnings?','Why does my item say pricing approval required?','Que signifie le statut de mon article ?']::text[],
    'In My Items, a seller can see the item status, initial approved price, current selling price, seller share, platform commission, estimated earnings and final earnings after a completed sale when available. If Pricing approval required appears, the seller must review and approve the proposed price and commission before the pricing lock is completed.',
    'selling.item_status',
    array['item status','seller item','estimated earnings','final earnings','pricing approval required','my items']::text[]
  ),
  (
    'Clothing preparation and acceptance',
    array['What clothes can I send?','How should I prepare clothing?','Do clothes need to be clean?','Do you accept damaged clothes?','Comment préparer mes vêtements ?']::text[],
    'Clothing, shoes and accessories submitted for resale should be clean, washed and neatly prepared, with no stains, tears, holes, serious damage or missing parts. Individual listings normally need an approved resale value of at least $20. A pickup request does not guarantee that every item will be accepted; Rewear inspects items after collection before deciding what can be listed.',
    'selling.item_acceptance',
    array['clothing condition','washed','folded','stains','tears','holes','damage','item acceptance','minimum value']::text[]
  ),
  (
    'Electronics preparation and ownership',
    array['What electronics can I send?','What do I need to do before sending a phone?','Do I need proof of ownership?','Should I remove my account from the device?','Que faut-il faire avant d''envoyer un appareil ?']::text[],
    'Electronics submitted for resale should power on and function properly and should not have serious physical damage. The customer must be able to verify ownership, and Rewear may check identification, serial numbers or IMEI where applicable. Passwords, personal user accounts and activation locks should be removed before collection. Rewear tests devices and determines the approved resale value after review.',
    'selling.item_acceptance',
    array['electronics','phone','computer','ownership','serial number','imei','activation lock','password','device testing']::text[]
  ),
  (
    'Requesting a pickup',
    array['How do I request pickup?','How do I arrange collection?','What information do I need for pickup?','How do I choose a pickup time?','Comment demander un ramassage ?']::text[],
    'Open the signed-in Customer Account and choose Request pickup or Arrange collection. The request asks what is being collected, an active pickup city, an available time slot, collection address, approximate item count, optional brand notes, estimated resale value and confirmation of the required terms. Rewear reviews the request and the pickup must meet the current eligibility, fee and scheduling rules before collection.',
    'pickup.new',
    array['request pickup','arrange collection','pickup form','pickup city','time slot','address','item count','estimated value']::text[]
  ),
  (
    'Requesting a Bag or Box',
    array['How do I request a Bag?','What is the minimum for a Bag?','Can I get a Box?','Where do I request a bag?','Comment demander un sac ?']::text[],
    'A Bag or Box request is started from the signed-in Customer Account using Request a Bag. Under the current approved rules, the submitted items need an estimated combined resale value of at least $100 CAD for a Bag or Box request. The request still requires an eligible service area, available time slot and acceptance of the collection terms.',
    'pickup.eligibility',
    array['bag request','box request','request a bag','bag minimum','$100','service area','time slot']::text[]
  ),
  (
    'Pickup cities and time slots',
    array['Which cities do you pick up from?','Why is my city not listed?','Why are there no pickup times?','How are pickup times chosen?','Pourquoi aucun créneau n''est disponible ?']::text[],
    'Pickup locations and time slots are controlled by the active service areas and schedules shown in the Customer Account. Customers should choose from the cities currently available in the pickup form. If a city has no open time slots, the site asks the customer to check again after new times are added. Do not assume an unlisted city is eligible.',
    'pickup.eligibility',
    array['pickup city','service area','time slot','availability','pickup schedule','no slots']::text[]
  ),
  (
    'Pickup status in the customer account',
    array['Where do I see my pickup request?','How do I check pickup status?','Where is my Bag request?','Can the bot tell me my pickup status?','Où voir le statut de mon ramassage ?']::text[],
    'The My Requests tab in the signed-in Customer Account shows recent Bag and pickup requests, including request type, category, status, confirmation status and whether a pickup fee applies or the request is free. The support assistant can also read recent pickup statuses tied to the currently signed-in customer account when asked about your own pickup status.',
    'pickup.new',
    array['pickup status','my requests','bag status','confirmation status','own pickup','recent pickup']::text[]
  ),
  (
    'Item status through support chat',
    array['Can the bot check my item status?','What is the status of my item?','Can support see my items?','Where is my item status?','Quel est le statut de mon article ?']::text[],
    'The support assistant can read recent item statuses that belong to the currently signed-in customer account. It can only use the authenticated customer identity and cannot look up another customer’s private items. The same seller item information is available in the My Items tab of the Customer Account.',
    'selling.item_status',
    array['my item status','support item status','own items','authenticated account','my items']::text[]
  ),
  (
    'Support chat access and human help',
    array['Where is the chat?','Why can''t I see chat when logged out?','Can I talk to a human?','How do I contact support?','Comment parler au support ?']::text[],
    'Customer chat is available only after the customer signs in. The conversation is connected to that authenticated customer account. The AI assistant answers from approved Rewear knowledge and may read limited status information from the customer’s own account. Customers can request a human support agent, and sensitive or unresolved issues are routed to human support without exposing another customer’s information.',
    'other.general',
    array['chat','support chat','sign in','logged in','human support','talk to human','authenticated chat']::text[]
  ),
  (
    'Current balance and payment controls',
    array['What does available balance mean?','What does total earned mean?','Can I use my balance now?','Can I set up payout now?','Que signifie mon solde disponible ?']::text[],
    'The Customer Account displays an Available balance based on completed wallet transactions and Total earned based on completed sale credits. The current customer interface shows Shop with balance and payout setup controls as unavailable until the related payment integrations or verification are connected. For an actual payout, refund, payment problem or transaction dispute, the conversation must be handled by human support.',
    'account.profile',
    array['available balance','total earned','sale credits','shop with balance','payout setup','payment integration']::text[]
  ),
  (
    'Bundles for lower-value items',
    array['What happens to items under $20?','Can you bundle lower-value items?','How do bundles work?','Do I approve bundle pricing?','Que se passe-t-il pour les articles de faible valeur ?']::text[],
    'Individual items normally need an approved resale value of at least $20. When suitable, lower-value eligible items may be combined into a bundle instead of being listed individually. A seller may be asked to review and approve bundle pricing; once approved, the bundle commission percentage is locked from the approved bundle price.',
    'selling.item_acceptance',
    array['bundle','lower value','under $20','bundle pricing','bundle approval','commission lock']::text[]
  )
)
insert into public.knowledge_base(
  title,
  question_examples,
  approved_answer,
  category_code,
  tags,
  status,
  source_kind,
  source_ref,
  approved_at
)
select
  e.title,
  e.question_examples,
  e.approved_answer,
  e.category_code,
  e.tags,
  'approved',
  'admin',
  'site-functionality-training-v1',
  now()
from entries e
where not exists (
  select 1
  from public.knowledge_base kb
  where kb.title = e.title
    and kb.source_ref = 'site-functionality-training-v1'
);

with rules(rule_name, instruction, priority) as (
  values
  (
    'Explain only live customer functions',
    'When explaining how to use Rewear, describe only customer-facing functions that are currently live or explicitly documented in approved knowledge. Do not invent buttons, routes, checkout behavior, payout behavior or other capabilities that are not approved.',
    850
  ),
  (
    'Be explicit about disabled account actions',
    'If an approved knowledge entry says a customer action is currently disabled or not connected, clearly say that it is not active yet. Do not present a disabled Shop with balance, payout setup, return, refund or other financial control as available.',
    875
  ),
  (
    'Guide customers to their account for seller details',
    'For seller-specific guidance, direct customers to the signed-in Customer Account for their own items, requests, balance and commission guide. Never ask for or use another customer identifier to access private data.',
    700
  )
)
insert into public.ai_behavior_rules(
  rule_name,
  instruction,
  priority,
  status,
  approved_at
)
select
  r.rule_name,
  r.instruction,
  r.priority,
  'approved',
  now()
from rules r
where not exists (
  select 1 from public.ai_behavior_rules existing where existing.rule_name = r.rule_name
);
