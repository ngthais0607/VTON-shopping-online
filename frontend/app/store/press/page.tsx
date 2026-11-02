import { ContentPage, ContentSection } from "../content-page";

export const metadata = { title: "Press | TrueLook" };

export default function Page() {
  return (
    <ContentPage eyebrow="Press" title="News from TrueLook." description="A space for brand announcements and press materials.">
      <ContentSection number="01" title="No materials published yet"><p>This demo has no press releases, media partners, or downloadable press kit. Materials will appear here when published.</p></ContentSection>
    </ContentPage>
  );
}
