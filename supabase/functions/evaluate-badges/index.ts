import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Appelle fn_evaluate_badges_for_user() définie en migration 010.
// La logique badge vit en SQL — l'edge function sert uniquement
// à déclencher la notification push après l'évaluation.

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { user_id } = await req.json();
    if (!user_id) throw new Error("Missing user_id");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const db = createClient(supabaseUrl, serviceKey);

    // ── 1. Badges avant évaluation ──
    const { data: before } = await db
      .from("user_badge")
      .select("badge_id")
      .eq("user_id", user_id);
    const beforeIds = new Set((before ?? []).map((b: any) => b.badge_id));

    // ── 2. Évaluer via la fonction SQL ──
    await db.rpc("fn_evaluate_badges_for_user", { p_user_id: user_id });

    // ── 3. Badges après évaluation → trouver les nouveaux ──
    const { data: after } = await db
      .from("user_badge")
      .select("badge_id")
      .eq("user_id", user_id);
    const newBadgeIds = (after ?? [])
      .map((b: any) => b.badge_id)
      .filter((id: string) => !beforeIds.has(id));

    if (newBadgeIds.length === 0) {
      return new Response(JSON.stringify({ success: true, new: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // Labels pour les notifications (miroir de lib/badges.ts)
    const BADGE_LABELS: Record<string, string> = {
      distance_bronze: "Randonneur",
      distance_silver: "Explorateur",
      distance_gold:   "Baroudeur",
      hikes_bronze:    "Première sortie",
      hikes_silver:    "Habitué",
      hikes_gold:      "Vétéran",
      orga_bronze:     "Initiateur",
      orga_silver:     "Guide",
      orga_gold:       "Chef de cordée",
    };

    // ── 4. Push notification pour chaque nouveau badge ──
    const { data: userData } = await db
      .from("user")
      .select("expo_push_token")
      .eq("id", user_id)
      .single();

    const token = (userData as any)?.expo_push_token;
    if (token && token.startsWith("ExponentPushToken[")) {
      const messages = newBadgeIds.map((id: string) => ({
        to: token,
        sound: "default",
        title: "Nouveau badge débloqué !",
        body: `Tu viens de gagner le badge ${BADGE_LABELS[id] ?? id} 🎖`,
        data: { screen: "profile" },
      }));

      await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify(messages),
      });
    }

    return new Response(
      JSON.stringify({ success: true, new: newBadgeIds.length, badges: newBadgeIds }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  }
});
