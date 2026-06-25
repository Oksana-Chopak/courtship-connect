import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { LangToggle, useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Courtship — It's a match. Literally." },
      { name: "description", content: "Tennis partner matching for Uppsala & Stockholm. Invite-only beta." },
      { property: "og:title", content: "Courtship" },
      { property: "og:description", content: "Find your hitting partner in Uppsala & Stockholm." },
    ],
  }),
  component: Index,
});

function Index() {
  const { t } = useI18n();
  return (
    <div className="terry-bg min-h-screen flex flex-col items-center justify-center px-6 text-[var(--ink)] font-body">
      <div className="max-w-md w-full text-center space-y-8">
        <div className="flex justify-end"><LangToggle /></div>
        <div className="space-y-1.5">
          <div className="inline-block px-4 py-1 rounded-full border-2 border-[var(--ink)] bg-[var(--cream2)] text-xs font-extrabold tracking-widest uppercase">
            {t("brand.cities")}
          </div>
          <div className="text-xs font-extrabold tracking-widest uppercase text-[var(--ink)]/70">
            {t("brand.beta_tag")}
          </div>
        </div>
        <h1 className="font-display text-6xl leading-[0.95]">
          {t("index.match_a")}<br/>
          <span className="text-[var(--coral)]">{t("index.match_b")}</span>
        </h1>
        <p className="text-lg text-[var(--ink)] font-semibold">
          {t("brand.subtitle")}
        </p>
        <div className="flex flex-col gap-3 pt-2">
          <Link to="/auth" search={{ mode: "signup" }} className="cbtn cbtn-coral">
            {t("index.cta_invite")}
          </Link>
          <Link to="/auth" search={{ mode: "login" }} className="cbtn cbtn-ghost">
            {t("index.cta_have_account")}
          </Link>
        </div>
      </div>
    </div>
  );
}
