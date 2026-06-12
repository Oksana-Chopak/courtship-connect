import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

export type Lang = "en" | "sv";

const STORAGE_KEY = "courtship.lang";

type Dict = Record<string, string>;

const en: Dict = {
  // Brand / shared
  "brand.tagline": "It's a match. Literally.",
  "brand.subtitle": "Find your tennis one-night stand.",
  "brand.uppsala_beta": "Uppsala · Invite-only beta",
  "lang.switch_label": "Language",

  // Index / landing
  "index.match_a": "It's a match.",
  "index.match_b": "Literally.",
  "index.cta_invite": "Get an invite 🎾",
  "index.cta_have_account": "I already have an account",

  // Auth
  "auth.signup_title": "Join the club",
  "auth.login_title": "Welcome back",
  "auth.signup_sub": "Invite-only beta. Got a code?",
  "auth.login_sub": "Time for a hit.",
  "auth.invite_label": "Invite code",
  "auth.email_label": "Email",
  "auth.password_label": "Password",
  "auth.create_account": "Create account 🎾",
  "auth.sign_in": "Sign in",
  "auth.have_account": "Already in?",
  "auth.no_account": "New here?",
  "auth.go_login": "Sign in",
  "auth.go_signup": "Get an invite",
  "auth.invite_bad": "That invite code doesn't work. Beta is invite-only.",
  "auth.signout": "Sign out",
  "auth.signed_out": "See you on court 👋",

  // Check email
  "ce.title": "Check your email",
  "ce.sent_to": "We sent it to",
  "ce.step1": "Open your email app",
  "ce.step2": "Find the email from Courtship",
  "ce.step3_a": "Tap the",
  "ce.step3_button": "Confirm my email",
  "ce.step3_b": "button inside it",
  "ce.resend": "Resend email",
  "ce.resend_cooldown": "Resend email ({s}s)",
  "ce.resend_sending": "Sending...",
  "ce.spam_hint": "Didn't get it? Check your spam folder.",
  "ce.wrong_address": "Wrong address?",
  "ce.start_over": "Start over",
  "ce.resent_ok": "Email sent again. Check your inbox 📩",

  // Nav
  "nav.home": "Home",
  "nav.rescue": "Rescue 🚨",
  "nav.players": "Players",
  "nav.me": "Me",

  // Home
  "home.lets_play": "Let's play 🎾",
  "home.save_my_set": "Save my set 🚨",
  "home.browse_players": "Browse players",
  "home.your_sos": "Your active calls",
  "home.no_active": "No active calls. Quiet day on court.",
  "home.pending_check": "Did the game happen? 🎾",
  "home.yes_played": "Yes ✅",
  "home.no_show": "No-show 🪦",

  // SOS new
  "sos.new_title": "Save my set 🚨",
  "sos.new_sub": "Tap fast. Rescuers are waiting.",
  "sos.when": "When",
  "sos.today": "Today",
  "sos.tomorrow": "Tomorrow",
  "sos.court": "Court",
  "sos.format": "Format",
  "sos.level_range": "Level range",
  "sos.anyone": "Anyone — I just want to play",
  "sos.court_status": "Court status",
  "sos.note_label": "Note (optional)",
  "sos.note_placeholder": "I'll bring balls 🎾",
  "sos.send": "Send flare 🚨",
  "sos.back": "← Back",

  // SOS detail
  "sos.broadcasting": "Broadcasting to {n} rescuers...",
  "sos.im_in": "I'm in! 🎾",
  "sos.matched": "It's a match. Literally.",
  "sos.cancel": "Cancel call",
  "sos.message_wa": "Message on WhatsApp 👋",

  // Rescue
  "rescue.title": "Rescue board",
  "rescue.empty_title": "All quiet on the courts.",
  "rescue.empty_sub": "Be the first to send a flare 🚨",
  "rescue.listening": "Listening...",

  // Players
  "players.title": "Players",
  "players.sub": "Pick your hitting partner.",
  "players.warming": "Warming up...",
  "players.empty": "Loosen the filters — your match is out there.",
  "players.message_wa": "Message on WhatsApp 👋",

  // Profile / wizard
  "me.title": "Your profile",
  "me.sub": "Tweak until it feels right.",
  "me.save": "Save changes",
  "me.updated": "Updated 🎾",
  "me.language": "Language",
  "wiz.save_see": "Save & see players",
  "wiz.next": "Next",
  "wiz.back": "Back",
  "wiz.name_label": "First name",
  "wiz.phone_label": "Phone number",
  "wiz.phone_help": "Players can reach you on WhatsApp. Your number is only shared when someone actually messages you — never shown in the app.",
  "onboarding.title": "Make your profile",
  "onboarding.sub": "Tell us how you like to play. We'll match the vibe.",
  "onboarding.welcome_in": "You're in. Game on.",

  // City + buddies
  "city.label": "City",
  "city.any": "Any city",
  "wiz.city_label": "Your home city",
  "wiz.buddy_sos_label": "SOS from my buddies",
  "wiz.buddy_sos_help": "Hear when a buddy needs you — even when rescuer mode is off.",
  "buddy.add": "Add buddy 🤝",
  "buddy.requested": "Request sent ⏳",
  "buddy.is_buddy": "Buddies ✓",
  "buddy.remove": "Remove buddy",
  "buddy.requests_title": "Buddy requests 🤝",
  "buddy.accept": "Accept",
  "buddy.decline": "Decline",
  "buddy.my_buddies": "My buddies 🤝",
  "buddy.no_buddies": "No buddies yet. Play a match — buddies happen.",
  "buddy.from_buddies": "From your buddies 🤝",
  "buddy.your_buddy": "Your buddy {name}",
  "buddy.source.played": "Played a match",
  "buddy.source.invite": "Invited you",
  "buddy.source.manual": "Manual",
  "buddy.confirm_remove": "Remove this buddy?",
  "buddy.removed": "Buddy removed",
  "buddy.request_sent": "Buddy request sent 🤝",
  "buddy.accepted": "Buddies! 🤝",
  "buddy.declined": "Declined",
};

const sv: Dict = {
  "brand.tagline": "Det är en match. Bokstavligen.",
  "brand.subtitle": "Hitta en spelpartner för ikväll.",
  "brand.uppsala_beta": "Uppsala · Endast med inbjudan",
  "lang.switch_label": "Språk",

  "index.match_a": "Det är en match.",
  "index.match_b": "Bokstavligen.",
  "index.cta_invite": "Skaffa en inbjudan 🎾",
  "index.cta_have_account": "Jag har redan ett konto",

  "auth.signup_title": "Gå med i klubben",
  "auth.login_title": "Välkommen tillbaka",
  "auth.signup_sub": "Endast med inbjudan. Har du en kod?",
  "auth.login_sub": "Dags för en match.",
  "auth.invite_label": "Inbjudningskod",
  "auth.email_label": "Mejl",
  "auth.password_label": "Lösenord",
  "auth.create_account": "Skapa konto 🎾",
  "auth.sign_in": "Logga in",
  "auth.have_account": "Redan med?",
  "auth.no_account": "Ny här?",
  "auth.go_login": "Logga in",
  "auth.go_signup": "Skaffa en inbjudan",
  "auth.invite_bad": "Den koden fungerar inte. Betan är endast med inbjudan.",
  "auth.signout": "Logga ut",
  "auth.signed_out": "Vi ses på banan 👋",

  "ce.title": "Kolla din mejl",
  "ce.sent_to": "Vi skickade den till",
  "ce.step1": "Öppna din mejl-app",
  "ce.step2": "Hitta mejlet från Courtship",
  "ce.step3_a": "Tryck på",
  "ce.step3_button": "Bekräfta min mejl",
  "ce.step3_b": "-knappen i mejlet",
  "ce.resend": "Skicka igen",
  "ce.resend_cooldown": "Skicka igen ({s}s)",
  "ce.resend_sending": "Skickar...",
  "ce.spam_hint": "Fick du inget? Kolla skräpposten.",
  "ce.wrong_address": "Fel adress?",
  "ce.start_over": "Börja om",
  "ce.resent_ok": "Mejlet är skickat igen. Kolla inkorgen 📩",

  "nav.home": "Hem",
  "nav.rescue": "Räddning 🚨",
  "nav.players": "Spelare",
  "nav.me": "Jag",

  "home.lets_play": "Nu kör vi 🎾",
  "home.save_my_set": "Rädda mitt set 🚨",
  "home.browse_players": "Bläddra bland spelare",
  "home.your_sos": "Dina aktiva rop",
  "home.no_active": "Inga aktiva rop. Lugn dag på banan.",
  "home.pending_check": "Blev det av? 🎾",
  "home.yes_played": "Ja ✅",
  "home.no_show": "Dök ej upp 🪦",

  "sos.new_title": "Rädda mitt set 🚨",
  "sos.new_sub": "Tryck snabbt. Räddare väntar.",
  "sos.when": "När",
  "sos.today": "Idag",
  "sos.tomorrow": "Imorgon",
  "sos.court": "Bana",
  "sos.format": "Format",
  "sos.level_range": "Nivåspann",
  "sos.anyone": "Vem som helst — jag vill bara spela",
  "sos.court_status": "Banstatus",
  "sos.note_label": "Notis (valfri)",
  "sos.note_placeholder": "Jag tar med bollar 🎾",
  "sos.send": "Skicka nödrop 🚨",
  "sos.back": "← Tillbaka",

  "sos.broadcasting": "Sänder ut till {n} räddare...",
  "sos.im_in": "Jag är med! 🎾",
  "sos.matched": "Det är en match. Bokstavligen.",
  "sos.cancel": "Avbryt ropet",
  "sos.message_wa": "Skriv på WhatsApp 👋",

  "rescue.title": "Räddningstavlan",
  "rescue.empty_title": "Tyst på banorna.",
  "rescue.empty_sub": "Var först att skicka ett nödrop 🚨",
  "rescue.listening": "Lyssnar...",

  "players.title": "Spelare",
  "players.sub": "Välj din spelpartner.",
  "players.warming": "Värmer upp...",
  "players.empty": "Lätta på filtren — din match finns där ute.",
  "players.message_wa": "Skriv på WhatsApp 👋",

  "me.title": "Din profil",
  "me.sub": "Justera tills det känns rätt.",
  "me.save": "Spara ändringar",
  "me.updated": "Uppdaterad 🎾",
  "me.language": "Språk",
  "wiz.save_see": "Spara & se spelare",
  "wiz.next": "Nästa",
  "wiz.back": "Tillbaka",
  "wiz.name_label": "Förnamn",
  "wiz.phone_label": "Telefonnummer",
  "wiz.phone_help": "Spelare når dig på WhatsApp. Ditt nummer delas bara när någon faktiskt skriver till dig — visas aldrig i appen.",
  "onboarding.title": "Skapa din profil",
  "onboarding.sub": "Berätta hur du gillar att spela. Vi matchar vibben.",
  "onboarding.welcome_in": "Du är med. Nu kör vi.",

  "city.label": "Stad",
  "city.any": "Alla städer",
  "wiz.city_label": "Din hemstad",
  "wiz.buddy_sos_label": "Nödrop från mina kompisar",
  "wiz.buddy_sos_help": "Hör när en kompis behöver dig — även när räddarläget är av.",
  "buddy.add": "Lägg till kompis 🤝",
  "buddy.requested": "Förfrågan skickad ⏳",
  "buddy.is_buddy": "Kompisar ✓",
  "buddy.remove": "Ta bort kompis",
  "buddy.requests_title": "Kompisförfrågningar 🤝",
  "buddy.accept": "Acceptera",
  "buddy.decline": "Avböj",
  "buddy.my_buddies": "Mina kompisar 🤝",
  "buddy.no_buddies": "Inga kompisar än. Spela en match — kompisar händer.",
  "buddy.from_buddies": "Från dina kompisar 🤝",
  "buddy.your_buddy": "Din kompis {name}",
  "buddy.source.played": "Spelade en match",
  "buddy.source.invite": "Bjöd in dig",
  "buddy.source.manual": "Manuellt",
  "buddy.confirm_remove": "Ta bort den här kompisen?",
  "buddy.removed": "Kompis borttagen",
  "buddy.request_sent": "Kompisförfrågan skickad 🤝",
  "buddy.accepted": "Kompisar! 🤝",
  "buddy.declined": "Avböjd",
};

const DICTS: Record<Lang, Dict> = { en, sv };

function detectInitial(): Lang {
  if (typeof window === "undefined") return "en";
  const stored = window.localStorage.getItem(STORAGE_KEY) as Lang | null;
  if (stored === "en" || stored === "sv") return stored;
  const nav = window.navigator?.language?.toLowerCase() ?? "";
  return nav.startsWith("sv") ? "sv" : "en";
}

type Ctx = {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
};

const I18nCtx = createContext<Ctx | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");

  useEffect(() => {
    setLangState(detectInitial());
  }, []);

  // Pull profile lang once signed in (overrides local default).
  useEffect(() => {
    let active = true;
    const load = async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user || !active) return;
      const { data: p } = await supabase
        .from("profiles" as any)
        .select("lang")
        .eq("id", data.user.id)
        .maybeSingle();
      const pl = (p as any)?.lang as Lang | undefined;
      if (pl && active && (pl === "en" || pl === "sv")) {
        setLangState(pl);
        try { localStorage.setItem(STORAGE_KEY, pl); } catch {}
      }
    };
    load();
    const { data: sub } = supabase.auth.onAuthStateChange((e) => {
      if (e === "SIGNED_IN") load();
    });
    return () => { active = false; sub.subscription.unsubscribe(); };
  }, []);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try { localStorage.setItem(STORAGE_KEY, l); } catch {}
    // Best-effort persist to profile + auth metadata
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) return;
      await supabase.from("profiles" as any).update({ lang: l }).eq("id", data.user.id);
      await supabase.auth.updateUser({ data: { lang: l } });
    })();
  }, []);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => {
      const raw = DICTS[lang][key] ?? DICTS.en[key] ?? key;
      if (!vars) return raw;
      return raw.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""));
    },
    [lang],
  );

  return <I18nCtx.Provider value={{ lang, setLang, t }}>{children}</I18nCtx.Provider>;
}

export function useI18n(): Ctx {
  const ctx = useContext(I18nCtx);
  if (!ctx) return { lang: "en", setLang: () => {}, t: (k) => DICTS.en[k] ?? k };
  return ctx;
}

export function LangToggle({ className = "" }: { className?: string }) {
  const { lang, setLang } = useI18n();
  return (
    <div
      role="group"
      aria-label="Language"
      className={`inline-flex items-center rounded-full border-2 border-[var(--ink)] bg-[var(--cream2)] p-1 ${className}`}
    >
      {(["sv", "en"] as Lang[]).map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => setLang(l)}
          aria-pressed={lang === l}
          className={`min-h-11 min-w-12 px-4 rounded-full font-extrabold uppercase ${
            lang === l ? "bg-[var(--green-pop)] text-[var(--ink)]" : "text-[var(--ink)]"
          }`}
        >
          {l === "sv" ? "SV" : "EN"}
        </button>
      ))}
    </div>
  );
}