// Lifecycle email templates — one place for every word a player reads from us.
// Plain, warm, short. Oxy signs; replies land in her inbox (Reply-To is the
// sender). Each template returns subject + the HTML inside the brand frame.
//
// Templates (when they go out is decided in index.ts):
//   welcome_0     right after the profile is created
//   welcome_1     day 1–4, still no game posted or joined
//   install_3     day 3–45, Courtship not on the home screen yet
//   community_7   day 7–60: why Courtship exists, clubs & coaches, suggestions
//   invite_14     day 14–90, fewer than 2 buddies
//   push_off      installed ≥2 days ago but notifications are off
//   fading        quiet for 14–30 days, used to play
//   sleeping      quiet for 45+ days (once)
//   unfinished    account but no profile, ≥1 day
//   digest        Mondays: what's on the board this week

export type GameLine = { when: string; court: string; host: string; url: string; sos: boolean };

export type Ctx = {
  firstName: string;
  app: string;            // https://court-ship.com
  unsubUrl: string;
  settingsUrl: string;
  inviteLink?: string;    // personal invite link (board with ?code&by)
  games?: GameLine[];     // upcoming open games (digest / fading)
  openCount?: number;     // how many open games right now
  installed?: boolean;    // Courtship on the home screen
  city?: string;
};

export type Rendered = { subject: string; html: string };

const CORAL = "#F0705B";
const INK = "#2B2118";
const CREAM = "#F6F0E1";
const CARD = "#FDF9EE";
const LIME = "#EEF6D6";
const WOOD = "#8C5A33";

export function esc(s: string): string {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Brand frame: cream page, ink-bordered card, Georgia title, Arial body. */
function frame(ctx: Ctx, title: string, inner: string, cta?: { label: string; url: string }, ps?: string): string {
  const button = cta
    ? `<a href="${cta.url}" style="display:inline-block;margin-top:18px;background:${CORAL};color:#FFF6E8;font-family:Arial,Helvetica,sans-serif;font-weight:bold;font-size:16px;text-decoration:none;border:2px solid ${INK};border-radius:12px;padding:12px 20px">${esc(cta.label)}</a>`
    : "";
  const psHtml = ps ? `<p style="margin:18px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#5a4f44">${ps}</p>` : "";
  return `<!doctype html><html><body style="margin:0;padding:0;background:${CREAM}">
  <div style="max-width:560px;margin:0 auto;padding:28px 18px;font-family:Georgia,serif;color:${INK}">
    <div style="font-size:20px;font-weight:bold;margin-bottom:14px">🎾 Courtship <span style="font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:normal;color:${WOOD};letter-spacing:.08em;text-transform:uppercase">· Uppsala &amp; Stockholm</span></div>
    <div style="background:${CARD};border:2px solid ${INK};border-radius:16px;padding:24px 22px">
      <div style="font-size:26px;line-height:1.2;font-weight:bold">${title}</div>
      <div style="font-family:Arial,Helvetica,sans-serif;font-size:15.5px;line-height:1.55;margin-top:14px">${inner}</div>
      ${button}
      ${psHtml}
    </div>
    <p style="font-size:12px;line-height:1.5;color:${WOOD};margin-top:16px;font-family:Arial,Helvetica,sans-serif">
      You get this because you have a Courtship account. Reply to this email to reach Oxy directly.
      <a href="${ctx.settingsUrl}" style="color:${WOOD}">Email settings</a> · <a href="${ctx.unsubUrl}" style="color:${WOOD}">Unsubscribe</a>
    </p>
  </div></body></html>`;
}

const p = (s: string) => `<p style="margin:0 0 12px">${s}</p>`;

/** Three-column-free "row" list: emoji + text, mobile-safe. */
function rows(items: Array<[string, string]>): string {
  return `<table role="presentation" cellspacing="0" cellpadding="0" style="margin:6px 0 12px">${items
    .map(([e, t]) => `<tr><td style="font-size:20px;padding:6px 10px 6px 0;vertical-align:top">${e}</td><td style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;padding:6px 0">${t}</td></tr>`)
    .join("")}</table>`;
}

function gameList(games: GameLine[]): string {
  if (!games.length) return "";
  return `<div style="margin:8px 0 6px">${games
    .map((g) => `<a href="${g.url}" style="display:block;text-decoration:none;color:${INK};border:1px solid rgba(43,33,24,.25);border-left:4px solid ${g.sos ? CORAL : "#C9EE3F"};border-radius:10px;padding:10px 12px;margin:0 0 8px;background:${g.sos ? "#FCE9E4" : LIME}">
      <span style="font-family:Georgia,serif;font-weight:bold;font-size:16px">${g.sos ? "🚨 " : "🎾 "}${esc(g.when)}</span><br>
      <span style="font-family:Arial,Helvetica,sans-serif;font-size:13.5px;color:${WOOD};font-weight:bold">📍 ${esc(g.court)} · ${esc(g.host)}</span></a>`)
    .join("")}</div>`;
}

const installSteps = (ctx: Ctx) =>
  rows([
    ["📱", `<b>iPhone:</b> open <a href="${ctx.app}" style="color:${INK}">court-ship.com</a> in Safari → tap <b>Share</b> (the square with the arrow) → <b>Add to Home Screen</b>.`],
    ["🤖", `<b>Android:</b> open <a href="${ctx.app}" style="color:${INK}">court-ship.com</a> in Chrome → tap <b>⋮</b> → <b>Add to Home screen</b> (or <b>Install app</b>).`],
    ["🔔", `Open it from the new icon once and say <b>yes</b> to notifications. That's it — no app store, nothing to pay.`],
  ]);

export function render(template: string, ctx: Ctx): Rendered | null {
  const name = ctx.firstName ? esc(ctx.firstName) : "there";
  const board = `${ctx.app}/board`;
  switch (template) {
    case "welcome_0":
      return {
        subject: "You're in 🎾 Here's how Courtship works",
        html: frame(ctx, `Welcome to Courtship, ${name}!`,
          p(`Courtship does one thing: it finds you a tennis partner — tonight, this weekend, whenever you want to play. Uppsala &amp; Stockholm, every level, free.`) +
          rows([
            ["🎾", `<b>Post a game.</b> Pick a time and a court. Players at your level nearby get a ping; the first to say “I'm in” is your partner.`],
            ["🙋", `<b>Join one.</b> The board shows who's playing right now. One tap and you're in.`],
            ["🚨", `<b>SOS.</b> Partner bailed an hour before the court? Fire a flare — the nearest players hear it within minutes.`],
          ]) +
          p(`<b>One thing worth 10 seconds:</b> add Courtship to your home screen, so new games and flares reach you as notifications.`) +
          installSteps(ctx),
          { label: "See who's playing", url: board },
          `Reply to this email anytime — I read every one. <br>— Oxy, founder &amp; L3 forehand enthusiast`),
      };
    case "welcome_1":
      return {
        subject: "The fastest way to get a game this week",
        html: frame(ctx, `Post a game — it takes 10 seconds, ${name}`,
          p(`Most first games on Courtship come from <b>posting</b>, not waiting. Pick a time, your usual court, tap <b>Post</b>. Everyone at your level nearby gets a ping, and the first to say “I'm in” is your partner.`) +
          p(`Prefer to look first? The board shows what's open right now${ctx.openCount ? ` — <b>${ctx.openCount} open game${ctx.openCount === 1 ? "" : "s"}</b> at the moment` : ""}.`) +
          p(`And if a court is booked and your partner cancels: the <b>SOS</b> button is made for exactly that.`),
          { label: "Post a game", url: `${ctx.app}/sos/new` },
          `Stuck on anything? Reply here. — Oxy`),
      };
    case "install_3":
      return {
        subject: "Don't miss games: add Courtship to your home screen (10 sec)",
        html: frame(ctx, `Put Courtship on your home screen, ${name}`,
          p(`New games and SOS flares arrive as <b>notifications</b> — but only when Courtship lives on your home screen. In a browser tab, you'll only see them if you happen to look.`) +
          installSteps(ctx) +
          p(`It looks and works like an app, stays free, and updates itself.`),
          { label: "Open Courtship", url: board },
          `If it doesn't work on your phone, reply with the model and I'll sort it. — Oxy`),
      };
    case "community_7":
      return {
        subject: "Why I built Courtship (and what's next)",
        html: frame(ctx, `A short note from Oxy`,
          p(`Hi ${name}. I started Courtship after one too many evenings with a booked court and no partner — and a WhatsApp group where “anyone free tonight?” drowned in 200 messages.`) +
          p(`Courtship is a community project: players, clubs and coaches building the Uppsala &amp; Stockholm tennis scene together. No ads, no swipe-for-profit. Just more tennis.`) +
          rows([
            ["🏟️", `<b>Clubs &amp; coaches:</b> we're open to partnerships — open play evenings, events, court deals, a coach directory. If you run a club or know a coach, reply and I'll call.`],
            ["💡", `<b>Suggestions:</b> what's missing? What annoyed you? Reply with one line — the best ideas ship within weeks.`],
            ["🤝", `<b>Buddies:</b> every person you play with becomes a buddy. Buddies get a ping when you post a game.`],
          ]) +
          p(`Thank you for being early. It matters.`),
          { label: "Meet the players", url: `${ctx.app}/players` },
          `— Oxy`),
      };
    case "invite_14":
      return {
        subject: "Your hitting partner isn't on Courtship yet?",
        html: frame(ctx, `Bring your partner, ${name}`,
          p(`The board is only as good as the people on it. Your usual hitting partner, the friend who “should play more”, the colleague with a mean backhand — invite them with your personal link:`) +
          (ctx.inviteLink ? `<p style="margin:0 0 12px;padding:12px;border:1px dashed ${WOOD};border-radius:10px;font-family:Arial,Helvetica,sans-serif;word-break:break-all"><a href="${ctx.inviteLink}" style="color:${INK};font-weight:bold">${esc(ctx.inviteLink)}</a></p>` : "") +
          p(`Whoever joins through it becomes your <b>buddy</b> automatically — you'll hear when they post a game, and they'll hear about yours.`),
          { label: "Invite a friend", url: `${ctx.app}/players` },
          `— Oxy`),
      };
    case "push_off":
      return {
        subject: "Turn on notifications — it's the whole point 🔔",
        html: frame(ctx, `One tap left, ${name}`,
          p(`Courtship is on your home screen — nice. Notifications are still off, so new games and SOS flares can't reach you.`) +
          rows([
            ["🔔", `Open Courtship → <b>Profile</b> → <b>Settings</b> → <b>Notifications</b> → turn on.`],
            ["📵", `If your phone asks, choose <b>Allow</b>. You can mute anytime.`],
          ]),
          { label: "Open Settings", url: ctx.settingsUrl },
          `— Oxy`),
      };
    case "fading":
      return {
        subject: ctx.openCount ? `${ctx.openCount} open game${ctx.openCount === 1 ? "" : "s"} this week — want in?` : "We saved you a spot on court",
        html: frame(ctx, `We miss you on court, ${name}`,
          p(`It's been a couple of weeks. Here's what's open right now${ctx.city ? ` around ${esc(ctx.city)}` : ""}:`) +
          gameList(ctx.games ?? []) +
          (ctx.games?.length ? "" : p(`Quiet at the moment — which is exactly when posting a game works best.`)),
          { label: ctx.games?.length ? "See the board" : "Post a game", url: ctx.games?.length ? board : `${ctx.app}/sos/new` },
          `— Oxy`),
      };
    case "sleeping":
      return {
        subject: "Still playing tennis?",
        html: frame(ctx, `Still hitting, ${name}?`,
          p(`No pressure. If you're still playing, Courtship still finds you a partner in about 10 seconds — and there are more players on the board than when you last looked.`) +
          p(`If tennis isn't on the menu right now, one click below and we'll stop emailing. Your account stays.`),
          { label: "I'm still playing", url: board },
          `— Oxy`),
      };
    case "unfinished":
      return {
        subject: "One minute to your first game",
        html: frame(ctx, `Almost there, ${name}`,
          p(`You created a Courtship account but didn't finish the profile — four fields: name, WhatsApp number, level, city. Then the board shows you who's playing.`) +
          p(`Why the number? When a game matches, you and your partner need to reach each other. It's never shown publicly.`),
          { label: "Finish setup", url: `${ctx.app}/onboarding` },
          `— Oxy`),
      };
    case "digest": {
      const n = ctx.games?.length ?? 0;
      return {
        subject: n ? `This week on court: ${ctx.openCount ?? n} game${(ctx.openCount ?? n) === 1 ? "" : "s"} open` : "This week on court",
        html: frame(ctx, `This week on court, ${name}`,
          (n ? p(`Open games you could join${ctx.city ? ` around ${esc(ctx.city)}` : ""}:`) + gameList(ctx.games ?? []) : p(`Quiet week so far — post the first game and watch it fill.`)) +
          (ctx.installed === false
            ? p(`📲 <b>Tip:</b> you're reading this by email because Courtship isn't on your home screen yet. Add it (Safari → Share → Add to Home Screen; Chrome → ⋮ → Add to Home screen) and new games reach you as notifications.`)
            : ""),
          { label: n ? "See the board" : "Post a game", url: n ? board : `${ctx.app}/sos/new` },
          `Monday recap, once a week. Turn it off in <a href="${ctx.settingsUrl}" style="color:${WOOD}">Settings</a>. — Oxy`),
      };
    }
    default:
      return null;
  }
}

export const TEMPLATES = ["welcome_0", "welcome_1", "install_3", "community_7", "invite_14", "push_off", "fading", "sleeping", "unfinished", "digest"] as const;
