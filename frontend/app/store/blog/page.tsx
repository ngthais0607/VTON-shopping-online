import { ContentPage, ContentSection } from "../content-page";

export const metadata = { title: "Journal | TrueLook" };

export default function Page() {
  return (
    <ContentPage eyebrow="Journal" title="A space for style." description="Stories about clothing and personal style.">
      <ContentSection number="01" title="No articles yet"><p>TrueLook is currently a store demo. No articles have been published here yet. Explore the products available in the collection.</p></ContentSection>
    </ContentPage>
  );
}
