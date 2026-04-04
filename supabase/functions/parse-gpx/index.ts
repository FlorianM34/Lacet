import { serve } from "https://deno.land/std@0.208.0/http/server.ts";

interface ParsedGPX {
  distance_km: number;
  elevation_m: number;
  duration_min: number;
  coordinates: [number, number][];
  name?: string;
  description?: string;
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function parseGPXContent(xml: string): ParsedGPX {
  // Match the full tag regardless of attribute order (lat/lon or lon/lat)
  const pointRegex =
    /<(?:trkpt|rtept)([^>]+)>([\s\S]*?)<\/(?:trkpt|rtept)>/gi;
  const latRegex = /\blat="([^"]+)"/i;
  const lonRegex = /\blon="([^"]+)"/i;
  const eleRegex = /<ele>([^<]+)<\/ele>/i;

  const coordinates: [number, number][] = [];
  const elevations: number[] = [];
  let match: RegExpExecArray | null;

  while ((match = pointRegex.exec(xml)) !== null) {
    const attrs = match[1];
    const inner = match[2];

    const latMatch = latRegex.exec(attrs);
    const lonMatch = lonRegex.exec(attrs);
    if (!latMatch || !lonMatch) continue;

    const lat = parseFloat(latMatch[1]);
    const lon = parseFloat(lonMatch[1]);

    if (isNaN(lat) || isNaN(lon)) continue;
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) continue;

    coordinates.push([lon, lat]); // GeoJSON: [lng, lat]

    const eleMatch = eleRegex.exec(inner);
    if (eleMatch) {
      const ele = parseFloat(eleMatch[1]);
      if (!isNaN(ele)) elevations.push(ele);
    }
  }

  if (coordinates.length < 2) {
    throw new Error(
      "Fichier GPX invalide : moins de 2 points de coordonnées trouvés."
    );
  }

  // Calculate total distance
  let totalDistance = 0;
  for (let i = 1; i < coordinates.length; i++) {
    totalDistance += haversineDistance(
      coordinates[i - 1][1],
      coordinates[i - 1][0],
      coordinates[i][1],
      coordinates[i][0]
    );
  }

  // Calculate positive elevation gain
  let elevationGain = 0;
  for (let i = 1; i < elevations.length; i++) {
    const diff = elevations[i] - elevations[i - 1];
    if (diff > 0) elevationGain += diff;
  }

  // Estimate duration: distance / 3.5 km/h * 60 min
  const durationMin = Math.round((totalDistance / 3.5) * 60);

  const nameMatch = /<name>([^<]+)<\/name>/i.exec(xml);
  const descMatch = /<desc>([^<]+)<\/desc>/i.exec(xml);

  return {
    distance_km: Math.round(totalDistance * 10) / 10,
    elevation_m: Math.round(elevationGain),
    duration_min: durationMin,
    coordinates,
    name: nameMatch ? nameMatch[1].trim() : undefined,
    description: descMatch ? descMatch[1].trim() : undefined,
  };
}

serve(async (req: Request) => {
  // CORS headers
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const contentType = req.headers.get("content-type") ?? "";

    let gpxContent: string;

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("file");
      if (!file || !(file instanceof File)) {
        throw new Error("Aucun fichier GPX fourni.");
      }
      gpxContent = await file.text();
    } else {
      // Accept raw XML body
      gpxContent = await req.text();
    }

    if (!gpxContent.trim()) {
      throw new Error("Le fichier est vide.");
    }

    // Basic GPX validation
    if (
      !gpxContent.includes("<gpx") &&
      !gpxContent.includes("<GPX")
    ) {
      throw new Error(
        "Le fichier n'est pas un GPX valide. Balise <gpx> introuvable."
      );
    }

    const parsed = parseGPXContent(gpxContent);

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Erreur inconnue lors du parsing GPX.";
    return new Response(JSON.stringify({ error: message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
