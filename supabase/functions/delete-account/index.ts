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
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Client with user JWT to identify caller
    const authHeader = req.headers.get("Authorization");
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader ?? "" } },
    });

    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const uid = user.id;

    // Admin client for privileged operations
    const admin = createClient(supabaseUrl, serviceKey);

    // 1. Fetch photo_url before erasing it
    const { data: userData } = await admin
      .from("user")
      .select("photo_url")
      .eq("id", uid)
      .single();

    // 2. Delete ratings
    await admin.from("rating").delete().or(`rater_id.eq.${uid},rated_id.eq.${uid}`);

    // 3. Delete badges
    await admin.from("user_badge").delete().eq("user_id", uid);

    // 4. Delete read statuses
    await admin.from("group_read_status").delete().eq("user_id", uid);

    // 5. Anonymize messages (keep structure, erase content)
    await admin
      .from("group_message")
      .update({ sender_id: null, content: "[Message supprimé]" })
      .eq("sender_id", uid);

    // 6. Delete participations
    await admin.from("participation").delete().eq("user_id", uid);

    // 7. Anonymize hikes created by this user
    await admin
      .from("hike")
      .update({ creator_id: null, title: "Rando supprimée" })
      .eq("creator_id", uid);

    // 8. Soft-delete and anonymize user record
    await admin
      .from("user")
      .update({
        is_deleted: true,
        deleted_at: new Date().toISOString(),
        display_name: "Utilisateur supprimé",
        phone: null,
        photo_url: null,
        expo_push_token: null,
      })
      .eq("id", uid);

    // 9. Delete profile photo from storage if it exists
    if (userData?.photo_url) {
      try {
        const url = new URL(userData.photo_url);
        // Extract path after /storage/v1/object/public/avatars/
        const pathMatch = url.pathname.match(/\/storage\/v1\/object\/public\/avatars\/(.+)/);
        if (pathMatch) {
          await admin.storage.from("avatars").remove([pathMatch[1]]);
        }
      } catch {
        // Non-blocking: storage deletion failure shouldn't abort account deletion
      }
    }

    // 10. Delete Supabase Auth user (revokes all sessions)
    const { error: deleteAuthError } = await admin.auth.admin.deleteUser(uid);
    if (deleteAuthError) {
      console.error("Auth delete error:", deleteAuthError.message);
      // Non-blocking: user data is already wiped
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("delete-account error:", err);
    return new Response(JSON.stringify({ error: err.message ?? "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
