import type { ReactNode } from "react";
import { AdminNotificationBridge } from "./admin-notification-bridge";
import "./admin-notification.css";

export default function AdminLayout({children}:{children:ReactNode}){
  return <>{children}<AdminNotificationBridge/></>;
}
