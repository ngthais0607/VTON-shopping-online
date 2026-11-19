import Link from "next/link";
import { ContentPage, ContentSection } from "../content-page";

export const metadata = { title: "Contact | TrueLook" };

export default function Page() {
  return (
    <ContentPage eyebrow="Contact" title="Need more information?" description="Find guidance for your TrueLook experience and help with using the demo.">
      <ContentSection number="01" title="Available guidance"><p>View <Link href="/store/help">shopping guide</Link> to learn how to choose products and place orders. Check your transaction status on the <Link href="/store/orders">orders page</Link>.</p></ContentSection>
      <ContentSection number="02" title="Help with the demo"><p>This store is a local demo environment. No support inbox, phone line, or messaging service is connected.</p><p>Contact the person presenting this demo if you need help with data or your account.</p></ContentSection>
    </ContentPage>
  );
}
