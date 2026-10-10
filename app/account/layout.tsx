import { WorkspaceNavigation } from "@/components/workspace-navigation";
import { accountNavigation } from "@/lib/workspace-navigation";
import "./batch-tracking.css";
import "./launch-offer.css";

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return <><WorkspaceNavigation title="Account" links={accountNavigation} />{children}</>;
}
