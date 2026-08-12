import { createFileRoute, Link } from "@tanstack/react-router";
import { LegalDoc, LH, LP, LUl } from "@/components/LegalDoc";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/privacy")({
  head: () => ({ meta: [{ title: "Privacy Policy — Courtship" }] }),
  component: PrivacyPage,
});

/** Canonical privacy policy, v1.0 (2026-07-20). Content mirrors
 *  legal/privacy-policy.md in the project folder — update both together and
 *  bump TERMS_VERSION in src/lib/legal.ts when the meaning changes.
 *  SV rendering added 2026-08-12 (audit P1-11): a Swedish consumer ticking the
 *  consent box must be able to read what they agree to. The English text stays
 *  canonical — the SV doc says so explicitly. */
function PrivacyPage() {
  const { lang } = useI18n();
  return lang === "sv" ? <PrivacySv /> : <PrivacyEn />;
}

function PrivacyEn() {
  return (
    <LegalDoc title="Privacy Policy" updated="Version 1.0 — effective 20 July 2026">
      <LP>
        Courtship is a community app for finding tennis and padel partners, planning games and getting a
        last-minute replacement when a partner bails (SOS). This policy explains what personal data we
        process, why, and what rights you have.
      </LP>
      <LP>
        <b>Data controller:</b> Oksana Chopak, Sweden (sole operator of Courtship). <b>Contact:</b>{" "}
        oksana.chopak@gmail.com. <b>Supervisory authority:</b> Integritetsskyddsmyndigheten (IMY), imy.se.
        Courtship is for adults — you must be <b>18 or older</b>.
      </LP>

      <LH>1. What we collect</LH>
      <LUl items={[
        <><b>Account:</b> email address and password (stored as a hash). Sign-up needs an invite code; we record which code you used and who invited you.</>,
        <><b>Profile:</b> first and last name, phone number (for WhatsApp contact — required, never shown publicly), photos, skill level, formats, play times, vibe, what you're looking for, bio, favourite shot, sports, experience, goals, home courts and city, and your visibility/notification preferences.</>,
        <><b>Activity:</b> games (including scores), SOS requests and applications, likes/passes in the match deck, buddies, kudos, event sign-ups, coach requests, referral and rescue stats, no-show flags.</>,
        <><b>Notifications:</b> your push subscription (if you enable push) and logs of notifications/emails we sent.</>,
        <><b>Payments:</b> made outside the app via Swish or Stripe links. We never see card or bank details — we only record your membership tier and dates.</>,
      ]} />
      <LP>We do <b>not</b> collect your date of birth, precise location, or any special-category data.</LP>

      <LH>2. Why (legal bases, GDPR art. 6)</LH>
      <LUl items={[
        <>Running the service — account, matching, games, SOS, events: <b>contract</b> (6(1)(b)).</>,
        <>Showing your profile to signed-in members: <b>contract</b> (6(1)(b)).</>,
        <>Limited public preview for visitors (see §3): <b>legitimate interest</b> (6(1)(f)) — you can switch it off any time in Settings.</>,
        <>Push notifications: <b>consent</b> (6(1)(a)) — withdraw any time in Settings.</>,
        <>Service and community emails: <b>legitimate interest</b> — opt out in Settings or via the unsubscribe link in any email.</>,
        <>Safety features (no-show flags, moderation of reports): <b>legitimate interest</b> in a reliable, safe community.</>,
        <>Membership admin: <b>contract</b>; accounting records: <b>legal obligation</b> (6(1)(c)).</>,
      ]} />

      <LH>3. Who sees what</LH>
      <LUl items={[
        <><b>Signed-in members</b> see your directory profile: name, photos, level, vibe, play info, bio, city, stats. Your <b>phone number</b> is only revealed to yourself, a confirmed buddy, or someone sharing a confirmed game with you.</>,
        <><b>Visitors (not signed in)</b> see a limited public preview: active games (court, time, host's first name and photo) and sample player cards (first name, photo, level, vibe, city, stats). Turn this off in <b>Settings → Privacy &amp; data</b>.</>,
        <><b>The operator</b> can see member details including contacts, to run the service, verify payments and handle reports.</>,
      ]} />
      <LP>We never sell your data. There is no advertising in the app.</LP>

      <LH>4. Processors and transfers</LH>
      <LUl items={[
        <>Lovable (Lovable Labs AB, Sweden) — hosting via Lovable Cloud, built on Supabase: database, authentication, storage, functions. EU region.</>,
        <>Resend, Inc. (USA) — email delivery, under EU Standard Contractual Clauses.</>,
        <>Your browser's push service (Google, Mozilla or Apple) — delivers push notifications you opted into.</>,
        <>Swish / Stripe — payments happen on their side, under their terms.</>,
      ]} />
      <LP>
        WhatsApp contact happens through links you tap — that conversation is between you and the other
        player under WhatsApp's terms. "Add to calendar" only creates an event in your own calendar.
      </LP>

      <LH>5. Retention</LH>
      <LUl items={[
        <>Account, profile and activity: until you delete your account.</>,
        <>Notification and email logs: 12 months.</>,
        <>Unsubscribe list: kept, so your opt-out is honoured.</>,
        <>Deleting your account (Settings → Privacy &amp; data) permanently removes your profile, photos, games, matches, likes, buddies and subscriptions. Minimal records may be kept where the law requires (e.g. accounting).</>,
      ]} />

      <LH>6. Your rights</LH>
      <LP>
        You can access and export your data (<b>Download my data</b> in Settings), correct it (edit your
        profile), delete it (Settings, or email us), object to legitimate-interest processing (e.g. switch
        off the public preview or emails), restrict processing, and take your data elsewhere. Anything you
        can't do in the app: oksana.chopak@gmail.com — we answer within a month. You can complain to IMY
        (imy.se) or your local EU data protection authority.
      </LP>

      <LH>7. Cookies &amp; local storage</LH>
      <LP>
        No advertising or analytics trackers, no third-party cookies. We only store what the app needs to
        work: your login session, language choice and small UI states (dismissed banners, a draft game).
        That's why there is no cookie banner — nothing here tracks you.
      </LP>

      <LH>8. Security</LH>
      <LP>
        Row-level security on every table, server-side authorisation for sensitive operations, TLS
        everywhere, private photo storage with expiring signed links, least-privilege admin access. If a
        breach ever puts your rights at risk, we'll notify IMY within 72 hours and affected users without
        undue delay.
      </LP>

      <LH>9. Children</LH>
      <LP>
        Courtship is not for anyone under 18 and we don't knowingly process children's data. If you think a
        minor is using the app, tell us and we'll remove the account.
      </LP>

      <LH>10. Changes</LH>
      <LP>
        Changes appear here with a new version and date; for significant changes we'll notify you in the
        app or by email first. See also our <Link to="/terms" className="underline font-bold">Terms of Service</Link>.
      </LP>
    </LegalDoc>
  );
}

function PrivacySv() {
  return (
    <LegalDoc title="Integritetspolicy" updated="Version 1.0 — gäller från 20 juli 2026">
      <LP>
        Courtship är en community-app för att hitta tennis- och padelpartners, planera matcher och få en
        ersättare i sista minuten när en partner hoppar av (SOS). Den här policyn förklarar vilka
        personuppgifter vi behandlar, varför, och vilka rättigheter du har.
      </LP>
      <LP>
        <b>Personuppgiftsansvarig:</b> Oksana Chopak, Sverige (ensam operatör av Courtship).{" "}
        <b>Kontakt:</b> oksana.chopak@gmail.com. <b>Tillsynsmyndighet:</b> Integritetsskyddsmyndigheten
        (IMY), imy.se. Courtship är för vuxna — du måste vara <b>18 år eller äldre</b>.
      </LP>
      <LP>
        <i>Detta är en översättning. Vid avvikelser gäller den engelska versionen.</i>
      </LP>

      <LH>1. Vad vi samlar in</LH>
      <LUl items={[
        <><b>Konto:</b> e-postadress och lösenord (lagras som hash). Registrering kan ske med inbjudningskod; vi registrerar vilken kod du använde och vem som bjöd in dig.</>,
        <><b>Profil:</b> för- och efternamn, telefonnummer (för WhatsApp-kontakt — obligatoriskt, visas aldrig offentligt), foton, nivå, spelformer, speltider, vibe, vad du söker, bio, favoritslag, sporter, erfarenhet, mål, hemmabanor och stad, samt dina synlighets- och notisinställningar.</>,
        <><b>Aktivitet:</b> matcher (inklusive resultat), SOS-rop och ansökningar, likes/pass i matchleken, buddies, kudos, eventanmälningar, tränarförfrågningar, värvnings- och räddningsstatistik, no-show-flaggor.</>,
        <><b>Notiser:</b> din push-prenumeration (om du aktiverar push) och loggar över notiser/mejl vi skickat.</>,
        <><b>Betalningar:</b> sker utanför appen via Swish- eller Stripe-länkar. Vi ser aldrig kort- eller bankuppgifter — vi registrerar bara din medlemsnivå och datum.</>,
      ]} />
      <LP>Vi samlar <b>inte</b> in födelsedatum, exakt plats eller några känsliga uppgifter.</LP>

      <LH>2. Varför (rättsliga grunder, GDPR art. 6)</LH>
      <LUl items={[
        <>Att driva tjänsten — konto, matchning, matcher, SOS, event: <b>avtal</b> (6(1)(b)).</>,
        <>Att visa din profil för inloggade medlemmar: <b>avtal</b> (6(1)(b)).</>,
        <>Begränsad offentlig förhandsvisning för besökare (se §3): <b>berättigat intresse</b> (6(1)(f)) — du kan stänga av den när som helst i Inställningar.</>,
        <>Push-notiser: <b>samtycke</b> (6(1)(a)) — återkalla när som helst i Inställningar.</>,
        <>Tjänste- och communitymejl: <b>berättigat intresse</b> — avregistrera dig i Inställningar eller via avregistreringslänken i varje mejl.</>,
        <>Säkerhetsfunktioner (no-show-flaggor, hantering av anmälningar): <b>berättigat intresse</b> av en pålitlig och trygg community.</>,
        <>Medlemskapsadministration: <b>avtal</b>; bokföringsunderlag: <b>rättslig förpliktelse</b> (6(1)(c)).</>,
      ]} />

      <LH>3. Vem ser vad</LH>
      <LUl items={[
        <><b>Inloggade medlemmar</b> ser din katalogprofil: namn, foton, nivå, vibe, spelinfo, bio, stad, statistik. Ditt <b>telefonnummer</b> visas bara för dig själv, en bekräftad buddy eller någon du delar en bekräftad match med.</>,
        <><b>Besökare (ej inloggade)</b> ser en begränsad offentlig förhandsvisning: aktiva matcher (bana, tid, värdens förnamn och foto) och exempel på spelarkort (förnamn, foto, nivå, vibe, stad, statistik). Stäng av detta i <b>Inställningar → Integritet &amp; data</b>.</>,
        <><b>Operatören</b> kan se medlemsuppgifter inklusive kontaktuppgifter, för att driva tjänsten, verifiera betalningar och hantera anmälningar.</>,
      ]} />
      <LP>Vi säljer aldrig dina uppgifter. Det finns ingen reklam i appen.</LP>

      <LH>4. Personuppgiftsbiträden och överföringar</LH>
      <LUl items={[
        <>Lovable (Lovable Labs AB, Sverige) — hosting via Lovable Cloud, byggt på Supabase: databas, autentisering, lagring, funktioner. EU-region.</>,
        <>Resend, Inc. (USA) — mejlleverans, under EU:s standardavtalsklausuler.</>,
        <>Din webbläsares push-tjänst (Google, Mozilla eller Apple) — levererar push-notiser du valt att få.</>,
        <>Swish / Stripe — betalningar sker hos dem, enligt deras villkor.</>,
      ]} />
      <LP>
        WhatsApp-kontakt sker via länkar du själv trycker på — den konversationen är mellan dig och den
        andra spelaren enligt WhatsApps villkor. "Lägg till i kalender" skapar bara en händelse i din egen
        kalender.
      </LP>

      <LH>5. Lagringstider</LH>
      <LUl items={[
        <>Konto, profil och aktivitet: tills du raderar ditt konto.</>,
        <>Notis- och mejlloggar: 12 månader.</>,
        <>Avregistreringslista: behålls, så att ditt nej respekteras.</>,
        <>Att radera kontot (Inställningar → Integritet &amp; data) tar permanent bort din profil, foton, matcher, likes, buddies och prenumerationer. Minimala uppgifter kan behållas där lagen kräver det (t.ex. bokföring).</>,
      ]} />

      <LH>6. Dina rättigheter</LH>
      <LP>
        Du kan få tillgång till och exportera dina uppgifter (<b>Ladda ner min data</b> i Inställningar),
        rätta dem (redigera din profil), radera dem (Inställningar, eller mejla oss), invända mot
        behandling som bygger på berättigat intresse (t.ex. stänga av den offentliga förhandsvisningen
        eller mejlen), begränsa behandlingen och flytta dina uppgifter. Allt du inte kan göra i appen:
        oksana.chopak@gmail.com — vi svarar inom en månad. Du kan klaga hos IMY (imy.se) eller din lokala
        dataskyddsmyndighet i EU.
      </LP>

      <LH>7. Cookies &amp; lokal lagring</LH>
      <LP>
        Inga reklam- eller analystrackers, inga tredjepartscookies. Vi lagrar bara det appen behöver för
        att fungera: din inloggningssession, språkval och små UI-tillstånd (stängda banners, ett utkast
        till match). Därför finns ingen cookie-banner — inget här spårar dig.
      </LP>

      <LH>8. Säkerhet</LH>
      <LP>
        Radnivåsäkerhet på varje tabell, serverside-behörighet för känsliga operationer, TLS överallt,
        privat fotolagring med tidsbegränsade signerade länkar, minsta möjliga admin-åtkomst. Om ett
        intrång någonsin riskerar dina rättigheter meddelar vi IMY inom 72 timmar och berörda användare
        utan onödigt dröjsmål.
      </LP>

      <LH>9. Barn</LH>
      <LP>
        Courtship är inte för någon under 18 år och vi behandlar inte medvetet barns uppgifter. Om du tror
        att en minderårig använder appen, säg till oss så tar vi bort kontot.
      </LP>

      <LH>10. Ändringar</LH>
      <LP>
        Ändringar publiceras här med ny version och datum; vid väsentliga ändringar meddelar vi dig först i
        appen eller via mejl. Se även våra{" "}
        <Link to="/terms" className="underline font-bold">Användarvillkor</Link>.
      </LP>
    </LegalDoc>
  );
}
