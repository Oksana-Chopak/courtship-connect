import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Regression tests for the safePath() deep-link guard in src/lib/share.ts.
//
// safePath decides whether a "next" destination captured from a share / invite
// link may be redirected to after signup. The contract under test:
//   - only in-app absolute paths (single leading "/") pass through
//   - protocol-relative URLs ("//evil.com") are rejected  -> open-redirect guard
//   - absolute URLs, schemes, relative paths, and empty/null input are rejected
//
// Why not `import { ... } from "./share"`? Its module graph pulls in
// "@/integrations/supabase/client", which needs Vite env vars and the "@"
// path alias — neither exists under this bare vitest config, so the import
// chain explodes (verified). Instead we read share.ts from disk and evaluate
// the real safePath source: the function body is plain JS (only the signature
// carries TS types), so the shipped logic — not a reimplementation — is what
// runs here. If safePath is renamed or its body gains TS-only syntax, this
// test fails loudly at extraction time rather than silently testing nothing.

type SafePath = (p: string | null | undefined) => string | null;

function loadSafePath(): SafePath {
  const source = fs.readFileSync(
    path.join(path.dirname(fileURLToPath(import.meta.url)), "share.ts"),
    "utf8",
  );
  const m = source.match(/function safePath\s*\([^)]*\)[^{]*\{([\s\S]*?)\n\}/);
  if (!m) {
    throw new Error("share.ts: could not find `function safePath(...) {...}` — update this test");
  }
  // m[1] is the body ("return p && ... ? p : null;") — evaluate it as-is.
  return new Function("p", m[1]) as SafePath;
}

const safePath = loadSafePath();

describe("safePath (extracted from src/lib/share.ts)", () => {
  it("accepts in-app absolute paths unchanged", () => {
    expect(safePath("/")).toBe("/");
    expect(safePath("/sos/123")).toBe("/sos/123");
    expect(safePath("/sos/123?apply=1")).toBe("/sos/123?apply=1");
    expect(safePath("/g/abc-def?code=XYZ")).toBe("/g/abc-def?code=XYZ");
  });

  it("rejects protocol-relative URLs (open redirect)", () => {
    expect(safePath("//evil.com")).toBeNull();
    expect(safePath("//evil.com/phish?x=/sos/1")).toBeNull();
    expect(safePath("///evil.com")).toBeNull();
  });

  it("rejects absolute URLs and schemes", () => {
    expect(safePath("https://evil.com/")).toBeNull();
    expect(safePath("http://evil.com")).toBeNull();
    expect(safePath("javascript:alert(1)")).toBeNull();
    expect(safePath("mailto:x@y.z")).toBeNull();
  });

  it("rejects relative paths and junk", () => {
    expect(safePath("sos/123")).toBeNull();
    expect(safePath("evil.com/x")).toBeNull();
    expect(safePath(" /leading-space")).toBeNull();
  });

  it("rejects empty / null / undefined", () => {
    expect(safePath("")).toBeNull();
    expect(safePath(null)).toBeNull();
    expect(safePath(undefined)).toBeNull();
  });

  it("never returns a non-null value that could leave the app", () => {
    // Property-style sweep: whatever comes back is either null or a
    // single-slash in-app path.
    const inputs = [
      "/ok", "//nope", "https://x", "x", "", null, undefined, "/a//b", "//", "/",
    ];
    for (const input of inputs) {
      const out = safePath(input);
      if (out !== null) {
        expect(out.startsWith("/")).toBe(true);
        expect(out.startsWith("//")).toBe(false);
        expect(out).toBe(input); // passthrough, never rewritten
      }
    }
  });
});
