import Link from "next/link";
import { ContentPage, ContentSection } from "../content-page";

export const metadata = { title: "Help | TrueLook" };

export default function Page() {
  return (
    <ContentPage eyebrow="Help" title="Shopping, made simple." description="How to explore products, place orders, and track transactions in the TrueLook demo.">
      <ContentSection number="01" title="Choose a product"><p>Explore the collection and choose an available size and color. Add an item to your bag or buy it from the product page.</p></ContentSection>
      <ContentSection number="02" title="Complete your details"><p>At checkout, enter the recipient name, phone number, and address. Check the variant, quantity, and total before placing your order.</p></ContentSection>
      <ContentSection number="03" title="Choose a payment method"><p>Choose cash on delivery (COD) or VietQR. An administrator verifies VietQR transfers before updating payment status; placing an order does not confirm payment.</p></ContentSection>
      <ContentSection number="04" title="Track your order"><p>Sign in and open <Link href="/store/orders">My orders</Link> to view status, open tracking links, or cancel eligible orders. See <Link href="/store/returns">returns and cancellation information</Link>.</p><p>Live support and gift cards are not connected in this demo.</p></ContentSection>
    </ContentPage>
  );
}
