import Link from "next/link";
import { ContentPage, ContentSection } from "../content-page";

export const metadata = { title: "Privacy | TrueLook" };

export default function Page() {
  return (
    <ContentPage eyebrow="Privacy" title="Your data, your experience." description="Information about data used for accounts, bags, and orders in this demo.">
      <ContentSection number="01" title="Account & order information"><p>Information entered during registration, profile updates, and checkout is sent to the demo system. Order details include the recipient name, phone number, and delivery address.</p></ContentSection>
      <ContentSection number="02" title="How information is used"><p>The app uses information to display profiles, create orders, and track processing status. An administrator must verify VietQR payments before updating their status.</p></ContentSection>
      <ContentSection number="03" title="Browser data"><p>Your bag and saved items are stored in your browser. See <Link href="/store/cookie">cookies & storage</Link> for more about sign-in sessions and local data.</p><p>Contact the demo operator with questions about data in this environment.</p></ContentSection>
    </ContentPage>
  );
}
