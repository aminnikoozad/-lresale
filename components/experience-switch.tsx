"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AssistantMark } from "./assistant-mark";
export function ExperienceSwitch() {
  const path = usePathname();
  if (
    path === "/" ||
    path === "/assistant" ||
    path.startsWith("/admin") ||
    path.startsWith("/secure-admin")
  )
    return null;
  return (
    <Link className="experience-switch" href="/assistant">
      <AssistantMark />
      <span>Ask REWEAR · Parler à REWEAR</span>
    </Link>
  );
}
