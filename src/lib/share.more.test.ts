// @vitest-environment jsdom
// Deep-link memory, invite links and the share/copy fallback chain — the
// "dead button is never OK" contract (2026-08-08 incident) pinned as tests.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const rpcMock = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (...a: unknown[]) => rpcMock(...a) },
}));
const toastSuccess = vi.fn();
const toastErr = vi.fn();
vi.mock("@/lib/toast", () => ({ toast: { success: (...a: unknown[]) => toastSuccess(...a), error: (...a: unknown[]) => toastErr(...a) } }));

import { rememberNext, consumeNext, myInviteLink, shareInvite, shareTo, copyText, shareMessage, myGameShareLink, myEventShareLink } from "./share";

beforeEach(() => {
  localStorage.clear();
  rpcMock.mockReset();
  toastSuccess.mockClear();
  toastErr.mockClear();
});
afterEach(() => {
  delete (navigator as unknown as Record<string, unknown>).share;
});

describe("rememberNext / consumeNext (open-redirect guard)", () => {
  it("keeps in-app paths, one-shot", () => {
    rememberNext("/sos/1?apply=1");
    expect(consumeNext()).toBe("/sos/1?apply=1");
    expect(consumeNext()).toBeNull();
  });
  it("rejects protocol-relative, absolute and junk destinations", () => {
    for (const bad of ["//evil.com", "https://evil.com", "board", "", null, undefined]) {
      rememberNext(bad as string | null | undefined);
      expect(consumeNext()).toBeNull();
    }
  });
  it("survives storage explosions silently", () => {
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); });
    expect(() => rememberNext("/x")).not.toThrow();
    spy.mockRestore();
    const spy2 = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("denied"); });
    expect(consumeNext()).toBeNull();
    spy2.mockRestore();
  });
});

describe("myInviteLink / myGameShareLink", () => {
  it("builds /auth?code=…&next=… keeping only safe next", async () => {
    rpcMock.mockResolvedValue({ data: "ABC123" });
    const link = await myInviteLink("/sos/9");
    const u = new URL(link);
    expect(u.pathname).toBe("/auth");
    expect(u.searchParams.get("code")).toBe("ABC123");
    expect(u.searchParams.get("next")).toBe("/sos/9");
    const noNext = await myInviteLink("https://evil.com");
    expect(new URL(noNext).searchParams.get("next")).toBeNull();
  });
  it("falls back to the bare origin when the code RPC fails or is empty", async () => {
    rpcMock.mockRejectedValueOnce(new Error("net"));
    expect(await myInviteLink()).toBe(window.location.origin);
    rpcMock.mockResolvedValueOnce({ data: null });
    expect(await myInviteLink()).toBe(window.location.origin);
  });
  it("game share link carries the encoded code when available", async () => {
    rpcMock.mockResolvedValueOnce({ data: "A B" });
    expect(await myGameShareLink("g1")).toBe(`${window.location.origin}/g/g1?code=A%20B`);
    rpcMock.mockRejectedValueOnce(new Error("x"));
    expect(await myGameShareLink("g2")).toBe(`${window.location.origin}/g/g2`);
  });
  it("event share link lands on the PUBLIC event page /e/<id> (never /events, which has no route)", async () => {
    rpcMock.mockResolvedValueOnce({ data: "ZZ9" });
    expect(await myEventShareLink("e1")).toBe(`${window.location.origin}/e/e1?code=ZZ9`);
    rpcMock.mockResolvedValueOnce({ data: null });
    expect(await myEventShareLink("e2")).toBe(`${window.location.origin}/e/e2`);
  });
});

describe("shareInvite / shareTo", () => {
  it("replaces {link} and {code} and routes through the share sheet", async () => {
    rpcMock.mockResolvedValue({ data: "ZZZ" });
    const share = vi.fn().mockResolvedValue(undefined);
    (navigator as unknown as Record<string, unknown>).share = share;
    await shareInvite("Join: {link} code {code}", "copied");
    const sent = share.mock.calls[0][0].text as string;
    expect(sent).toContain("code=ZZZ");
    expect(sent).toContain("code ZZZ");
  });
  it("shareTo appends the link if the template lost its placeholder", async () => {
    rpcMock.mockResolvedValue({ data: "QQ" });
    const share = vi.fn().mockResolvedValue(undefined);
    (navigator as unknown as Record<string, unknown>).share = share;
    await shareTo("/events", "Come play!", "copied");
    const sent = share.mock.calls[0][0].text as string;
    expect(sent.startsWith("Come play! http")).toBe(true);
  });
});

describe("copyText fallback chain", () => {
  it("async clipboard success → toast", async () => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
    await copyText("hello", "copied!");
    expect(toastSuccess).toHaveBeenCalledWith("copied!");
  });
  it("clipboard denied → legacy execCommand copy → toast", async () => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) } });
    (document as Document & { execCommand?: unknown }).execCommand = vi.fn().mockReturnValue(true);
    await copyText("hello", "copied!");
    expect(toastSuccess).toHaveBeenCalledWith("copied!");
  });
  it("everything denied → window.prompt as the last resort", async () => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) } });
    (document as Document & { execCommand?: unknown }).execCommand = vi.fn().mockReturnValue(false);
    const prompt = vi.spyOn(window, "prompt").mockReturnValue(null);
    await copyText("hello", "copied!");
    expect(prompt).toHaveBeenCalled();
    prompt.mockRestore();
  });
  it("prompt blocked too → error toast with the text (still visible)", async () => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) } });
    (document as Document & { execCommand?: unknown }).execCommand = vi.fn(() => { throw new Error("no exec"); });
    const prompt = vi.spyOn(window, "prompt").mockImplementation(() => { throw new Error("blocked"); });
    await copyText("hello", "copied!");
    expect(toastErr).toHaveBeenCalledWith("hello");
    prompt.mockRestore();
  });
});

describe("shareMessage (the 2026-08-08 dead-button contract)", () => {
  it("native share success → silent", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    (navigator as unknown as Record<string, unknown>).share = share;
    await shareMessage("msg", "copied");
    expect(share).toHaveBeenCalledWith({ text: "msg" });
    expect(toastSuccess).not.toHaveBeenCalled();
  });
  it("user cancel (AbortError) stays silent — no copy, no toast", async () => {
    const e = new Error("cancel"); e.name = "AbortError";
    (navigator as unknown as Record<string, unknown>).share = vi.fn().mockRejectedValue(e);
    await shareMessage("msg", "copied");
    expect(toastSuccess).not.toHaveBeenCalled();
  });
  it("NotAllowedError (cross-origin iframe) falls through to the clipboard", async () => {
    const e = new Error("iframe"); e.name = "NotAllowedError";
    (navigator as unknown as Record<string, unknown>).share = vi.fn().mockRejectedValue(e);
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
    await shareMessage("msg", "copied");
    expect(toastSuccess).toHaveBeenCalledWith("copied");
  });
  it("no navigator.share at all → straight to the clipboard", async () => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
    await shareMessage("msg", "copied");
    expect(toastSuccess).toHaveBeenCalledWith("copied");
  });
});

describe("straggler arms", () => {
  it("a code-less (bare origin) invite link still shares fine", async () => {
    rpcMock.mockRejectedValue(new Error("net"));
    const share = vi.fn().mockResolvedValue(undefined);
    (navigator as unknown as Record<string, unknown>).share = share;
    await shareInvite("m {link} c={code}", "copied");
    expect((share.mock.calls[0][0].text as string)).toContain("c=");
  });
  it("game link treats undefined rpc data as no code", async () => {
    rpcMock.mockResolvedValueOnce({ data: undefined });
    expect(await myGameShareLink("g3")).toBe(`${window.location.origin}/g/g3`);
  });
});
