-- ============================================================
-- Lacet — Migration 003 : RPC pour le feed géographique
-- ============================================================

CREATE OR REPLACE FUNCTION get_nearby_hikes(
  user_lng float,
  user_lat float,
  radius_meters float,
  filter_level user_level DEFAULT NULL,
  filter_date_range text DEFAULT 'all',
  current_user_id uuid DEFAULT NULL
)
RETURNS SETOF json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  date_from date := CURRENT_DATE;
  date_to date := NULL;
BEGIN
  -- Compute date range
  IF filter_date_range = 'week' THEN
    date_to := CURRENT_DATE + INTERVAL '7 days';
  ELSIF filter_date_range = 'month' THEN
    date_to := CURRENT_DATE + INTERVAL '1 month';
  END IF;

  RETURN QUERY
  SELECT row_to_json(t) FROM (
    SELECT
      h.id,
      h.creator_id,
      h.title,
      h.description,
      h.gpx_url,
      h.distance_km,
      h.duration_min,
      h.elevation_m,
      h.level,
      h.date_start,
      h.date_flexible,
      h.has_vehicle,
      h.max_participants,
      h.current_count,
      h.status,
      h.created_at,
      ST_AsGeoJSON(h.start_location)::json AS start_location,
      json_build_object(
        'id', u.id,
        'display_name', u.display_name,
        'birth_date', u.birth_date,
        'rating_avg', u.rating_avg,
        'rating_count', u.rating_count
      ) AS creator
    FROM hike h
    JOIN "user" u ON u.id = h.creator_id
    WHERE h.status = 'open'
      AND h.date_start >= date_from
      AND ST_DWithin(
        h.start_location,
        ST_SetSRID(ST_MakePoint(user_lng, user_lat), 4326)::geography,
        radius_meters
      )
      -- Date range filter
      AND (date_to IS NULL OR h.date_start <= date_to)
      -- Flexible filter
      AND (filter_date_range != 'flexible' OR h.date_flexible = true)
      -- Level filter
      AND (filter_level IS NULL OR h.level = filter_level)
      -- Exclude hikes where user is already participating
      AND (
        current_user_id IS NULL
        OR NOT EXISTS (
          SELECT 1 FROM participation p
          WHERE p.hike_id = h.id
            AND p.user_id = current_user_id
            AND p.status = 'confirmed'
        )
      )
    ORDER BY h.date_start ASC
    LIMIT 30
  ) t;
END;
$$;
