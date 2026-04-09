import { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Dimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Location from "expo-location";
import { router } from "expo-router";
import { supabase } from "../../lib/supabase";
import { useSessionContext } from "../../hooks/SessionContext";
import HikeCard from "../../components/HikeCard";
import FilterModal from "../../components/FilterModal";
import MatchOverlay from "../../components/MatchOverlay";
import PendingMatchScreen from "../../components/PendingMatchScreen";
import type { HikeWithCreator, FeedFilters, HikeLevel } from "../../types";

const SCREEN_WIDTH = Dimensions.get("window").width;

function levelLabel(level: HikeLevel): string {
  const map: Record<HikeLevel, string> = {
    easy: "Facile",
    intermediate: "Intermédiaire",
    hard: "Difficile",
    expert: "Expert",
  };
  return map[level];
}

export default function ExploreScreen() {
  const { session } = useSessionContext();
  const userId = session?.user?.id;
  const insets = useSafeAreaInsets();

  const [hikes, setHikes] = useState<HikeWithCreator[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [location, setLocation] = useState<{ lng: number; lat: number } | null>(null);

  const [filters, setFilters] = useState<FeedFilters>({
    radiusKm: 50,
    dateRange: "all",
    level: null,
  });
  const [showFilters, setShowFilters] = useState(false);
  const [matchHike, setMatchHike] = useState<HikeWithCreator | null>(null);
  const [pendingHike, setPendingHike] = useState<HikeWithCreator | null>(null);
  const [pendingHikeIds, setPendingHikeIds] = useState<Set<string>>(new Set());

  // ── Get location ──
  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Localisation requise",
          "Lacet a besoin de votre position pour trouver des randonnées à proximité.",
        );
        setLocation({ lng: 2.3522, lat: 48.8566 });
        return;
      }
      const loc = await Location.getCurrentPositionAsync({});
      setLocation({ lng: loc.coords.longitude, lat: loc.coords.latitude });
    })();
  }, []);

  // ── Fetch hikes ──
  const fetchHikes = useCallback(async () => {
    if (!location || !userId) return;

    setLoading(true);
    try {
      const radiusMeters = filters.radiusKm * 1000;

      const { data, error } = await supabase.rpc("get_nearby_hikes", {
        user_lng: location.lng,
        user_lat: location.lat,
        radius_meters: radiusMeters,
        filter_level: filters.level,
        filter_date_range: filters.dateRange,
        current_user_id: userId,
      });

      if (error) throw error;

      const rpcHikes = (data as HikeWithCreator[]) ?? [];
      console.log("[Explorer] Résultats RPC:", rpcHikes.length);

      // Enrichir avec route_coordinates (absent du RPC déployé)
      let enriched = rpcHikes;
      if (rpcHikes.length > 0 && rpcHikes[0].route_coordinates === undefined) {
        const ids = rpcHikes.map((h) => h.id);
        const { data: routes } = await supabase
          .from("hike")
          .select("id, route_coordinates")
          .in("id", ids);
        const routeMap = Object.fromEntries(
          (routes ?? []).map((r: any) => [r.id, r.route_coordinates])
        );
        enriched = rpcHikes.map((h) => ({ ...h, route_coordinates: routeMap[h.id] ?? null }));
      }

      setHikes(enriched);
      setCurrentIndex(0);

      // Load pending participation IDs for this user
      const { data: pendingData } = await supabase
        .from("participation")
        .select("hike_id")
        .eq("user_id", userId)
        .eq("status", "pending");
      setPendingHikeIds(new Set((pendingData ?? []).map((p: any) => p.hike_id)));
    } catch (error: any) {
      try {
        let query = supabase
          .from("hike")
          .select("*, creator:user!creator_id(id, display_name, birth_date, rating_avg, rating_count)")
          .eq("status", "open")
          .gte("date_start", new Date().toISOString().split("T")[0])
          .order("date_start", { ascending: true })
          .limit(20);

        if (filters.level) query = query.eq("level", filters.level);

        const { data: fallbackData, error: fallbackError } = await query;
        if (fallbackError) throw fallbackError;

        const { data: myParticipations } = await supabase
          .from("participation")
          .select("hike_id")
          .eq("user_id", userId)
          .eq("status", "confirmed");

        const myHikeIds = new Set((myParticipations ?? []).map((p: any) => p.hike_id));
        setHikes(((fallbackData ?? []).filter((h: any) => !myHikeIds.has(h.id))) as HikeWithCreator[]);
        setCurrentIndex(0);
      } catch {
        setHikes([]);
      }
    } finally {
      setLoading(false);
    }
  }, [location, userId, filters]);

  useEffect(() => {
    fetchHikes();
  }, [fetchHikes]);

  // ── Swipe handlers ──
  const handleSwipeLeft = useCallback(() => {
    setCurrentIndex((prev) => prev + 1);
  }, []);

  const handleSwipeRight = useCallback(async () => {
    const hike = hikes[currentIndex];
    if (!hike || !userId) return;

    // If already pending, don't allow action
    if (pendingHikeIds.has(hike.id)) return;

    try {
      // Check for existing active participation
      const { data: existing } = await supabase
        .from("participation")
        .select("id, status")
        .eq("user_id", userId)
        .eq("hike_id", hike.id)
        .in("status", ["confirmed", "pending"])
        .maybeSingle();

      if (existing) {
        if (existing.status === "pending") {
          setPendingHikeIds((prev) => new Set([...prev, hike.id]));
          setPendingHike(hike);
        }
        setCurrentIndex((prev) => prev + 1);
        return;
      }

      // Check 3-rando limit (counts both confirmed and pending)
      const { count } = await supabase
        .from("participation")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .in("status", ["confirmed", "pending"])
        .eq("role", "volunteer");

      if ((count ?? 0) >= 3) {
        Alert.alert(
          "Limite atteinte",
          "Vous ne pouvez pas rejoindre plus de 3 randonnées simultanément.",
        );
        return;
      }

      // Fetch hike auto_accept setting
      const { data: hikeData } = await supabase
        .from("hike")
        .select("auto_accept")
        .eq("id", hike.id)
        .single();

      const autoAccept = hikeData?.auto_accept !== false;

      const { error } = await supabase.from("participation").insert({
        user_id: userId,
        hike_id: hike.id,
        role: "volunteer",
        status: autoAccept ? "confirmed" : "pending",
      });

      if (error) {
        if (error.message?.includes("3 randonnées")) {
          Alert.alert("Limite atteinte", error.message);
        } else {
          throw error;
        }
        return;
      }

      if (autoAccept) {
        setMatchHike(hike);
      } else {
        setPendingHikeIds((prev) => new Set([...prev, hike.id]));
        setPendingHike(hike);

        // Notify organizer
        try {
          await fetch(
            `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/notify-pending-request`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY}`,
              },
              body: JSON.stringify({ hike_id: hike.id, requester_id: userId }),
            }
          );
        } catch {}
      }
    } catch (error: any) {
      Alert.alert("Erreur", error?.message ?? "Impossible de rejoindre la rando.");
    }

    setCurrentIndex((prev) => prev + 1);
  }, [hikes, currentIndex, userId, pendingHikeIds]);

  const handleDetailButton = () => {
    if (currentIndex >= hikes.length) return;
    router.push({ pathname: "/hike/[id]", params: { id: hikes[currentIndex].id } });
  };

  const handleMatchClose = () => {
    if (matchHike) {
      router.push({ pathname: "/chat/[hikeId]", params: { hikeId: matchHike.id } });
    }
    setMatchHike(null);
  };

  const handleMatchContinue = () => {
    setMatchHike(null);
  };

  const handlePendingContinue = () => {
    setPendingHike(null);
  };

  const filterPillLabel = `${filters.radiusKm} km · ${filters.level ? levelLabel(filters.level) : "Tous niveaux"}`;
  const hasCards = currentIndex < hikes.length;
  const currentIsPending = hasCards && pendingHikeIds.has(hikes[currentIndex]?.id);

  if (loading) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator size="large" color="#1D9E75" />
        <Text style={styles.loadingText}>Recherche de randos...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Card stack — fills all available space */}
      <View style={styles.cardStack}>
        {hasCards ? (
          <>
            {/* Behind card */}
            {currentIndex + 1 < hikes.length && (
              <HikeCard
                key={hikes[currentIndex + 1].id}
                hike={hikes[currentIndex + 1]}
                onSwipeLeft={() => {}}
                onSwipeRight={() => {}}
                isTop={false}
              />
            )}
            {/* Top card */}
            <HikeCard
              key={hikes[currentIndex].id}
              hike={hikes[currentIndex]}
              onSwipeLeft={handleSwipeLeft}
              onSwipeRight={handleSwipeRight}
              isTop={true}
              isPending={currentIsPending}
            />
          </>
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyEmoji}>🏔️</Text>
            <Text style={styles.emptyTitle}>Aucune rando trouvée</Text>
            <Text style={styles.emptySubtitle}>
              Essayez d'élargir votre rayon de recherche ou modifiez vos filtres.
            </Text>
            <TouchableOpacity style={styles.emptyButton} onPress={() => setShowFilters(true)}>
              <Text style={styles.emptyButtonText}>Modifier les filtres</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.reloadButton} onPress={fetchHikes}>
              <Text style={styles.reloadText}>Recharger</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Top overlay: logo + filter pill */}
        <View style={[styles.topOverlay, { top: insets.top }]} pointerEvents="box-none">
          <Text style={styles.logo}>lacet</Text>
          <TouchableOpacity style={styles.filterPill} onPress={() => setShowFilters(true)}>
            <View style={styles.filterIcon}>
              <View style={styles.filterLine} />
              <View style={[styles.filterLine, { width: 10 }]} />
              <View style={[styles.filterLine, { width: 6 }]} />
            </View>
            <Text style={styles.filterPillText}>{filterPillLabel}</Text>
          </TouchableOpacity>
        </View>

        {/* Action bar — overlaid at the bottom of the card */}
        {hasCards && (
          <View style={[styles.actionBar, { bottom: 14 }]}>
            <TouchableOpacity style={styles.btnPass} onPress={handleSwipeLeft} activeOpacity={0.7}>
              <Text style={styles.btnPassIcon}>✕</Text>
            </TouchableOpacity>
            {currentIsPending ? (
              <View style={styles.btnPending}>
                <Text style={styles.btnPendingText}>En attente…</Text>
              </View>
            ) : (
              <TouchableOpacity style={styles.btnJoin} onPress={handleSwipeRight} activeOpacity={0.8}>
                <Text style={styles.btnJoinIcon}>✓</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.btnInfo} onPress={handleDetailButton} activeOpacity={0.7}>
              <Text style={styles.btnInfoIcon}>i</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      <FilterModal
        visible={showFilters}
        filters={filters}
        onChange={setFilters}
        onClose={() => {
          setShowFilters(false);
          fetchHikes();
        }}
      />

      <MatchOverlay
        visible={matchHike !== null}
        hikeName={matchHike?.title ?? ""}
        onViewGroup={handleMatchClose}
        onContinue={handleMatchContinue}
      />

      {pendingHike && (
        <PendingMatchScreen
          visible={pendingHike !== null}
          hike={pendingHike}
          onContinue={handlePendingContinue}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0a140c", overflow: "hidden" },

  loadingScreen: {
    flex: 1,
    backgroundColor: "#0a140c",
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: { marginTop: 12, fontSize: 14, color: "rgba(255,255,255,0.6)" },

  // Card stack
  cardStack: {
    flex: 1,
    position: "relative",
  },

  // Top overlay (logo + filter)
  topOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 14,
    zIndex: 10,
    pointerEvents: "box-none",
  },
  logo: {
    fontSize: 18,
    fontWeight: "500",
    color: "white",
    letterSpacing: -0.3,
  },
  filterPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255,255,255,0.15)",
    borderWidth: 0.5,
    borderColor: "rgba(255,255,255,0.25)",
    borderRadius: 20,
    paddingHorizontal: 11,
    paddingVertical: 5,
  },
  filterIcon: { gap: 2.5, alignItems: "flex-end" },
  filterLine: { height: 1.5, width: 14, backgroundColor: "white", borderRadius: 1 },
  filterPillText: { fontSize: 11, color: "white" },

  // Action bar
  actionBar: {
    position: "absolute",
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 20,
    zIndex: 10,
  },
  btnPass: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    justifyContent: "center",
    alignItems: "center",
  },
  btnPassIcon: { fontSize: 20, color: "#E24B4A", fontWeight: "600", lineHeight: 24 },
  btnJoin: {
    width: 66,
    height: 66,
    borderRadius: 33,
    backgroundColor: "#1D9E75",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.25)",
    justifyContent: "center",
    alignItems: "center",
  },
  btnJoinIcon: { fontSize: 26, color: "white", fontWeight: "600", lineHeight: 30 },
  btnPending: {
    height: 40,
    paddingHorizontal: 18,
    borderRadius: 20,
    backgroundColor: "rgba(239,159,39,0.2)",
    borderWidth: 1,
    borderColor: "rgba(239,159,39,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  btnPendingText: { fontSize: 13, color: "#EF9F27", fontWeight: "600" },
  btnInfo: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderWidth: 0.5,
    borderColor: "rgba(255,255,255,0.2)",
    justifyContent: "center",
    alignItems: "center",
  },
  btnInfoIcon: {
    fontSize: 14,
    color: "rgba(255,255,255,0.8)",
    fontWeight: "600",
    fontStyle: "italic",
  },

  // Empty state
  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
    backgroundColor: "#0a140c",
    borderRadius: 16,
  },
  emptyEmoji: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { fontSize: 20, fontWeight: "600", color: "white" },
  emptySubtitle: {
    fontSize: 14,
    color: "rgba(255,255,255,0.55)",
    textAlign: "center",
    marginTop: 8,
    lineHeight: 22,
  },
  emptyButton: {
    marginTop: 24,
    backgroundColor: "#1D9E75",
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
  },
  emptyButtonText: { color: "white", fontSize: 14, fontWeight: "600" },
  reloadButton: { marginTop: 12 },
  reloadText: { color: "#1D9E75", fontSize: 14, fontWeight: "500" },
});
