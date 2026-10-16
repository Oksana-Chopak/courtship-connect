// The Admin → Email broadcast renderer (supabase/functions/email-broadcast/render.ts)
// is pure TypeScript shared with the edge function, so the exact HTML a member
// receives is tested here, under vitest, without Deno.
import { describe, expect, it } from "vitest";
import { APP, contactBlock, esc, html, inline, renderBody } from "../../supabase/functions/email-broadcast/render";

const OKSANA = { name: "Oksana", whatsapp: "46700266274", email: "oksana.chopak@gmail.com" };

describe("inline", () => {
  it("escapes HTML so pasted text can never inject markup", () => {
    expect(inline(`<b>hi</b> & "q"`)).toBe("&lt;b&gt;hi&lt;/b&gt; &amp; &quot;q&quot;");
    expect(esc("a<b")).toBe("a&lt;b");
  });
  it("turns [Text](https://…) into a coral link with the text", () => {
    const out = inline("Boka: [Boka plats →](https://court-ship.com/e/abc) nu");
    expect(out).toContain(`<a href="https://court-ship.com/e/abc"`);
    expect(out).toContain(">Boka plats →</a>");
    expect(out.startsWith("Boka: ")).toBe(true);
    expect(out.endsWith(" nu")).toBe(true);
  });
  it("links a bare URL (label without the scheme) and keeps sentence punctuation outside", () => {
    const out = inline("Se https://court-ship.com/board.");
    expect(out).toBe(`Se <a href="https://court-ship.com/board" style="color:#F0705B;font-weight:bold">court-ship.com/board</a>.`);
  });
  it("never links javascript: or non-http schemes", () => {
    expect(inline("[x](javascript:alert(1))")).toBe("[x](javascript:alert(1))");
    expect(inline("mailto:a@b.c")).toBe("mailto:a@b.c");
  });
  it("keeps newlines for the paragraph's <br>", () => {
    expect(inline("a\nb")).toBe("a\nb");
  });
  it("**bold** wraps text or a link; a lone ** or a span across lines stays literal", () => {
    expect(inline("**Mystery Saturday** · 150 kr")).toBe("<b>Mystery Saturday</b> · 150 kr");
    expect(inline("**[tavlan](https://court-ship.com/board)**")).toBe(`<b><a href="https://court-ship.com/board" style="color:#F0705B;font-weight:bold">tavlan</a></b>`);
    expect(inline("a ** b")).toBe("a ** b");
    expect(inline("**a\nb**")).toBe("**a\nb**");
  });
});

describe("renderBody", () => {
  it("blank line = paragraph, single newline = <br>", () => {
    expect(renderBody("Hej!\n\nRad 1\nRad 2")).toBe(
      `<p style="margin:0 0 14px;line-height:1.55;">Hej!</p><p style="margin:0 0 14px;line-height:1.55;">Rad 1<br>Rad 2</p>`,
    );
  });
  it("# Heading on its own line becomes a heading; a # inside prose does not", () => {
    const out = renderBody("# Uppsala\n\nTabell #1");
    expect(out).toMatch(/^<div style="font-family:Georgia[^>]*>Uppsala<\/div>/);
    expect(out).toContain("<p style=\"margin:0 0 14px;line-height:1.55;\">Tabell #1</p>");
    expect(renderBody("# two\nlines")).toContain("<p ");
    expect(renderBody("#nospace")).toContain("<p ");
  });
  it("--- becomes the In English divider", () => {
    const out = renderBody("Svenska\n\n---\n\nEnglish");
    expect(out).toContain("In English");
    expect(out).toContain("border-top:1px solid rgba(43,33,24,.15)");
    expect(out.indexOf("Svenska")).toBeLessThan(out.indexOf("In English"));
    expect(out.indexOf("In English")).toBeLessThan(out.indexOf("English</p>"));
  });
  it("a paragraph that is only a link becomes the coral button; a link inside prose stays a link", () => {
    const out = renderBody("[Se tavlan](https://court-ship.com/board)\n\nMer på [tavlan](https://court-ship.com/board).");
    expect(out).toContain(`background:#F0705B;color:#FFF6E8`);
    expect(out).toContain(">Se tavlan</a></div>");
    expect(out.match(/background:#F0705B/g)?.length).toBe(1);
    expect(out).toContain(`Mer på <a href="https://court-ship.com/board" style="color:#F0705B;font-weight:bold">tavlan</a>.`);
  });
  it("tolerates Windows line endings and outer whitespace", () => {
    expect(renderBody("\r\n a\r\n\r\nb \r\n")).toBe(renderBody("a\n\nb"));
  });
});

describe("html", () => {
  const out = html("Hej!\n\n[Se tavlan](https://court-ship.com/board)\n\n---\n\nHi!", "https://court-ship.com/unsubscribe?token=T", OKSANA);
  it("wraps the body in the brand frame with the contact block and the bilingual footer", () => {
    expect(out.startsWith("<!doctype html>")).toBe(true);
    expect(out).toContain("🎾 Courtship");
    expect(out).toContain("Hej!");
    expect(out).toContain("In English");
    expect(out).toContain("Hi!");
    expect(out).toContain("Avsluta prenumeration");
    expect(out).toContain("Unsubscribe");
    expect(out).toContain(`href="https://court-ship.com/unsubscribe?token=T"`);
    expect(out).toContain(`${APP}/settings`);
  });
  it("signs as Oksana with a WhatsApp button and her email", () => {
    expect(out).toContain("— Oksana, Courtship");
    expect(out).toContain("https://wa.me/46700266274?text=Hej%20Oksana!%20");
    expect(out).toContain("mailto:oksana.chopak@gmail.com");
    expect(out).toContain("💬 WhatsApp");
    expect(contactBlock(OKSANA)).toContain("Frågor? Skriv direkt till mig · Questions? Write to me directly");
  });
  it("Swedish footer line comes before the English one", () => {
    expect(out.indexOf("Du får det här")).toBeLessThan(out.indexOf("You're getting this"));
  });
});
