import type { ReactNode } from "react";
import { AdminNotificationBridge } from "./admin-notification-bridge";

export default function AdminLayout({children}:{children:ReactNode}){
  return <>{children}<AdminNotificationBridge/></>;
}
