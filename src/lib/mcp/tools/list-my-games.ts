import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, textResult, errorResult } from "../supabase";

export default defineTool({
  name: "list_my_games",
  title: "List my posted games",
  description: "Games the signed-in player posted, newest first, with status, time, spots and court.",
  inputSchema: {
    status: z.enum(["active", "filled", "cancelled", "expired", "any"]).optional()
      .describe("Filter by game status. Defaults to active."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ status }, ctx) => {
    if (!ctx.isAuthenticated()) return errorResult("Not authenticated");
    const supabase = supabaseForUser(ctx);
    let query = (supabase as any)
      .from("sos_requests")
      .select("id,kind,status,sport,play_at,play_until,level_min,level_max,spots_needed,spots_filled,court_id,court_type,booking_link,created_at")
      .eq("caller_id", ctx.getUserId())
      .order("play_at", { ascending: false })
      .limit(50);
    const wanted = status ?? "active";
    if (wanted !== "any") query = query.eq("status", wanted);
    const { data, error } = await query;
    if (error) return errorResult(error.message);
    return textResult({ games: data ?? [] });
  },
});
