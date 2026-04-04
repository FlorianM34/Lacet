// ── Enums ──

export type HikeLevel = "easy" | "intermediate" | "hard" | "expert";

export type HikeStatus = "draft" | "open" | "full" | "completed" | "cancelled";

export type ParticipationRole = "actor" | "volunteer";

export type ParticipationStatus = "confirmed" | "left" | "cancelled";

export type RatingContext = "completed" | "left_early";

// ── Table USER ──

export interface User {
  id: string;
  phone: string;
  phone_verified: boolean;
  display_name: string;
  photo_url: string | null;
  birth_date: string; // ISO date
  level: HikeLevel;
  languages: string[];
  rating_avg: number;
  rating_count: number;
  expo_push_token: string | null;
  created_at: string; // ISO timestamp
}

// ── Table HIKE ──

export interface Hike {
  id: string;
  creator_id: string;
  title: string;
  description: string | null;
  start_location: { type: "Point"; coordinates: [number, number] };
  gpx_url: string | null;
  distance_km: number;
  duration_min: number;
  elevation_m: number;
  level: HikeLevel;
  date_start: string; // ISO date
  date_flexible: boolean;
  has_vehicle: boolean;
  max_participants: number;
  current_count: number;
  status: HikeStatus;
  rating_triggered_at: string | null;
  completed_by: string | null;
  created_at: string; // ISO timestamp
}

// ── Hike with creator info (for feed) ──

export interface HikeWithCreator extends Hike {
  creator: Pick<User, "id" | "display_name" | "birth_date" | "rating_avg" | "rating_count">;
}

// ── Table PARTICIPATION ──

export interface Participation {
  id: string;
  user_id: string;
  hike_id: string;
  role: ParticipationRole;
  status: ParticipationStatus;
  joined_at: string; // ISO timestamp
  left_at: string | null;
  leave_reason: string | null;
}

// ── Table GROUP_MESSAGE ──

export interface Message {
  id: string;
  hike_id: string;
  sender_id: string;
  content: string;
  sent_at: string; // ISO timestamp
}

// ── Table RATING ──

export interface Rating {
  id: string;
  hike_id: string;
  rater_id: string;
  rated_id: string;
  score: 1 | 2 | 3 | 4 | 5;
  context: RatingContext;
  revealed: boolean;
  submitted_at: string; // ISO timestamp
  revealed_at: string | null;
}

// ── Feed Filters ──

export interface FeedFilters {
  radiusKm: number;
  dateRange: "week" | "month" | "flexible" | "all";
  level: HikeLevel | null;
}
