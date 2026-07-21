import { createFileRoute, Link } from "@tanstack/react-router";
import { LegalDoc, LH, LP, LUl } from "@/components/LegalDoc";

export const Route = createFileRoute("/terms")({
  head: () => ({ meta: [{ title: "Terms of Service — Courtship" }] }),
  component: TermsPage,
});

/** Canonical terms, v1.0 (2026-07-20). Mirrors legal/terms-of-service.md in
 *  the project folder — update both together and bump TERMS_VERSION in
 *  src/lib/legal.ts when the meaning changes. */
function TermsPage() {
  return (
    <LegalDoc title="Terms of Service" updated="Version 1.0 — effective 20 July 2026">
      <LP>
        These terms are an agreement between you and <b>Oksana Chopak, Sweden</b> ("Courtship", "we"),
        the operator of the Courtship app at court-ship.com. Contact: <b>oksana.chopak@gmail.com</b>. By
        creating an account you accept these terms and confirm you have read the{" "}
        <Link to="/privacy" className="underline font-bold">Privacy Policy</Link>.
      </LP>

      <LH>1. What Courtship is</LH>
      <LP>
        Courtship helps you find tennis and padel partners, plan games, join events, and find a
        last-minute replacement when a partner bails (SOS). The service is in <b>beta</b>: features may
        change, and access is by invite. <b>SOS is not an emergency service</b> — for real emergencies
        call 112 (EU) / 911 (US).
      </LP>

      <LH>2. Who can use it</LH>
      <LP>
        You must be <b>18 or older</b> and use your real identity (real name, your own phone number,
        photos of you). One account per person. We may decline, suspend or revoke access to protect the
        community (see §5).
      </LP>

      <LH>3. Your commitments</LH>
      <LUl items={[
        <>Show up to games you commit to, or cancel in good time. Repeated no-shows can be flagged on your profile ("ghost" flag).</>,
        <>Meet people sensibly: public courts, tell someone where you're going, trust your instincts. You play and meet others at your own responsibility — sport carries a normal risk of injury.</>,
        <>Be respectful. No harassment, discrimination, threats, or unwanted romantic/sexual advances — Courtship is for finding sports partners.</>,
        <>Only upload content you have the right to use. No illegal, deceptive or infringing content; no spam or scraping.</>,
        <>Keep your login secure — you're responsible for activity on your account.</>,
      ]} />
      <LP>
        You keep ownership of what you post and give us a non-exclusive licence to host and display it
        within the service so the app can work.
      </LP>

      <LH>4. Reporting problems (notice &amp; action)</LH>
      <LP>
        Anyone can report a profile or content they believe is illegal or against these terms — use the
        <b> Report</b> button on a profile, or email oksana.chopak@gmail.com with a link and why. We review
        reports promptly and act proportionately: removing content, warning, restricting, flagging,
        suspending or banning. If we moderate you, we'll tell you what we did and why (unless the law
        prevents it), and you can object by replying within 6 months — a human reviews it. EU users can
        also turn to their national Digital Services Coordinator (in Sweden: PTS) or a certified
        out-of-court dispute body.
      </LP>

      <LH>5. Moderation and leaving</LH>
      <LP>
        We may remove content or restrict accounts that break these terms, the law, or put members at
        risk — proportionately and with an explanation (§4). You can delete your account any time in
        <b> Settings → Privacy &amp; data</b>; it permanently removes your data as described in the Privacy
        Policy.
      </LP>

      <LH>6. Membership and payments</LH>
      <LUl items={[
        <>Core features are free. Optional paid tiers (Member, Founding, Pro) and paid events exist.</>,
        <>Prices are shown in the app in SEK before you pay. Payment happens via Swish or a Stripe payment link; membership is activated manually, normally within 48 hours.</>,
        <>Monthly or yearly, as chosen. Swish payments do <b>not</b> auto-renew — your tier simply lapses unless you renew. If you pay through a Stripe subscription link, cancel any time via the receipt/portal link in Stripe's email, effective at the end of the paid period.</>,
        <><b>Right of withdrawal (ångerrätt):</b> as an EU/Swedish consumer you may withdraw within <b>14 days</b> of purchase, no reason needed — use the <Link to="/withdraw" className="underline font-bold">Withdraw a purchase</Link> function or email us. We refund in full within 14 days of your request, and the function confirms receipt on a durable medium (email).</>,
        <>Event fees go to the organiser shown on the event. Refunds for cancelled events follow the event description; the statutory withdrawal right applies where the law provides it (it does not apply to leisure activities on a fixed date, such as a clinic on a set day).</>,
      ]} />

      <LH>7. Liability</LH>
      <LP>
        Courtship is a matching tool between independent players. We don't vet members beyond the invite
        system, don't organise your games, and aren't a party to what happens on court or in chats outside
        the app (e.g. WhatsApp). We're liable where Swedish law says we are — including for gross
        negligence and intent — but not for indirect losses caused by other members' behaviour, court
        availability, or reasonable interruptions of a beta service. Nothing here limits your mandatory
        consumer rights.
      </LP>

      <LH>8. Changes</LH>
      <LP>
        We may update these terms. For material changes we'll notify you in the app or by email at least
        14 days before they take effect; continuing to use Courtship after that means you accept the new
        version. If you don't — deleting your account is always free.
      </LP>

      <LH>9. Law and disputes</LH>
      <LP>
        Swedish law applies, without limiting mandatory consumer protections where you live. Talk to us
        first: oksana.chopak@gmail.com. Swedish consumers can turn to the National Board for Consumer
        Disputes (ARN, arn.se, Box 174, 101 23 Stockholm) — we participate in ARN proceedings. You can
        also use your local EU consumer ADR body or the courts.
      </LP>

      <LP>
        <i>
          Provider information (e-handelslagen / DSA contact point): Courtship is operated by Oksana
          Chopak, Sweden. Single point of contact for users and authorities: oksana.chopak@gmail.com
          (English, Swedish or Ukrainian). Business registration details will be added upon registration.
        </i>
      </LP>
    </LegalDoc>
  );
}
