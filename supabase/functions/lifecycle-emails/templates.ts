// Lifecycle email templates — one place for every word a player reads from us.
// Plain, warm, short. Every email is bilingual: Swedish first (we are in
// Sweden), English below a thin divider. Oksana signs; every email ends with a
// way to reach her directly (WhatsApp button + email), and replies land in her
// inbox (Reply-To). Each template returns subject + the HTML inside the brand frame.
//
// Templates (when they go out is decided in index.ts):
//   welcome_0     right after the profile is created
//   welcome_1     day 1–4, still no game posted or joined
//   install_3     day 3–45, Courtship not on the home screen yet
//   community_7   day 7–60: why Courtship exists, clubs & coaches, suggestions
//   invite_14     day 14–90, fewer than 2 buddies (personal invite link)
//   push_off      installed ≥2 days ago but notifications are off
//   fading        quiet for 14–30 days, used to play
//   sleeping      quiet for 45+ days (once)
//   unfinished    account but no profile, ≥1 day
//   digest        Mondays: what's on the board this week — in the player's city

export type GameLine = { t?: number; when: string; whenSv: string; court: string; host: string; url: string; sos: boolean }; // t = play time (ms) for sorting

export type Contact = { name: string; whatsapp: string; email: string }; // whatsapp = digits only, e.g. 46700266274

export type Ctx = {
  firstName: string;
  app: string;            // https://court-ship.com
  unsubUrl: string;
  settingsUrl: string;
  contact: Contact;       // who signs and how to reach her
  inviteLink?: string;    // personal invite link (board with ?code&by) — one per player
  games?: GameLine[];     // upcoming open games in the player's city/cities
  openCount?: number;     // how many open games there right now
  installed?: boolean;    // Courtship on the home screen
  city?: string;          // the player's home city
};

export type Rendered = { subject: string; html: string };

const CORAL = "#F0705B";
const INK = "#2B2118";
const CREAM = "#F6F0E1";
const CARD = "#FDF9EE";
const LIME = "#EEF6D6";
const WOOD = "#8C5A33";
const ARIAL = "font-family:Arial,Helvetica,sans-serif";

export function esc(s: string): string {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** "Skriv till mig" block: WhatsApp button + email, signed by name. Used by
 *  every email (also email-notify / email-broadcast copy the same markup). */
export function contactBlock(c: Contact): string {
  const wa = `https://wa.me/${c.whatsapp}?text=${encodeURIComponent(`Hej ${c.name}! `)}`;
  return `<div style="margin-top:20px;padding-top:14px;border-top:1px solid rgba(43,33,24,.15);${ARIAL};font-size:14px;line-height:1.5">
      <div style="font-weight:bold">Frågor eller idéer? Skriv direkt till mig · Questions or ideas? Write to me directly</div>
      <div style="margin-top:8px">
        <a href="${wa}" style="display:inline-block;border:2px solid ${INK};border-radius:10px;padding:8px 14px;color:${INK};font-weight:bold;text-decoration:none;background:#fff">💬 WhatsApp</a>
        <span style="color:${WOOD}">&nbsp;·&nbsp;</span>
        <a href="mailto:${c.email}" style="color:${INK};font-weight:bold">${esc(c.email)}</a>
      </div>
      <div style="margin-top:10px;font-family:Georgia,serif;font-size:15px">— ${esc(c.name)}, Courtship</div>
    </div>`;
}

/** Brand frame: cream page, ink-bordered card, Georgia titles, Arial body.
 *  Swedish part, one coral button, divider, English part, contact, footer. */
function frame(ctx: Ctx, sv: { title: string; body: string; ps?: string }, en: { title: string; body: string; ps?: string }, cta: { sv: string; en: string; url: string }): string {
  const button = `<a href="${cta.url}" style="display:inline-block;margin-top:18px;background:${CORAL};color:#FFF6E8;${ARIAL};font-weight:bold;font-size:16px;text-decoration:none;border:2px solid ${INK};border-radius:12px;padding:12px 20px">${esc(cta.sv)} <span style="font-weight:normal;opacity:.85">· ${esc(cta.en)}</span></a>`;
  const ps = (s?: string) => (s ? `<p style="margin:16px 0 0;${ARIAL};font-size:14px;line-height:1.5;color:#5a4f44">${s}</p>` : "");
  return `<!doctype html><html lang="sv"><body style="margin:0;padding:0;background:${CREAM}">
  <div style="max-width:560px;margin:0 auto;padding:28px 18px;font-family:Georgia,serif;color:${INK}">
    <div style="font-size:20px;font-weight:bold;margin-bottom:14px">🎾 Courtship <span style="${ARIAL};font-size:12px;font-weight:normal;color:${WOOD};letter-spacing:.08em;text-transform:uppercase">· Uppsala &amp; Stockholm</span></div>
    <div style="background:${CARD};border:2px solid ${INK};border-radius:16px;padding:24px 22px">
      <div style="font-size:26px;line-height:1.2;font-weight:bold">${sv.title}</div>
      <div style="${ARIAL};font-size:15.5px;line-height:1.55;margin-top:14px">${sv.body}</div>
      ${button}
      ${ps(sv.ps)}
      <div style="margin:22px 0 14px;border-top:1px solid rgba(43,33,24,.15);text-align:center"><span style="position:relative;top:-9px;background:${CARD};padding:0 10px;${ARIAL};font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:${WOOD}">In English</span></div>
      <div style="font-size:21px;line-height:1.25;font-weight:bold">${en.title}</div>
      <div style="${ARIAL};font-size:15px;line-height:1.55;margin-top:10px">${en.body}</div>
      ${ps(en.ps)}
      ${contactBlock(ctx.contact)}
    </div>
    <p style="font-size:12px;line-height:1.5;color:${WOOD};margin-top:16px;${ARIAL}">
      Du får det här mejlet för att du har ett Courtship-konto. Svara på mejlet så når du ${esc(ctx.contact.name)} direkt.
      <a href="${ctx.settingsUrl}" style="color:${WOOD}">Mejlinställningar</a> · <a href="${ctx.unsubUrl}" style="color:${WOOD}">Avsluta prenumeration</a><br>
      You get this because you have a Courtship account. Reply to this email to reach ${esc(ctx.contact.name)} directly.
      <a href="${ctx.settingsUrl}" style="color:${WOOD}">Email settings</a> · <a href="${ctx.unsubUrl}" style="color:${WOOD}">Unsubscribe</a>
    </p>
  </div></body></html>`;
}

const p = (s: string) => `<p style="margin:0 0 12px">${s}</p>`;

/** Emoji + text rows, mobile-safe. */
function rows(items: Array<[string, string]>): string {
  return `<table role="presentation" cellspacing="0" cellpadding="0" style="margin:6px 0 12px">${items
    .map(([e, t]) => `<tr><td style="font-size:20px;padding:6px 10px 6px 0;vertical-align:top">${e}</td><td style="${ARIAL};font-size:15px;line-height:1.5;padding:6px 0">${t}</td></tr>`)
    .join("")}</table>`;
}

function gameList(games: GameLine[], lang: "sv" | "en"): string {
  if (!games.length) return "";
  return `<div style="margin:8px 0 6px">${games
    .map((g) => `<a href="${g.url}" style="display:block;text-decoration:none;color:${INK};border:1px solid rgba(43,33,24,.25);border-left:4px solid ${g.sos ? CORAL : "#C9EE3F"};border-radius:10px;padding:10px 12px;margin:0 0 8px;background:${g.sos ? "#FCE9E4" : LIME}">
      <span style="font-family:Georgia,serif;font-weight:bold;font-size:16px">${g.sos ? "🚨 " : "🎾 "}${esc(lang === "sv" ? g.whenSv : g.when)}</span><br>
      <span style="${ARIAL};font-size:13.5px;color:${WOOD};font-weight:bold">📍 ${esc(g.court)} · ${esc(g.host)}</span></a>`)
    .join("")}</div>`;
}

const link = (ctx: Ctx) => `<a href="${ctx.app}" style="color:${INK}">court-ship.com</a>`;

const installStepsSv = (ctx: Ctx) =>
  rows([
    ["📱", `<b>iPhone:</b> öppna ${link(ctx)} i Safari → tryck <b>Dela</b> (rutan med pilen) → <b>Lägg till på hemskärmen</b>.`],
    ["🤖", `<b>Android:</b> öppna ${link(ctx)} i Chrome → tryck <b>⋮</b> → <b>Lägg till på startskärmen</b> (eller <b>Installera app</b>).`],
    ["🔔", `Öppna den från den nya ikonen en gång och säg <b>ja</b> till notiser. Klart – ingen appbutik, inget att betala.`],
  ]);

const installStepsEn = (ctx: Ctx) =>
  rows([
    ["📱", `<b>iPhone:</b> open ${link(ctx)} in Safari → tap <b>Share</b> (the square with the arrow) → <b>Add to Home Screen</b>.`],
    ["🤖", `<b>Android:</b> open ${link(ctx)} in Chrome → tap <b>⋮</b> → <b>Add to Home screen</b> (or <b>Install app</b>).`],
    ["🔔", `Open it from the new icon once and say <b>yes</b> to notifications. That's it — no app store, nothing to pay.`],
  ]);

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

export function render(template: string, ctx: Ctx): Rendered | null {
  const name = ctx.firstName ? esc(ctx.firstName) : "";
  const nameSv = name ? `, ${name}` : "";
  const nameEn = name ? `, ${name}` : "";
  const board = `${ctx.app}/board`;
  const post = `${ctx.app}/sos/new`;
  const city = ctx.city ? esc(ctx.city) : "";
  const n = ctx.openCount ?? 0;
  const inviteBox = ctx.inviteLink
    ? `<p style="margin:0 0 12px;padding:12px;border:1px dashed ${WOOD};border-radius:10px;${ARIAL};word-break:break-all"><a href="${ctx.inviteLink}" style="color:${INK};font-weight:bold">${esc(ctx.inviteLink)}</a></p>`
    : "";
  switch (template) {
    case "welcome_0":
      return {
        subject: "Du är med 🎾 Så funkar Courtship · You're in — here's how Courtship works",
        html: frame(ctx,
          {
            title: `Välkommen till Courtship${nameSv}!`,
            body:
              p(`Courtship gör en sak: hittar en tennispartner åt dig – ikväll, i helgen, när du vill spela. Uppsala &amp; Stockholm, alla nivåer, gratis.`) +
              rows([
                ["🎾", `<b>Lägg upp ett spel.</b> Välj tid och bana. Spelare på din nivå i närheten får en pling – den första som säger ”Jag är med” är din partner.`],
                ["🙋", `<b>Häng på ett spel.</b> Tavlan visar vem som spelar just nu. Ett tryck, så är du med.`],
                ["🚨", `<b>SOS.</b> Partnern hoppade av en timme före banan? Skicka en nödsignal – de närmaste spelarna hör den inom minuter.`],
              ]) +
              p(`<b>Värt 10 sekunder:</b> lägg Courtship på hemskärmen, så når nya spel och nödsignaler dig som notiser.`) +
              installStepsSv(ctx),
            ps: `Svara på det här mejlet när som helst – jag läser alla.`,
          },
          {
            title: `Welcome to Courtship${nameEn}!`,
            body:
              p(`Courtship does one thing: it finds you a tennis partner — tonight, this weekend, whenever you want to play. Uppsala &amp; Stockholm, every level, free.`) +
              rows([
                ["🎾", `<b>Post a game.</b> Pick a time and a court. Players at your level nearby get a ping; the first to say “I'm in” is your partner.`],
                ["🙋", `<b>Join one.</b> The board shows who's playing right now. One tap and you're in.`],
                ["🚨", `<b>SOS.</b> Partner bailed an hour before the court? Fire a flare — the nearest players hear it within minutes.`],
              ]) +
              p(`<b>One thing worth 10 seconds:</b> add Courtship to your home screen, so new games and flares reach you as notifications.`) +
              installStepsEn(ctx),
            ps: `Reply to this email anytime — I read every one.`,
          },
          { sv: "Se vem som spelar", en: "See who's playing", url: board }),
      };
    case "welcome_1":
      return {
        subject: "Snabbaste vägen till ett spel den här veckan · The fastest way to get a game this week",
        html: frame(ctx,
          {
            title: `Lägg upp ett spel – det tar 10 sekunder${nameSv}`,
            body:
              p(`De flesta första spelen på Courtship kommer från att <b>lägga upp</b>, inte vänta. Välj en tid, din vanliga bana, tryck <b>Lägg upp</b>. Alla på din nivå i närheten får en pling, och den första som säger ”Jag är med” är din partner.`) +
              p(`Vill du titta först? Tavlan visar vad som är öppet just nu${n ? ` – <b>${n} ${plural(n, "öppet spel", "öppna spel")}</b>${city ? ` i ${city}` : ""} i skrivande stund` : ""}.`) +
              p(`Och om banan är bokad och partnern ställer in: <b>SOS</b>-knappen finns för exakt det.`),
            ps: `Fastnat på något? Svara här.`,
          },
          {
            title: `Post a game — it takes 10 seconds${nameEn}`,
            body:
              p(`Most first games on Courtship come from <b>posting</b>, not waiting. Pick a time, your usual court, tap <b>Post</b>. Everyone at your level nearby gets a ping, and the first to say “I'm in” is your partner.`) +
              p(`Prefer to look first? The board shows what's open right now${n ? ` — <b>${n} open ${plural(n, "game", "games")}</b>${city ? ` in ${city}` : ""} at the moment` : ""}.`) +
              p(`And if a court is booked and your partner cancels: the <b>SOS</b> button is made for exactly that.`),
            ps: `Stuck on anything? Reply here.`,
          },
          { sv: "Lägg upp ett spel", en: "Post a game", url: post }),
      };
    case "install_3":
      return {
        subject: "Missa inga spel: lägg Courtship på hemskärmen (10 sek) · Add Courtship to your home screen",
        html: frame(ctx,
          {
            title: `Lägg Courtship på hemskärmen${nameSv}`,
            body:
              p(`Nya spel och nödsignaler kommer som <b>notiser</b> – men bara när Courtship ligger på hemskärmen. I en webbläsarflik ser du dem bara om du råkar titta.`) +
              installStepsSv(ctx) +
              p(`Det ser ut och fungerar som en app, är gratis och uppdaterar sig självt.`),
            ps: `Funkar det inte på din telefon? Svara med modellen, så löser jag det.`,
          },
          {
            title: `Put Courtship on your home screen${nameEn}`,
            body:
              p(`New games and SOS flares arrive as <b>notifications</b> — but only when Courtship lives on your home screen. In a browser tab, you'll only see them if you happen to look.`) +
              installStepsEn(ctx) +
              p(`It looks and works like an app, stays free, and updates itself.`),
            ps: `If it doesn't work on your phone, reply with the model and I'll sort it.`,
          },
          { sv: "Öppna Courtship", en: "Open Courtship", url: board }),
      };
    case "community_7":
      return {
        subject: `Varför jag byggde Courtship (och vad som kommer) · Why I built Courtship`,
        html: frame(ctx,
          {
            title: `Några rader från ${esc(ctx.contact.name)}`,
            body:
              p(`Hej${nameSv}. Jag startade Courtship efter en kväll för mycket med bokad bana och ingen partner – och en WhatsApp-grupp där ”någon ledig ikväll?” drunknade i 200 meddelanden.`) +
              p(`Courtship är ett community-projekt: spelare, klubbar och tränare som bygger tennisscenen i Uppsala &amp; Stockholm tillsammans. Inga annonser, inget swipa-för-vinst. Bara mer tennis.`) +
              rows([
                ["🏟️", `<b>Klubbar &amp; tränare:</b> vi är öppna för samarbeten – öppet spel, event, banerbjudanden, en tränarkatalog. Driver du en klubb eller känner en tränare? Svara, så ringer jag.`],
                ["💡", `<b>Förslag:</b> vad saknas? Vad irriterade dig? Svara med en rad – de bästa idéerna blir verklighet inom några veckor.`],
                ["🤝", `<b>Kompisar:</b> alla du spelar med blir en kompis. Kompisar får en pling när du lägger upp ett spel.`],
              ]) +
              p(`Tack för att du är med tidigt. Det betyder mycket.`),
          },
          {
            title: `A short note from ${esc(ctx.contact.name)}`,
            body:
              p(`Hi${nameEn}. I started Courtship after one too many evenings with a booked court and no partner — and a WhatsApp group where “anyone free tonight?” drowned in 200 messages.`) +
              p(`Courtship is a community project: players, clubs and coaches building the Uppsala &amp; Stockholm tennis scene together. No ads, no swipe-for-profit. Just more tennis.`) +
              rows([
                ["🏟️", `<b>Clubs &amp; coaches:</b> we're open to partnerships — open play evenings, events, court deals, a coach directory. If you run a club or know a coach, reply and I'll call.`],
                ["💡", `<b>Suggestions:</b> what's missing? What annoyed you? Reply with one line — the best ideas ship within weeks.`],
                ["🤝", `<b>Buddies:</b> every person you play with becomes a buddy. Buddies get a ping when you post a game.`],
              ]) +
              p(`Thank you for being early. It matters.`),
          },
          { sv: "Träffa spelarna", en: "Meet the players", url: `${ctx.app}/players` }),
      };
    case "invite_14":
      return {
        subject: "Är din spelpartner inte på Courtship än? · Your hitting partner isn't on Courtship yet?",
        html: frame(ctx,
          {
            title: `Ta med din partner${nameSv}`,
            body:
              p(`Tavlan är bara så bra som människorna på den. Din vanliga spelpartner, kompisen som ”borde spela mer”, kollegan med en elak backhand – bjud in dem med din personliga länk:`) +
              inviteBox +
              p(`Den som går med via länken blir automatiskt din <b>kompis</b> – du hör när de lägger upp ett spel, och de hör om dina.`),
          },
          {
            title: `Bring your partner${nameEn}`,
            body:
              p(`The board is only as good as the people on it. Your usual hitting partner, the friend who “should play more”, the colleague with a mean backhand — invite them with your personal link:`) +
              inviteBox +
              p(`Whoever joins through it becomes your <b>buddy</b> automatically — you'll hear when they post a game, and they'll hear about yours.`),
          },
          { sv: "Bjud in en vän", en: "Invite a friend", url: `${ctx.app}/players` }),
      };
    case "push_off":
      return {
        subject: "Slå på notiser – det är hela poängen 🔔 · Turn on notifications",
        html: frame(ctx,
          {
            title: `Ett tryck kvar${nameSv}`,
            body:
              p(`Courtship ligger på din hemskärm – snyggt. Notiserna är fortfarande av, så nya spel och nödsignaler kan inte nå dig.`) +
              rows([
                ["🔔", `Öppna Courtship → <b>Profil</b> → <b>Inställningar</b> → <b>Notiser</b> → slå på.`],
                ["📵", `Om telefonen frågar, välj <b>Tillåt</b>. Du kan stänga av när som helst.`],
              ]),
          },
          {
            title: `One tap left${nameEn}`,
            body:
              p(`Courtship is on your home screen — nice. Notifications are still off, so new games and SOS flares can't reach you.`) +
              rows([
                ["🔔", `Open Courtship → <b>Profile</b> → <b>Settings</b> → <b>Notifications</b> → turn on.`],
                ["📵", `If your phone asks, choose <b>Allow</b>. You can mute anytime.`],
              ]),
          },
          { sv: "Öppna inställningar", en: "Open Settings", url: ctx.settingsUrl }),
      };
    case "fading": {
      const has = !!ctx.games?.length;
      return {
        subject: n ? `${n} ${plural(n, "öppet spel", "öppna spel")} den här veckan – hänger du på? · ${n} open ${plural(n, "game", "games")} this week` : "Vi har sparat en plats på banan · We saved you a spot on court",
        html: frame(ctx,
          {
            title: `Vi saknar dig på banan${nameSv}`,
            body:
              p(`Det har gått ett par veckor. Här är vad som är öppet just nu${city ? ` i ${city}` : ""}:`) +
              gameList(ctx.games ?? [], "sv") +
              (has ? "" : p(`Lugnt just nu – precis då funkar det bäst att lägga upp ett spel.`)),
          },
          {
            title: `We miss you on court${nameEn}`,
            body:
              p(`It's been a couple of weeks. Here's what's open right now${city ? ` in ${city}` : ""}:`) +
              gameList(ctx.games ?? [], "en") +
              (has ? "" : p(`Quiet at the moment — which is exactly when posting a game works best.`)),
          },
          has ? { sv: "Se tavlan", en: "See the board", url: board } : { sv: "Lägg upp ett spel", en: "Post a game", url: post }),
      };
    }
    case "sleeping":
      return {
        subject: "Spelar du fortfarande tennis? · Still playing tennis?",
        html: frame(ctx,
          {
            title: `Spelar du fortfarande${nameSv}?`,
            body:
              p(`Ingen press. Spelar du fortfarande hittar Courtship en partner åt dig på ungefär 10 sekunder – och det finns fler spelare på tavlan än när du tittade sist.`) +
              p(`Om tennis inte är aktuellt just nu: ett klick längst ner så slutar vi mejla. Kontot finns kvar.`),
          },
          {
            title: `Still hitting${nameEn}?`,
            body:
              p(`No pressure. If you're still playing, Courtship still finds you a partner in about 10 seconds — and there are more players on the board than when you last looked.`) +
              p(`If tennis isn't on the menu right now, one click at the bottom and we'll stop emailing. Your account stays.`),
          },
          { sv: "Jag spelar fortfarande", en: "I'm still playing", url: board }),
      };
    case "unfinished":
      return {
        subject: "En minut till ditt första spel · One minute to your first game",
        html: frame(ctx,
          {
            title: `Nästan klart${nameSv}`,
            body:
              p(`Du skapade ett Courtship-konto men blev inte klar med profilen – fyra fält: namn, WhatsApp-nummer, nivå, stad. Sedan visar tavlan vem som spelar.`) +
              p(`Varför numret? När ett spel matchar behöver du och din partner kunna nå varandra. Det visas aldrig offentligt.`),
          },
          {
            title: `Almost there${nameEn}`,
            body:
              p(`You created a Courtship account but didn't finish the profile — four fields: name, WhatsApp number, level, city. Then the board shows you who's playing.`) +
              p(`Why the number? When a game matches, you and your partner need to reach each other. It's never shown publicly.`),
          },
          { sv: "Gör klart profilen", en: "Finish setup", url: `${ctx.app}/onboarding` }),
      };
    case "digest": {
      const has = !!ctx.games?.length;
      const tipSv = ctx.installed === false
        ? p(`📲 <b>Tips:</b> du läser det här via mejl eftersom Courtship inte ligger på din hemskärm än. Lägg till den (Safari → Dela → Lägg till på hemskärmen; Chrome → ⋮ → Lägg till på startskärmen), så når nya spel dig som notiser.`)
        : "";
      const tipEn = ctx.installed === false
        ? p(`📲 <b>Tip:</b> you're reading this by email because Courtship isn't on your home screen yet. Add it (Safari → Share → Add to Home Screen; Chrome → ⋮ → Add to Home screen) and new games reach you as notifications.`)
        : "";
      return {
        subject: has ? `Veckans tennis${city ? ` i ${city}` : ""}: ${n} ${plural(n, "öppet spel", "öppna spel")} · This week on court: ${n} open` : `Veckans tennis${city ? ` i ${city}` : ""} · This week on court`,
        html: frame(ctx,
          {
            title: `Veckans tennis${nameSv}`,
            body:
              (has ? p(`Öppna spel du kan hänga på${city ? ` i ${city}` : ""}:`) + gameList(ctx.games ?? [], "sv") : p(`Lugn vecka hittills${city ? ` i ${city}` : ""} – lägg upp det första spelet och se det fyllas.`)) + tipSv,
            ps: `Måndagssammanfattning, en gång i veckan. Stäng av i <a href="${ctx.settingsUrl}" style="color:${WOOD}">Inställningar</a>.`,
          },
          {
            title: `This week on court${nameEn}`,
            body:
              (has ? p(`Open games you could join${city ? ` in ${city}` : ""}:`) + gameList(ctx.games ?? [], "en") : p(`Quiet week so far${city ? ` in ${city}` : ""} — post the first game and watch it fill.`)) + tipEn,
            ps: `Monday recap, once a week. Turn it off in <a href="${ctx.settingsUrl}" style="color:${WOOD}">Settings</a>.`,
          },
          has ? { sv: "Se tavlan", en: "See the board", url: board } : { sv: "Lägg upp ett spel", en: "Post a game", url: post }),
      };
    }
    default:
      return null;
  }
}

export const TEMPLATES = ["welcome_0", "welcome_1", "install_3", "community_7", "invite_14", "push_off", "fading", "sleeping", "unfinished", "digest"] as const;
