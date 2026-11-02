import Link from "next/link";
import { ContentPage, ContentSection } from "../content-page";

export const metadata = { title: "Terms of use | TrueLook" };

export default function Page() {
  return (
    <ContentPage eyebrow="Terms of use" title="Before you begin." description="TrueLook demonstrates a shopping flow. The notes below explain the available features.">
      <ContentSection number="01" title="Demo scope"><p>The collection, accounts, and orders demonstrate the app. Product fulfillment, delivery times, and live customer support are not provided.</p></ContentSection>
      <ContentSection number="02" title="Check your order details"><p>Check the product, variant, quantity, and total before confirming. Prices and stock may be checked again when your order is created.</p></ContentSection>
      <ContentSection number="03" title="Payment & status"><p>COD and VietQR have separate processing statuses. Check your order details for the current status; an order confirmation does not confirm payment.</p><p>View <Link href="/store/returns">cancellation information</Link> or <Link href="/store/help">shopping guide</Link> when needed.</p></ContentSection>
    </ContentPage>
  );
}
