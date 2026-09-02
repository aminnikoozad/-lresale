import Link from "next/link";
import { ArrowLeft, BadgeCheck } from "lucide-react";
import { requireChatGPTUser, chatGPTSignOutPath } from "../chatgpt-auth";
import { Dashboard } from "./dashboard";
import "./account.css";
export const dynamic = "force-dynamic";
export default async function AccountPage(){const user=await requireChatGPTUser("/account");return <main className="account-shell"><header className="account-top"><Link href="/" className="brand">REWEAR<span>.</span></Link><div className="account-user"><span><BadgeCheck/> Verified</span><b>{user.displayName}</b><a href={chatGPTSignOutPath("/")} target="_top">Sign out</a></div></header><Dashboard name={user.fullName?.split(" ")[0]??"there"}/><Link className="back-home" href="/"><ArrowLeft/> Back to marketplace</Link></main>}
