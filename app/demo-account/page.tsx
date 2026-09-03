import Link from "next/link";
import { ArrowLeft, Eye } from "lucide-react";
import { Dashboard } from "../account/dashboard";
import "../account/account.css";

export default function DemoAccountPage(){
  return <main className="account-shell">
    <header className="account-top">
      <Link href="/" className="brand">REWEAR<span>.</span></Link>
      <div className="account-user"><span><Eye/> Demo preview</span><b>Sample customer</b></div>
    </header>
    <div style={{maxWidth:1180,margin:"24px auto 0",padding:"0 28px"}}>
      <div className="success-banner" style={{margin:0}}>
        <Eye/> This is a demonstration account. All balances, products and requests are sample data.
      </div>
    </div>
    <Dashboard name="Demo Customer"/>
    <Link className="back-home" href="/"><ArrowLeft/> Back to marketplace</Link>
  </main>
}
