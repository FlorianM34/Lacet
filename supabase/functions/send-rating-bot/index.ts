import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { hike_id } = await req.json();
    if (!hike_id) throw new Error("Missing hike_id");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const db = createClient(supabaseUrl, serviceKey);

    // Fetch confirmed participants with push tokens
    const { data: participations, error: pErr } = await db
      .from("participation")
      .select("user_id, user:user!user_id(id, display_name, expo_push_token)")
      .eq("hike_id", hike_id)
      .eq("status", "confirmed");

    if (pErr) throw pErr;

    const members = (participations ?? []).map((p: any) => ({
      id: p.user_id,
      display_name: p.user?.display_name ?? "Inconnu",
      expo_push_token: p.user?.expo_push_token ?? null,
    }));

    const participantIds = members.map((m: any) => m.id);

    // Insert the rating bot message in the group chat
    await db.from("group_message").insert({
      hike_id,
      sender_id: null,
      is_system: true,
      content: JSON.stringify({
        type: "rating_bot",
        participant_ids: participantIds,
        message:
          "La randonnée est terminée ! Prenez 30 secondes pour noter vos compagnons — ça aide toute la communauté.",
      }),
    });

    // Send push notifications to all members
    const tokens = members
      .map((m: any) => m.expo_push_token)
      .filter((t: any) => t && t.startsWith("ExponentPushToken["));

    if (tokens.length > 0) {
      const messages = tokens.map((token: string) => ({
        to: token,
        sound: "default",
        title: "La randonnée est terminée ! 🏔️",
        body: "Notez vos compagnons de route pour aider la communauté.",
        data: { hikeId: hike_id, type: "rating_bot" },
      }));

      // Send in chunks of 100 (Expo limit)
      for (let i = 0; i < messages.length; i += 100) {
        await fetch("https://exp.host/--/api/v2/push/send", {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify(messages.slice(i, i + 100)),
        });
      }
    }

    // ── Evaluate badges for all members in parallel ──
    await Promise.all(
      participantIds.map((uid: string) =>
        fetch(`${supabaseUrl}/functions/v1/evaluate-badges`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({ user_id: uid }),
        }).catch(() => null) // fire-and-forget, ignore individual failures
      )
    );

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    // Always return 200 to avoid pg_net retry spam
    return new Response(JSON.stringify({ error: message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  }
});
