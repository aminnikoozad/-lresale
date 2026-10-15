"use client";
import { Localize } from "@/components/site-language";

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
  return <Localize>{(
    <Link className="experience-switch" href="/assistant" aria-label="Smart Shopping" title="Smart Shopping">
      <AssistantMark />
    </Link>
  )}</Localize>;
}
