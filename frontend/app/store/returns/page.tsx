import Link from "next/link";
import { ContentPage, ContentSection } from "../content-page";

export const metadata = { title: "Returns & cancellations | TrueLook" };

export default function Page() {
  return (
    <ContentPage eyebrow="Returns & cancellations" title="Returns & cancellations." description="Check your order status before making changes. Available actions appear in your order history.">
      <ContentSection number="01" title="When can I cancel an order?"><p>You can cancel a VietQR order awaiting payment or a confirmed COD order before shipping. Open <Link href="/store/orders">My orders</Link> and choose “Cancel Order” when the button is available.</p></ContentSection>
      <ContentSection number="02" title="After cancellation"><p>Confirm your cancellation request and wait for the page to update. If it fails, check the error message and reload the order status.</p></ContentSection>
      <ContentSection number="03" title="Returns in the demo"><p>This demo has no connected returns or refund process. No return address or refund timeline is published.</p><p>Speak with the demo presenter if you need to simulate a return.</p></ContentSection>
    </ContentPage>
  );
}
