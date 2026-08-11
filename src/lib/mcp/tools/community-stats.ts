import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, textResult, errorResult } from "../supabase";

export default defineTool({
  name: "community_stats",
  title: "Community stats",
  description: "Aggregate Courtship community stats (players, games, activity), optionally for one city.",
  inputSchema: { city: z.string().optional().describe("City name, e.g. Stockholm. Omit for all cities.") },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ city }, ctx) => {
    if (!ctx.isAuthenticated()) return errorResult("Not authenticated");
    const supabase = supabaseForUser(ctx);
    const { data, error } = await (supabase as any).rpc("community_stats", { _city: city ?? null });
    if (error) return errorResult(error.message);
    return textResult(data ?? {});
  },
});
