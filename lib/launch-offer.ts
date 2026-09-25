import type { SupabaseClient } from "@supabase/supabase-js";

export const LAUNCH_SELLER_OFFER_KEY = "launch_first_100_sellers";

export type LaunchSellerOffer = {
  campaignKey: string;
  maxClaims: number;
  claimedCount: number;
  remaining: number;
  active: boolean;
  waivedServiceFeeCents: number;
};

const INACTIVE_OFFER: LaunchSellerOffer = {
  campaignKey: LAUNCH_SELLER_OFFER_KEY,
  maxClaims: 100,
  claimedCount: 100,
  remaining: 0,
  active: false,
  waivedServiceFeeCents: 1_200,
};

export async function loadLaunchSellerOffer(
  supabase: SupabaseClient,
): Promise<LaunchSellerOffer> {
  try {
    const { data, error } = await supabase
      .from("seller_promotion_state")
      .select("campaign_key,max_claims,claimed_count,active,waived_service_fee_cents")
      .eq("campaign_key", LAUNCH_SELLER_OFFER_KEY)
      .maybeSingle();

    if (error || !data) return INACTIVE_OFFER;

    const maxClaims = Number(data.max_claims);
    const claimedCount = Number(data.claimed_count);
    const waivedServiceFeeCents = Number(data.waived_service_fee_cents);
    if (
      !Number.isInteger(maxClaims) ||
      maxClaims < 1 ||
      !Number.isInteger(claimedCount) ||
      claimedCount < 0 ||
      claimedCount > maxClaims ||
      !Number.isInteger(waivedServiceFeeCents) ||
      waivedServiceFeeCents < 0
    ) {
      return INACTIVE_OFFER;
    }

    const remaining = Math.max(0, maxClaims - claimedCount);
    return {
      campaignKey: data.campaign_key,
      maxClaims,
      claimedCount,
      remaining,
      active: Boolean(data.active) && remaining > 0,
      waivedServiceFeeCents,
    };
  } catch {
    return INACTIVE_OFFER;
  }
}
