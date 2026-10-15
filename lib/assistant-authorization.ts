import type { AssistantOperation } from "./assistant-contract";
export type OwnershipRequirement = {
  table: "items" | "collection_requests" | "orders";
  id: string;
  ownerColumn: "owner_id" | "user_id" | "buyer_id";
  ownerId: string;
};
/** Enforce customer ownership even if the signed-in person also has a staff role. */
export async function authorizeAssistantOperation(
  op: AssistantOperation,
  userId: string,
  owns: (requirement: OwnershipRequirement) => Promise<boolean>,
): Promise<boolean> {
  if (!userId) return false;
  const f = op.fields;
  switch (op.name) {
    case "unsold_preference":
      return (
        !!f.item_id &&
        owns({
          table: "items",
          id: f.item_id,
          ownerColumn: "owner_id",
          ownerId: userId,
        })
      );
    case "confirm_pickup":
    case "cancel_pickup":
      return (
        !!f.request_id &&
        owns({
          table: "collection_requests",
          id: f.request_id,
          ownerColumn: "user_id",
          ownerId: userId,
        })
      );
    case "cancel_checkout":
    case "request_return":
      return (
        !!f.order_id &&
        owns({
          table: "orders",
          id: f.order_id,
          ownerColumn: "buyer_id",
          ownerId: userId,
        })
      );
    case "checkout":
    case "favorite":
    case "unfavorite":
    case "change_username":
    case "mark_alerts_read":
      return true;
    default:
      return false;
  }
}
