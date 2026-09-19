// Contract guard for the board's rescue cards (P0 found in the 2026-09-02 screen tour).
//
// The board Card decides EVERYTHING urgent from `sos.kind === "sos"` (red rail, 🚨,
// "Save this set" → claim_sos vs "I'm interested" → apply_to_game). The SQL function
// eligible_sos_for_me filters `kind = 'sos'` but has not RETURNED the column since
// the 2026-06-12 rewrite — so unless the client stamps it, every rescue renders as a
// planned game and applying returns not_applicable in a loop. This test pins both
// halves of that contract by reading the sources (no imports → runs on any config).
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");

/** Body of the LAST definition of a SQL function across migrations (file order = time order). */
function latestFunction(name: string): { file: string; body: string } | null {
  const dir = path.join(root, "supabase", "migrations");
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  let found: { file: string; body: string } | null = null;
  for (const f of files) {
    const src = fs.readFileSync(path.join(dir, f), "utf8");
    const re = new RegExp(`CREATE\\s+(?:OR\\s+REPLACE\\s+)?FUNCTION\\s+public\\.${name}\\s*\\([\\s\\S]*?\\$(?:function|\\w*)\\$;`, "gi");
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) found = { file: f, body: m[0] };
  }
  return found;
}

/** Column names inside `RETURNS TABLE( a type, b type, … )`. */
function returnedColumns(body: string): string[] {
  const m = body.match(/RETURNS\s+TABLE\s*\(([\s\S]*?)\)\s*(LANGUAGE|AS)/i);
  if (!m) return [];
  return m[1].split(",").map((c) => c.trim().split(/\s+/)[0]).filter(Boolean);
}

describe("board rescue cards: `kind` contract between SQL and client", () => {
  it("the client stamps kind on eligible_sos_for_me rows (the SQL is allowed to omit it)", () => {
    const sos = read("src/lib/sos.ts");
    const fn = sos.slice(sos.indexOf("export async function fetchEligibleSos"), sos.indexOf("export async function fetchOpenGames"));
    expect(fn).toMatch(/kind:\s*r\.kind\s*\?\?\s*"sos"/);
    const open = sos.slice(sos.indexOf("export async function fetchOpenGames"));
    expect(open.slice(0, open.indexOf("}\n"))).toMatch(/kind:\s*r\.kind\s*\?\?\s*"open"/);
  });

  it("documents the SQL reality: the latest eligible_sos_for_me filters kind='sos' and returns no kind column", () => {
    const def = latestFunction("eligible_sos_for_me");
    expect(def, "eligible_sos_for_me must exist in migrations").not.toBeNull();
    expect(def!.body).toMatch(/kind\s*=\s*'sos'/);
    // If a future migration starts returning `kind`, this assertion flips — update
    // the comment in fetchEligibleSos, the client stamp stays harmless.
    expect(returnedColumns(def!.body)).not.toContain("kind");
  });

  it("the board really does branch on sos.kind (the reason the stamp exists)", () => {
    const board = read("src/routes/_authenticated/board.tsx");
    expect(board).toMatch(/const isUrgent = sos\.kind === "sos"/);
  });
});
