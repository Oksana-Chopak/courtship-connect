import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// i18n completeness guard.
//
// A recent audit found two keys that were used in the UI but missing from the
// dictionaries ("post.mode_planned_word", "sos.claimed_toast") — users saw the
// raw key instead of copy. Both are fixed; this test keeps the whole class of
// bug out for good:
//
//   1. Every literal key passed to the i18n `t` function anywhere under src/
//      must exist in BOTH the `en` and `sv` dictionaries.
//   2. `en` and `sv` must have identical key sets (no drift between languages).
//
// We deliberately do NOT import src/lib/i18n.tsx — its module graph pulls in
// the supabase client, which needs Vite env vars and the "@" path alias
// (neither is available under this bare vitest config). Instead we read the
// file from disk and evaluate just the two flat object literals. Both dicts
// are flat `"key": "value"` maps (values may contain escaped quotes), so the
// sliced text is a plain JS object literal and evaluates safely.

const LIB_DIR = path.dirname(fileURLToPath(import.meta.url));
const SRC_ROOT = path.resolve(LIB_DIR, "..");
const I18N_FILE = path.join(LIB_DIR, "i18n.tsx");

// Keys the scanner finds in use but that are KNOWN to be missing from the
// dictionaries. Must stay empty — add a key here only as a stopgap while the
// dictionary fix lands, with a TODO naming it.
// TODO: (none — all scanned keys currently exist in both en and sv)
const MISSING_KEY_ALLOWLIST: string[] = [];

// ---------------------------------------------------------------------------
// Dictionary extraction
// ---------------------------------------------------------------------------

function extractDict(source: string, name: "en" | "sv"): Record<string, string> {
  const marker = `const ${name}: Dict = {`;
  const start = source.indexOf(marker);
  if (start === -1) {
    throw new Error(`i18n.tsx: could not find "${marker}" — update this test's extractor`);
  }
  const open = start + marker.length - 1; // index of "{"
  // Dicts are flat (Dict = Record<string, string>), so the first line that is
  // exactly "};" closes the literal. Values are single-line strings and can
  // never contain a raw newline, so this cannot fire early.
  const end = source.indexOf("\n};", open);
  if (end === -1) {
    throw new Error(`i18n.tsx: could not find the closing "};" for "${name}"`);
  }
  const objectLiteral = source.slice(open, end + 2);
  // The slice is a plain JS object literal (string keys/values + comments):
  // evaluating it handles escaped quotes, unicode, etc. exactly like the app.
  const dict = new Function(`"use strict"; return (${objectLiteral});`)();
  if (typeof dict !== "object" || dict === null) {
    throw new Error(`i18n.tsx: "${name}" did not evaluate to an object`);
  }
  return dict as Record<string, string>;
}

const i18nSource = fs.readFileSync(I18N_FILE, "utf8");
const en = extractDict(i18nSource, "en");
const sv = extractDict(i18nSource, "sv");

// ---------------------------------------------------------------------------
// Usage scan: literal first-arg keys of t(...) calls across src/**/*.{ts,tsx}
// ---------------------------------------------------------------------------

function* walk(dir: string): Generator<string> {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (/\.(ts|tsx)$/.test(entry.name)) yield full;
  }
}

// A t-call whose first argument is a plain string literal. The lookbehind
// keeps identifiers that merely END in t (it, expect, alert, parseInt, obj.t)
// from matching. The trailing lookahead for "," or ")" skips concatenation
// like t("ct." + v) — dynamic keys are out of scope for this guard, as are
// variable/ternary first args.
const QUOTED_CALL = /(?<![\w$.])t\(\s*(["'])((?:\\.|(?!\1)[^\\\n])*)\1\s*(?=[,)])/g;
// Backtick form; ${...} interpolation is filtered out below.
const TEMPLATE_CALL = /(?<![\w$.])t\(\s*`((?:\\.|[^`\\])*)`\s*(?=[,)])/g;

/** Map of used key -> locations ("relative/file.tsx:line") for readable failures. */
function scanUsedKeys(): Map<string, string[]> {
  const used = new Map<string, string[]>();
  for (const file of walk(SRC_ROOT)) {
    const text = fs.readFileSync(file, "utf8");
    for (const re of [QUOTED_CALL, TEMPLATE_CALL]) {
      re.lastIndex = 0;
      for (const m of text.matchAll(re)) {
        const raw = m[2] ?? m[1];
        if (re === TEMPLATE_CALL && raw.includes("${")) continue; // dynamic key — skip
        const key = raw.replace(/\\(.)/g, "$1"); // unescape \" etc.
        const line = text.slice(0, m.index).split("\n").length;
        const loc = `${path.relative(SRC_ROOT, file)}:${line}`;
        const locs = used.get(key);
        if (locs) locs.push(loc);
        else used.set(key, [loc]);
      }
    }
  }
  return used;
}

const usedKeys = scanUsedKeys();

// ---------------------------------------------------------------------------
// Assertions
// ---------------------------------------------------------------------------

describe("i18n dictionaries", () => {
  it("extracts substantial en and sv dictionaries (extractor sanity)", () => {
    // Invariant floor, not an exact count: a broken extractor yields 0 keys.
    expect(Object.keys(en).length).toBeGreaterThan(100);
    expect(Object.keys(sv).length).toBeGreaterThan(100);
    for (const [k, v] of Object.entries(en)) {
      expect(typeof k).toBe("string");
      expect(typeof v).toBe("string");
    }
  });

  it("en and sv have identical key sets (no drift)", () => {
    const enOnly = Object.keys(en).filter((k) => !(k in sv));
    const svOnly = Object.keys(sv).filter((k) => !(k in en));
    expect(enOnly, `keys present in en but missing in sv: ${enOnly.join(", ")}`).toEqual([]);
    expect(svOnly, `keys present in sv but missing in en: ${svOnly.join(", ")}`).toEqual([]);
  });
});

describe("i18n usage completeness", () => {
  it("the scan actually finds keys (scanner sanity)", () => {
    // The app has hundreds of literal t-calls; near-zero means the regex broke,
    // which would make the completeness check below pass vacuously.
    expect(usedKeys.size).toBeGreaterThan(100);
  });

  it("every literal key used in src/ exists in BOTH en and sv", () => {
    const allow = new Set(MISSING_KEY_ALLOWLIST);
    const problems: string[] = [];
    for (const [key, locs] of usedKeys) {
      if (allow.has(key)) continue;
      const inEn = key in en;
      const inSv = key in sv;
      if (!inEn || !inSv) {
        const where = locs.slice(0, 3).join(", ") + (locs.length > 3 ? ", …" : "");
        problems.push(
          `"${key}" missing in ${!inEn && !inSv ? "en AND sv" : !inEn ? "en" : "sv"} (used at ${where})`,
        );
      }
    }
    expect(problems, `untranslated keys:\n  ${problems.join("\n  ")}`).toEqual([]);
  });

  it("allowlist only contains keys that are still genuinely missing", () => {
    // Keeps the allowlist honest: once a key is added to both dicts, it must
    // be removed from MISSING_KEY_ALLOWLIST.
    const stale = MISSING_KEY_ALLOWLIST.filter((k) => k in en && k in sv);
    expect(stale, `fixed keys still allowlisted: ${stale.join(", ")}`).toEqual([]);
  });
});
