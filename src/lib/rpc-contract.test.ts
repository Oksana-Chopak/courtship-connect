// Integration-shaped contract guard: every RPC the client calls must exist in
// the migrations, and every edge function the client invokes must exist on
// disk. This is the exact class of bug that has actually bitten this project
// (schema drift between Lovable deploys and externally-pushed client code).
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function walk(dir: string, exts: string[]): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p, exts));
    else if (exts.some((x) => e.name.endsWith(x))) out.push(p);
  }
  return out;
}

const CLIENT_FILES = walk(path.join(root, "src"), [".ts", ".tsx"]).filter((p) => !p.endsWith(".test.ts"));
const clientSrc = CLIENT_FILES.map((p) => fs.readFileSync(p, "utf8")).join("\n");

const MIGRATIONS = walk(path.join(root, "supabase", "migrations"), [".sql"])
  .map((p) => fs.readFileSync(p, "utf8"))
  .join("\n");

describe("client ↔ database contract", () => {
  const called = [...new Set([...clientSrc.matchAll(/\.rpc\(\s*["'`]([a-z0-9_]+)["'`]/gi)].map((m) => m[1]))].sort();
  const defined = new Set([...MIGRATIONS.matchAll(/function\s+(?:public\.)?([a-z0-9_]+)\s*\(/gi)].map((m) => m[1].toLowerCase()));

  it("found a realistic number of RPC call sites (sanity)", () => {
    expect(called.length).toBeGreaterThan(30);
  });

  it("every client RPC exists in migrations", () => {
    const missing = called.filter((n) => !defined.has(n));
    expect(missing, `RPCs called by the client but absent from migrations: ${missing.join(", ")}`).toEqual([]);
  });
});

describe("client ↔ edge functions contract", () => {
  const invoked = [...new Set([...clientSrc.matchAll(/functions\.invoke\(\s*["'`]([a-z0-9-]+)["'`]/gi)].map((m) => m[1]))].sort();
  const onDisk = new Set(
    fs.readdirSync(path.join(root, "supabase", "functions"), { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name),
  );

  it("every invoked edge function exists on disk", () => {
    const missing = invoked.filter((n) => !onDisk.has(n));
    expect(missing, `Edge functions invoked but not present: ${missing.join(", ")}`).toEqual([]);
  });

  it("email functions accept either provider key (Brevo or Resend)", () => {
    for (const fn of ["email-notify", "email-broadcast"]) {
      const src = fs.readFileSync(path.join(root, "supabase", "functions", fn, "index.ts"), "utf8");
      expect(src).toContain("BREVO_API_KEY");
      expect(src).toContain("RESEND_API_KEY");
      expect(src).toContain("!RESEND_KEY && !BREVO_KEY");
    }
  });
});
