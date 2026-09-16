import type { ReactNode } from "react";
import { AdminNotificationBridge } from "./admin-notification-bridge";
import { AdminTools } from "./admin-tools";
import "./admin-notification.css";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <><AdminTools />{children}<AdminNotificationBridge /></>;
}
