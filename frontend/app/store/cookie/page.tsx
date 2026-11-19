import { ContentPage, ContentSection } from "../content-page";

export const metadata = { title: "Cookies & storage | TrueLook" };

export default function Page() {
  return (
    <ContentPage eyebrow="Cookies & storage" title="Keeping the essentials." description="How the app maintains your session and saves your choices in your browser.">
      <ContentSection number="01" title="Sign-in sessions"><p>Sign-in uses an HttpOnly refresh cookie. The access token stays in app memory.</p><p>Signing out revokes the current refresh session; an issued access token expires at its scheduled expiry time.</p></ContentSection>
      <ContentSection number="02" title="Bag & saved items"><p>Your bag and saved items use local browser storage. Saved items do not sync across accounts or devices.</p><p>Clearing site data in your browser may remove choices saved on that device.</p></ContentSection>
    </ContentPage>
  );
}
