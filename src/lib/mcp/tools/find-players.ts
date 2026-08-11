import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, textResult, errorResult } from "../supabase";

export default defineTool({
  name: "find_players",
  title: "Find players",
  description: "Suggested Courtship players for the signed-in user, ranked by district, level and availability overlap.",
  inputSchema: { limit: z.number().int().optional().describe("How many players to return. Defaults to 15.") },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ limit }, ctx) => {
    if (!ctx.isAuthenticated()) return errorResult("Not authenticated");
    const supabase = supabaseForUser(ctx);
    const { data, error } = await (supabase as any).rpc("swipe_deck");
    if (error) return errorResult(error.message);
    const rows = Array.isArray(data) ? data.slice(0, Math.max(1, Math.min(limit ?? 15, 50))) : [];
    return textResult({ players: rows });
  },
});
