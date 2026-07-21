import { createFileRoute, Link } from "@tanstack/react-router";
import { LegalDoc, LH, LP, LUl } from "@/components/LegalDoc";

export const Route = createFileRoute("/privacy")({
  head: () => ({ meta: [{ title: "Privacy Policy — Courtship" }] }),
  component: PrivacyPage,
});

/** Canonical privacy policy, v1.0 (2026-07-20). Content mirrors
 *  legal/privacy-policy.md in the project folder — update both together and
 *  bump TERMS_VERSION in src/lib/legal.ts when the meaning changes. */
function PrivacyPage() {
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
