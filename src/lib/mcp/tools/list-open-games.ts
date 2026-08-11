import { defineTool } from "@lovable.dev/mcp-js";
import { supabaseForUser, textResult, errorResult } from "../supabase";

export default defineTool({
  name: "list_open_games",
  title: "List open planned games",
  description: "Planned (non-urgent) games on the board that the signed-in player can apply to.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    if (!ctx.isAuthenticated()) return errorResult("Not authenticated");
    const supabase = supabaseForUser(ctx);
    const { data, error } = await (supabase as any).rpc("eligible_open_games_for_me");
    if (error) return errorResult(error.message);
    return textResult({ games: data ?? [] });
  },
});
