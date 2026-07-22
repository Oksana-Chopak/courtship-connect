import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * City districts/areas for profile targeting ("Stockholm is big" — real group
 * posts ask for Lidingö / Huddinge / Kärrtorp, not "Stockholm"). Data-driven
 * from public.city_areas (same pattern as cities.ts), with a static fallback
 * so the wizard renders even before the SQL batch is applied.
 */
export const FALLBACK_AREAS: Record<string, string[]> = {
  Stockholm: [
    "Lidingö", "Täby", "Danderyd", "Sollentuna", "Upplands Väsby", "Vallentuna",
    "Solna/Sundbyberg", "Bromma", "Kungsholmen", "Vasastan/City", "Östermalm",
    "Södermalm", "Nacka", "Enskede/Kärrtorp", "Farsta", "Huddinge",
  ],
  Uppsala: [
    "Centrum", "Luthagen", "Fyrishov", "Gränby", "Kåbo/Studenternas",
    "Gottsunda", "Sävja", "Stenhagen",
  ],
};

let _cache: Record<string, string[]> | null = null;
let _inflight: Promise<Record<string, string[]>> | null = null;

export async function fetchCityAreas(): Promise<Record<string, string[]>> {
  if (_cache) return _cache;
  if (_inflight) return _inflight;
  _inflight = (async () => {
    try {
      const { data } = await (supabase as any)
        .from("city_areas")
        .select("city,area,sort")
        .order("city")
        .order("sort");
      const rows = (data as { city: string; area: string }[] | null) ?? [];
      if (rows.length) {
        const m: Record<string, string[]> = {};
        for (const r of rows) (m[r.city] ??= []).push(r.area);
        _cache = m;
        return m;
      }
    } catch { /* pre-SQL — fall back */ }
    return FALLBACK_AREAS;
  })();
  const out = await _inflight;
  _inflight = null;
  return out;
}

/** Map of city → ordered area list; starts with the fallback, swaps in DB data. */
export function useCityAreas(): Record<string, string[]> {
  const [m, setM] = useState<Record<string, string[]>>(FALLBACK_AREAS);
  useEffect(() => { void fetchCityAreas().then(setM); }, []);
  return m;
}
