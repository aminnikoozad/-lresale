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
    <Dashboard
      name="Demo Customer"
      username="demo_customer"
      customerCode="RW-DEMO000000000001"
      message={null}
      messageType="success"
      balance="$62.00"
      totalEarned="$124.50"
      items={[
        {id:"demo-1",name:"Levi’s 501 jeans",status:"Listed",initialPrice:"$60.00",currentPrice:"$48.00",sellerRate:"45%",platformRate:"55%",estimatedEarnings:"$21.60",finalEarnings:"—",requiresApproval:false},
        {id:"demo-2",name:"Aritzia wool coat",status:"Pricing approval required",initialPrice:"$150.00",currentPrice:"$150.00",sellerRate:"50%",platformRate:"50%",estimatedEarnings:"$75.00",finalEarnings:"—",requiresApproval:false},
      ]}
      requests={[]}
      serviceAreas={[
        {id:"11111111-1111-4111-8111-111111111111",city:"Montréal",pickupMode:"free"},
      ]}
      pickupSlots={[
        {
          id:"22222222-2222-4222-8222-222222222222",
          serviceAreaId:"11111111-1111-4111-8111-111111111111",
          label:`Tomorrow, 6:00 PM – 8:00 PM`,
          remaining:4,
        },
      ]}
    />
    <Link className="back-home" href="/"><ArrowLeft/> Back to marketplace</Link>
  </main>
}
