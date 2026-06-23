import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";

type Ann = { id: string; body: string; link: string | null };
const DISMISS_KEY = "courtship.ann.dismissed";

// Shown on the board: the latest active founder announcement, dismissible per-id
// (a new announcement re-appears even after dismissing the previous one).
export function AnnouncementBanner() {
  const { t } = useI18n();
  const [ann, setAnn] = useState<Ann | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await (supabase as any)
        .from("announcements")
        .select("id,body,link")
        .eq("active", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cancelled || !data) return;
      let dismissed = "";
      try { dismissed = localStorage.getItem(DISMISS_KEY) || ""; } catch { /* ignore */ }
      if ((data as Ann).id !== dismissed) setAnn(data as Ann);
    })();
    return () => { cancelled = true; };
  }, []);

  if (!ann) return null;
  const dismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, ann.id); } catch { /* ignore */ }
    setAnn(null);
  };
  const isInternal = ann.link?.startsWith("/");

  return (
    <div className="ccard p-4 relative" style={{ background: "var(--green-pop)", borderColor: "var(--ink)" }}>
      <button onClick={dismiss} aria-label={t("install.dismiss")} className="absolute top-2 right-3 text-lg opacity-50">✕</button>
      <div className="csection-label">📣 {t("ann.tag")}</div>
      <div className="font-extrabold text-lg mt-1 pr-6 whitespace-pre-line">{ann.body}</div>
      {ann.link && (
        <a
          href={ann.link}
          target={isInternal ? undefined : "_blank"}
          rel={isInternal ? undefined : "noopener noreferrer"}
          className="cbtn cbtn-coral mt-3 inline-flex"
        >
          {t("ann.cta")}
        </a>
      )}
    </div>
  );
}

// Admin-only: post / clear the broadcast.
export function AnnouncementAdmin() {
  const { t } = useI18n();
  const [body, setBody] = useState("");
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);

  async function post() {
    if (!body.trim()) return;
    setBusy(true);
    const { error } = await (supabase as any).rpc("post_announcement", { _body: body, _link: link });
    setBusy(false);
    if (error) { toast.error(error.message ?? "Error"); return; }
    toast.success(t("ann.posted"));
    setBody(""); setLink("");
  }
  async function clear() {
    setBusy(true);
    const { error } = await (supabase as any).rpc("clear_announcements");
    setBusy(false);
    if (error) { toast.error(error.message ?? "Error"); return; }
    toast.success(t("ann.cleared"));
  }

  return (
    <div className="ccard p-4 space-y-2">
      <div className="csection-label">📣 {t("ann.admin_title")}</div>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={t("ann.placeholder")}
        className="cinput w-full min-h-20"
        rows={2}
      />
      <input
        value={link}
        onChange={(e) => setLink(e.target.value)}
        placeholder={t("ann.link_placeholder")}
        className="cinput w-full"
      />
      <div className="flex gap-2">
        <button onClick={post} disabled={busy || !body.trim()} className="cbtn cbtn-coral flex-1">{t("ann.post")}</button>
        <button onClick={clear} disabled={busy} className="cbtn cbtn-ghost">{t("ann.clear")}</button>
      </div>
    </div>
  );
}
