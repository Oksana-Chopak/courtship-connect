import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, textResult, errorResult } from "../supabase";

export default defineTool({
  name: "apply_to_game",
  title: "Apply to a game",
  description: "Send an application (optionally a counter-proposed time) for a game on the board, as the signed-in player.",
  inputSchema: {
    game_id: z.string().describe("The id of the game (sos_requests.id) to apply to."),
    proposed_at: z.string().optional()
      .describe("Optional ISO timestamp counter-proposal, must fall inside the game's time window."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async ({ game_id, proposed_at }, ctx) => {
    if (!ctx.isAuthenticated()) return errorResult("Not authenticated");
    const supabase = supabaseForUser(ctx);
    const args = proposed_at ? { _sos_id: game_id, _proposed_at: proposed_at } : { _sos_id: game_id };
    const { data, error } = await (supabase as any).rpc("apply_to_game", args);
    if (error) return errorResult(error.message);
    return textResult({ ok: true, result: data });
  },
});
