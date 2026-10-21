export type SellerRulesDocument={version:number;value:{id:string;reviewOnly:boolean;commercialApproved:boolean;title:{en:string;fr:string};rules:Array<{id:string;en:string;fr:string}>}};
export type SellerRulesStatus={document:SellerRulesDocument|null;accepted:boolean;acceptedAt:string|null};
export type SellerProfile={id:string;name:string;city:string;bio:string;businessType:'individual'|'business';vacation:boolean;version:number};
export type StoreItem={id:string;name:string;brand:string|null;category:string;size:string|null;item_condition:string|null;price:number;version:number;photos:string[]};
export type SellerStore=Omit<SellerProfile,'version'>&{followed:boolean;items:StoreItem[]};
export type TradeOffer={id:string;amount:number;lines:Array<{id:string;name:string;version:number;price:number}>;parent:string|null;mine:boolean;status:string;expires:string;created:string};
export type TradeWorkspace={self:string;shops:Array<{id:string;name:string;city:string}>;profile:SellerProfile|null;following:Array<{id:string;name:string}>;threads:Array<{id:string;item_id:string;item_name:string;is_buyer:boolean;seller_name:string|null;updated_at:string;unread:number}>;thread:{id:string;item:string;isBuyer:boolean;blocked:boolean;blockedByMe:boolean;peerReadAt:string|null;store:string|null}|null;messages:Array<{id:string;kind:string;body:string;mine:boolean;created_at:string}>;offers:TradeOffer[];notifications:Array<{id:string;event_type:string;thread_id:string|null;read_at:string|null;created_at:string}>;reviews:Array<{id:string;name:string;version:number;currentVersion:number;status:string;reason:string|null}>};
// Static RPC definitions are shared by both server adapters. No arbitrary SQL/RPC
// name or parameter name comes from a request.
export const communityRpcDefinitions={
 marketplace_policy_document:[],
 my_marketplace_drafts:[],
 marketplace_seller_terms_status:[],
 marketplace_accept_seller_terms:[['p_version','integer'],['p_locale','text'],['p_accept','boolean']],
 save_marketplace_seller:[['p_name','text'],['p_city','text'],['p_bio','text'],['p_business','text'],['p_vacation','boolean'],['p_version','integer']],
 marketplace_workspace:[['p_thread','uuid'],['p_before','timestamptz']],
 marketplace_store:[['p_seller','uuid'],['p_page','integer']],
 marketplace_follow:[['p_seller','uuid'],['p_follow','boolean']],
 marketplace_start_thread:[['p_item','uuid']],
 marketplace_send_message:[['p_thread','uuid'],['p_body','text'],['p_request','uuid']],
 marketplace_block:[['p_thread','uuid'],['p_block','boolean']],
 marketplace_read_thread:[['p_thread','uuid']],
 marketplace_make_offer:[['p_thread','uuid'],['p_items','uuid[]'],['p_amount','integer'],['p_parent','uuid'],['p_request','uuid']],
 marketplace_respond_offer:[['p_offer','uuid'],['p_accept','boolean']],
 marketplace_report:[['p_item','uuid'],['p_message','uuid'],['p_reason','text'],['p_request','uuid']],
 marketplace_submit_listing:[['p_item','uuid'],['p_version','integer'],['p_policy_version','integer'],['p_locale','text'],['p_accept','boolean']],
 marketplace_save_editor:[['p_request','uuid'],['p_item','uuid'],['p_version','integer'],['p_fields','jsonb']],
 marketplace_request_review:[['p_item','uuid'],['p_version','integer']],
} as const;
export type CommunityRpc=keyof typeof communityRpcDefinitions;
