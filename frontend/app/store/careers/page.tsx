import { ContentPage, ContentSection } from "../content-page";

export const metadata = { title: "Careers | TrueLook" };

export default function Page() {
  return (
    <ContentPage eyebrow="Careers" title="Create something new with us." description="Information about opportunities at TrueLook when officially announced.">
      <ContentSection number="01" title="No open roles"><p>This demo has no open roles or application process. No application form or recruitment contact is connected.</p></ContentSection>
    </ContentPage>
  );
}
