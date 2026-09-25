import Link from "next/link";
import "./batch-tracking.css";
import "./launch-offer.css";

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <nav className="account-section-nav" aria-label="Account sections">
        <Link href="/account">Selling dashboard</Link>
        <Link href="/account/purchases">My Purchases & Saved</Link>
      </nav>
      {children}
    </>
  );
}
