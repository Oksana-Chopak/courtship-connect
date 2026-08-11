import { defineTool } from "@lovable.dev/mcp-js";
import { supabaseForUser, textResult, errorResult } from "../supabase";

export default defineTool({
  name: "list_urgent_sos",
  title: "List urgent SOS games",
  description: "Urgent (SOS) tennis games the signed-in player is eligible to rescue, soonest first.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    if (!ctx.isAuthenticated()) return errorResult("Not authenticated");
    const supabase = supabaseForUser(ctx);
    const { data, error } = await (supabase as any).rpc("eligible_sos_for_me");
    if (error) return errorResult(error.message);
    return textResult({ games: data ?? [] });
  },
});
