# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**Lacet** — React Native / Expo app for matching hiking companions. Users publish hikes, swipe to join, and rate each other post-hike. Backend is Supabase (Postgres + PostGIS, Realtime, Storage, Edge Functions).

## Commands

```bash
# Dev
npm start              # Metro dev server
npx expo run:ios       # iOS simulator
npx expo run:android   # Android emulator

# Database
supabase db push                              # Apply local migrations to remote
supabase functions deploy <function-name>     # Deploy a single edge function
```

No lint or test scripts are configured.

## Architecture

### Stack
- **React Native 0.83 + Expo SDK 55**, TypeScript 5.9
- **Expo Router** (file-based, like Next.js) — see `app/` structure below
- **Supabase**: Postgres + PostGIS, Auth (phone OTP via Twilio), Realtime, Storage, Edge Functions (Deno)
- **Mapbox** (`@rnmapbox/maps`) for hike maps
- **expo-secure-store** for JWT storage (never AsyncStorage)

### Environment
`.env` file (never committed):
```
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=
EXPO_PUBLIC_MAPBOX_TOKEN=
```

### Routing (`app/`)
```
_layout.tsx           # Root — SessionProvider + auth redirect logic
(auth)/               # Unauthenticated: phone → verify → onboarding
(tabs)/               # Authenticated tabs: index (feed), create, groups, profile
hike/[id].tsx         # Hike detail
chat/[hikeId].tsx     # Group chat (Supabase Realtime)
profile/[userId].tsx  # Public profile
profile/edit.tsx      # Edit own profile
```

Auth redirect in `app/_layout.tsx`: no session → `/auth/phone` → onboarding if no profile → `/(tabs)`.

### Session & Auth
- `hooks/SessionContext.tsx` — `SessionProvider` wraps the root; `useSessionContext()` provides `{ session, profile, signOut, refreshProfile }` everywhere.
- `lib/supabase.ts` — Supabase client with secure-store adapter + `sendOTP()` / `verifyOTP()` helpers.

### Database (migrations in `supabase/migrations/`)
Key tables: `user`, `hike`, `participation`, `group_message`, `rating`, `user_badge`.

Notable DB-side logic:
- `hike.status` auto-updates to `full` via trigger when `current_count >= max_participants`
- `get_nearby_hikes()` RPC uses PostGIS `ST_DWithin` for the swipe feed
- `fn_reveal_ratings()` handles post-hike rating revelation (called from `reveal-ratings` edge function)
- `pg_cron` jobs: hourly cron for completing ended hikes and revealing expired ratings
- `pg_net` calls edge functions from triggers (requires `app.supabase_url` and `app.supabase_service_key` DB settings to be set manually in SQL Editor)

### Edge Functions (`supabase/functions/`)
All are Deno; always return HTTP 200 to avoid pg_net retry spam.
- **parse-gpx** — parses GPX file → `{ distance_km, elevation_m, duration_min, coordinates }`
- **send-push** — sends Expo push notifications (chunks of 100)
- **send-rating-bot** — inserts rating bot group message + push + calls `evaluate-badges` for all members
- **reveal-ratings** — calls `fn_reveal_ratings(hike_id)` via RPC
- **evaluate-badges** — computes stats, inserts earned `user_badge` rows, sends push per new badge

### Key Libs (`lib/`)
- `chat.ts` — deterministic avatar colors (hash of user_id), initials, date formatters, RDV message format (`{ type: "rdv", location, datetime }`)
- `badges.ts` — 9 badge definitions (source of truth shared with edge functions, which duplicate the array inline since Deno can't import app code)
- `notifications.ts` — push token registration + notification tap routing

### Types (`types/index.ts`)
Central TypeScript types: `HikeLevel`, `HikeStatus`, `ParticipationRole`, `User`, `Hike`, `HikeWithCreator`, `Participation`, `Message`, `Rating`, `FeedFilters`.

### Components (`components/`)
`HikeCard` (swipeable, color gradient on drag), `MessageBubble` (handles regular/system/RDV message types), `RatingModal` (step-by-step star rating), `BadgeChip` (pill by badge family: teal/distance, amber/hikes, purple/organizer), `RdvModal`, `FilterModal`, `MatchOverlay`, `RdvModal`.

## Patterns to Follow

- **System messages** in `group_message`: `sender_id = NULL`, `is_system = true`, `content` is JSON string for structured types (e.g. `{ type: "rating_bot", ... }`). Rendered in chat by parsing content and branching on `type`.
- **Rating flow**: actor clicks "Terminer" → DB trigger → `send-rating-bot` → rating bot message in chat → `RatingModal`. Ratings stay `revealed=false` until all rate or 48h passes.
- **Geospatial**: `start_location` stored as `SRID=4326;POINT(lng lat)` WKT string on insert; read back as GeoJSON `{ type: "Point", coordinates: [lng, lat] }`.
- **Realtime**: Supabase channel `group-chat:{hikeId}`, cleaned up on unmount via `supabase.removeChannel()`.
- **Optimistic updates**: used in chat send (temp id → replace with real id on success, remove on error).
