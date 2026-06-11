import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

// Returns the phone number for the target profile, only to authenticated users.
// The phone never reaches the client through directory queries — only through this call.
export const getProfilePhone = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ targetId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await (context.supabase as any)
      .from("profiles")
      .select("phone_e164, name")
      .eq("id", data.targetId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Profile not found");
    return { phone: row.phone_e164 as string, name: row.name as string };
  });