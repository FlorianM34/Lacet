import { serve } from "https://deno.land/std@0.208.0/http/server.ts";

interface PushPayload {
  to: string | string[];
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

serve(async (req: Request) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
  };

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const payload: PushPayload = await req.json();

    if (!payload.to || !payload.title || !payload.body) {
      throw new Error("Missing required fields: to, title, body");
    }

    // Normalize to array
    const tokens = Array.isArray(payload.to) ? payload.to : [payload.to];

    // Filter out empty tokens
    const validTokens = tokens.filter(
      (t) => t && t.startsWith("ExponentPushToken[")
    );

    if (validTokens.length === 0) {
      return new Response(
        JSON.stringify({ success: true, sent: 0, message: "No valid tokens" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build messages for Expo Push API
    const messages = validTokens.map((token) => ({
      to: token,
      sound: "default",
      title: payload.title,
      body: payload.body,
      data: payload.data ?? {},
    }));

    // Send in chunks of 100 (Expo limit)
    const results = [];
    for (let i = 0; i < messages.length; i += 100) {
      const chunk = messages.slice(i, i + 100);

      const response = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Accept-Encoding": "gzip, deflate",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(chunk),
      });

      const result = await response.json();
      results.push(result);
    }

    return new Response(
      JSON.stringify({ success: true, sent: validTokens.length, results }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Unknown error sending push notification";
    return new Response(JSON.stringify({ error: message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
