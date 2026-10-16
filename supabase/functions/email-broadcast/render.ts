// Supabase Edge Function: email-broadcast — rendering (pure; no Deno APIs).
//
// The admin writes PLAIN TEXT in Admin → Email broadcast. This file turns it
// into the brand frame (cream/ink, Courtship tone) using a few plain-text
// conventions, so a broadcast can look like the lifecycle emails without an
// HTML editor (2026-10-16, Oxy's first real blast):
//   blank line              → new paragraph
//   # Rubrik                → heading (one line)
//   **fet**                 → bold
//   ---                     → the "In English" divider (Swedish above, English
//                             below — the layout Oxy set on 2026-10-05)
//   [Boka plats](https://…) → link; a paragraph that is ONLY a link → coral button
//   https://…               → a bare link is clickable too
// Everything else is escaped text: pasted content can never inject HTML.
// No Deno APIs here on purpose — the unit test (src/lib/broadcast-render.test.ts)
// and the preview render through exactly the code the function sends.

export type Contact = { name: string; whatsapp: string; email: string };

export const APP = "https://court-ship.com";
const CORAL = "#F0705B";
const INK = "#2B2118";
const CREAM = "#F6F0E1";
const CARD = "#FDF9EE";
const WOOD = "#8C5A33";
const ARIAL = "font-family:Arial,Helvetica,sans-serif";

export function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function anchor(href: string, label: string): string {
  return `<a href="${esc(href)}" style="color:${CORAL};font-weight:bold">${esc(label)}</a>`;
}

// [label](https://url) | https://bare.url — only http(s), so a pasted
// "javascript:" can never become a link.
const LINK = /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<>]+)/g;
const ONLY_LINK = /^\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)$/;

/** One paragraph's text → escaped HTML with links and **bold**; newlines are kept for <br>. */
export function inline(text: string): string {
  let out = "";
  let last = 0;
  for (const m of text.matchAll(LINK)) {
    const at = m.index ?? 0;
    out += esc(text.slice(last, at));
    if (m[1]) out += anchor(m[2], m[1]);
    else {
      // a bare link at the end of a sentence keeps its punctuation outside
      const trail = m[3].match(/[.,;:!?)]+$/)?.[0] ?? "";
      const url = m[3].slice(0, m[3].length - trail.length);
      out += anchor(url, url.replace(/^https?:\/\//, "")) + esc(trail);
    }
    last = at + m[0].length;
  }
  out += esc(text.slice(last));
  // **bold** — on the escaped text, so the markers can only ever wrap text (or a link)
  return out.replace(/\*\*([^*\n]+?)\*\*/g, "<b>$1</b>");
}

function heading(text: string): string {
  return `<div style="font-family:Georgia,serif;font-size:19px;font-weight:bold;margin:20px 0 10px;color:${INK}">${inline(text)}</div>`;
}

function button(href: string, label: string): string {
  return `<div style="margin:4px 0 18px"><a href="${esc(href)}" style="display:inline-block;background:${CORAL};color:#FFF6E8;${ARIAL};font-weight:bold;font-size:16px;text-decoration:none;border:2px solid ${INK};border-radius:12px;padding:12px 20px">${esc(label)}</a></div>`;
}

function divider(label: string): string {
  return `<div style="margin:22px 0 14px;border-top:1px solid rgba(43,33,24,.15);text-align:center"><span style="position:relative;top:-9px;background:${CARD};padding:0 10px;${ARIAL};font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:${WOOD}">${esc(label)}</span></div>`;
}

function paragraph(p: string): string {
  const s = p.trim();
  if (/^-{3,}$/.test(s)) return divider("In English");
  if (/^#\s+\S/.test(s) && !s.includes("\n")) return heading(s.replace(/^#\s+/, ""));
  const only = s.match(ONLY_LINK);
  if (only) return button(only[2], only[1]);
  return `<p style="margin:0 0 14px;line-height:1.55;">${inline(s).replace(/\n/g, "<br>")}</p>`;
}

/** Plain text (as typed in Admin) → the inner HTML of the card. */
export function renderBody(bodyText: string): string {
  return bodyText.replace(/\r\n?/g, "\n").trim().split(/\n{2,}/).map(paragraph).join("");
}

/** Who signs and how players reach her — same block as the lifecycle emails. */
export function contactBlock(c: Contact): string {
  const wa = `https://wa.me/${c.whatsapp}?text=${encodeURIComponent(`Hej ${c.name}! `)}`;
  return `<div style="margin-top:18px;padding-top:12px;border-top:1px solid rgba(43,33,24,.15);${ARIAL};font-size:13.5px;line-height:1.5">
      <div style="font-weight:bold">Frågor? Skriv direkt till mig · Questions? Write to me directly</div>
      <div style="margin-top:8px"><a href="${wa}" style="display:inline-block;border:2px solid ${INK};border-radius:10px;padding:7px 12px;color:${INK};font-weight:bold;text-decoration:none;background:#fff">💬 WhatsApp</a>
        <span style="color:${WOOD}">&nbsp;·&nbsp;</span><a href="mailto:${esc(c.email)}" style="color:${INK};font-weight:bold">${esc(c.email)}</a></div>
      <div style="margin-top:8px;font-family:Georgia,serif;font-size:14px">— ${esc(c.name)}, Courtship</div>
    </div>`;
}

/** The whole email: brand frame around the rendered body + contact + footer. */
export function html(bodyText: string, unsubUrl: string, c: Contact): string {
  return `<!doctype html><html><body style="margin:0;padding:0;background:${CREAM};">
  <div style="max-width:560px;margin:0 auto;padding:28px 20px;font-family:Georgia,serif;color:${INK};">
    <div style="font-size:22px;font-weight:bold;margin-bottom:18px;">🎾 Courtship</div>
    <div style="background:${CARD};border:2px solid ${INK};border-radius:14px;padding:22px;${ARIAL};font-size:15px;">
      ${renderBody(bodyText)}
      ${contactBlock(c)}
    </div>
    <p style="font-size:12px;color:${WOOD};margin-top:16px;${ARIAL};line-height:1.5">
      Du får det här för att du har ett Courtship-konto. Svara på mejlet så når du ${esc(c.name)} direkt.
      <a href="${esc(unsubUrl)}" style="color:${WOOD}">Avsluta prenumeration</a> · <a href="${APP}/settings" style="color:${WOOD}">Inställningar</a><br>
      You're getting this because you have a Courtship account. Reply to this email to reach ${esc(c.name)} directly.
      <a href="${esc(unsubUrl)}" style="color:${WOOD}">Unsubscribe</a> · <a href="${APP}/settings" style="color:${WOOD}">Settings</a>
    </p>
  </div></body></html>`;
}
