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
    const { hike_id, requester_id } = await req.json();
    if (!hike_id || !requester_id) throw new Error("Missing hike_id or requester_id");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const db = createClient(supabaseUrl, serviceKey);

    // Fetch hike + creator push token
    const { data: hike, error: hikeErr } = await db
      .from("hike")
      .select("title, creator_id, user:user!creator_id(expo_push_token)")
      .eq("id", hike_id)
      .single();

    if (hikeErr || !hike) throw hikeErr ?? new Error("Hike not found");

    const creatorToken = (hike as any).user?.expo_push_token ?? null;
    if (!creatorToken || !creatorToken.startsWith("ExponentPushToken[")) {
      return new Response(
        JSON.stringify({ success: true, sent: 0, message: "No valid push token" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch requester display_name
    const { data: requester, error: reqErr } = await db
      .from("user")
      .select("display_name")
      .eq("id", requester_id)
      .single();

    if (reqErr || !requester) throw reqErr ?? new Error("Requester not found");

    const displayName = (requester as any).display_name ?? "Un utilisateur";

    // Send push notification
    const message = {
      to: creatorToken,
      sound: "default",
      title: "Nouvelle demande",
      body: `${displayName} veut rejoindre "${(hike as any).title}"`,
      data: { screen: "chat", hike_id },
    };

    const response = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify([message]),
    });

    const result = await response.json();

    return new Response(
      JSON.stringify({ success: true, sent: 1, result }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    // Always return 200 to avoid pg_net retry spam
    return new Response(
      JSON.stringify({ error: message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  }
});
