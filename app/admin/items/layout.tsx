import { RejectionEvidenceFields } from "@/components/rejection-evidence-fields";
import "./rejection-evidence.css";

export default function AdminItemsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}<RejectionEvidenceFields /></>;
}
