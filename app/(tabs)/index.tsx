import { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Dimensions,
  Animated,
} from "react-native";
import * as Location from "expo-location";
import { router } from "expo-router";
import { supabase } from "../../lib/supabase";
import { useSessionContext } from "../../hooks/SessionContext";
import HikeCard from "../../components/HikeCard";
import FilterModal from "../../components/FilterModal";
import MatchOverlay from "../../components/MatchOverlay";
import type { HikeWithCreator, FeedFilters } from "../../types";

const SCREEN_WIDTH = Dimensions.get("window").width;

export default function ExploreScreen() {
  const { session } = useSessionContext();
  const userId = session?.user?.id;

  const [hikes, setHikes] = useState<HikeWithCreator[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [location, setLocation] = useState<{ lng: number; lat: number } | null>(null);

  // Filters
  const [filters, setFilters] = useState<FeedFilters>({
    radiusKm: 50,
    dateRange: "all",
    level: null,
  });
  const [showFilters, setShowFilters] = useState(false);

  // Match overlay
  const [matchHike, setMatchHike] = useState<HikeWithCreator | null>(null);

  // Programmatic swipe refs
  const topCardTranslateX = useRef(new Animated.Value(0)).current;

  // ── Get location ──
  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Localisation requise",
          "Lacet a besoin de votre position pour trouver des randonnées à proximité.",
        );
        // Fallback to Paris
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

      // Build date filter
      let dateFilter = "";
      const today = new Date().toISOString().split("T")[0];
      if (filters.dateRange === "week") {
        const nextWeek = new Date();
        nextWeek.setDate(nextWeek.getDate() + 7);
        dateFilter = `and date_start.gte.${today},date_start.lte.${nextWeek.toISOString().split("T")[0]}`;
      } else if (filters.dateRange === "month") {
        const nextMonth = new Date();
        nextMonth.setMonth(nextMonth.getMonth() + 1);
        dateFilter = `and date_start.gte.${today},date_start.lte.${nextMonth.toISOString().split("T")[0]}`;
      } else if (filters.dateRange === "flexible") {
        dateFilter = `and date_flexible.eq.true`;
      }

      // Use RPC for geography query
      const { data, error } = await supabase.rpc("get_nearby_hikes", {
        user_lng: location.lng,
        user_lat: location.lat,
        radius_meters: radiusMeters,
        filter_level: filters.level,
        filter_date_range: filters.dateRange,
        current_user_id: userId,
      });

      if (error) throw error;

      setHikes((data as HikeWithCreator[]) ?? []);
      setCurrentIndex(0);
    } catch (error: any) {
      // Fallback: simple query without geo filter
      try {
        let query = supabase
          .from("hike")
          .select("*, creator:user!creator_id(id, display_name, birth_date, rating_avg, rating_count)")
          .eq("status", "open")
          .gte("date_start", new Date().toISOString().split("T")[0])
          .order("date_start", { ascending: true })
          .limit(20);

        if (filters.level) {
          query = query.eq("level", filters.level);
        }

        const { data: fallbackData, error: fallbackError } = await query;
        if (fallbackError) throw fallbackError;

        // Exclude hikes where user is already a participant
        const { data: myParticipations } = await supabase
          .from("participation")
          .select("hike_id")
          .eq("user_id", userId)
          .eq("status", "confirmed");

        const myHikeIds = new Set((myParticipations ?? []).map((p: any) => p.hike_id));
        const filtered = (fallbackData ?? []).filter((h: any) => !myHikeIds.has(h.id));

        setHikes(filtered as HikeWithCreator[]);
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

    try {
      // Check active participations count
      const { count } = await supabase
        .from("participation")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("status", "confirmed")
        .eq("role", "volunteer");

      if ((count ?? 0) >= 3) {
        Alert.alert(
          "Limite atteinte",
          "Vous ne pouvez pas rejoindre plus de 3 randonnées simultanément. Terminez ou quittez une rando existante.",
        );
        return;
      }

      // Insert participation
      const { error } = await supabase.from("participation").insert({
        user_id: userId,
        hike_id: hike.id,
        role: "volunteer",
        status: "confirmed",
      });

      if (error) {
        if (error.message?.includes("3 randonnées")) {
          Alert.alert("Limite atteinte", error.message);
        } else {
          throw error;
        }
        return;
      }

      setMatchHike(hike);
    } catch (error: any) {
      Alert.alert("Erreur", error?.message ?? "Impossible de rejoindre la rando.");
    }

    setCurrentIndex((prev) => prev + 1);
  }, [hikes, currentIndex, userId]);

  // ── Button handlers ──
  const handlePassButton = () => {
    if (currentIndex >= hikes.length) return;
    handleSwipeLeft();
  };

  const handleJoinButton = () => {
    if (currentIndex >= hikes.length) return;
    handleSwipeRight();
  };

  const handleDetailButton = () => {
    if (currentIndex >= hikes.length) return;
    const hike = hikes[currentIndex];
    router.push({ pathname: "/hike/[id]", params: { id: hike.id } });
  };

  const handleMatchClose = () => {
    if (matchHike) {
      router.push({ pathname: "/chat/[hikeId]", params: { hikeId: matchHike.id } });
    }
    setMatchHike(null);
  };

  // ── Render ──

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#2E7D32" />
        <Text style={styles.loadingText}>Recherche de randos à proximité...</Text>
      </View>
    );
  }

  const hasCards = currentIndex < hikes.length;

  return (
    <View style={styles.container}>
      {/* Top bar */}
      <View style={styles.topBar}>
        <Text style={styles.logo}>lacet</Text>
        <TouchableOpacity style={styles.filterBtn} onPress={() => setShowFilters(true)}>
          <Text style={styles.filterBtnText}>Filtres</Text>
        </TouchableOpacity>
      </View>

      {/* Card stack */}
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
            />
          </>
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyEmoji}>🏔️</Text>
            <Text style={styles.emptyTitle}>Aucune rando trouvée</Text>
            <Text style={styles.emptySubtitle}>
              Essayez d'élargir votre rayon de recherche ou modifiez vos filtres.
            </Text>
            <TouchableOpacity
              style={styles.emptyButton}
              onPress={() => setShowFilters(true)}
            >
              <Text style={styles.emptyButtonText}>Modifier les filtres</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.reloadButton} onPress={fetchHikes}>
              <Text style={styles.reloadText}>Recharger</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Action bar */}
      {hasCards && (
        <View style={styles.actionBar}>
          {/* Pass */}
          <TouchableOpacity style={[styles.actionBtn, styles.passBtn]} onPress={handlePassButton}>
            <Text style={styles.passIcon}>✕</Text>
          </TouchableOpacity>

          {/* Join */}
          <TouchableOpacity style={[styles.actionBtn, styles.joinBtn]} onPress={handleJoinButton}>
            <Text style={styles.joinIcon}>✓</Text>
          </TouchableOpacity>

          {/* Detail */}
          <TouchableOpacity style={styles.actionBtn} onPress={handleDetailButton}>
            <Text style={styles.detailIcon}>🔍</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Filters modal */}
      <FilterModal
        visible={showFilters}
        filters={filters}
        onChange={setFilters}
        onClose={() => {
          setShowFilters(false);
          fetchHikes();
        }}
      />

      {/* Match overlay */}
      <MatchOverlay
        visible={matchHike !== null}
        hikeName={matchHike?.title ?? ""}
        onViewGroup={handleMatchClose}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  loadingText: { marginTop: 12, fontSize: 14, color: "#888" },

  // Top bar
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: "#e0e0e0",
  },
  logo: { fontSize: 18, fontWeight: "500", color: "#1a1a1a", letterSpacing: -0.3 },
  filterBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#f5f5f5",
    borderWidth: 0.5,
    borderColor: "#e0e0e0",
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  filterBtnText: { fontSize: 12, color: "#666" },

  // Card stack
  cardStack: {
    flex: 1,
    marginHorizontal: 14,
    marginVertical: 12,
  },

  // Action bar
  actionBar: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 20,
    paddingTop: 10,
    paddingBottom: 14,
  },
  actionBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 0.5,
    borderColor: "#ddd",
    backgroundColor: "#fff",
    justifyContent: "center",
    alignItems: "center",
  },
  passBtn: { borderColor: "#F09595" },
  passIcon: { fontSize: 20, color: "#E24B4A", fontWeight: "600" },
  joinBtn: { width: 62, height: 62, borderRadius: 31, borderColor: "#5DCAA5" },
  joinIcon: { fontSize: 24, color: "#1D9E75", fontWeight: "bold" },
  detailIcon: { fontSize: 18 },

  // Empty state
  emptyState: { flex: 1, justifyContent: "center", alignItems: "center", padding: 32 },
  emptyEmoji: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { fontSize: 20, fontWeight: "600", color: "#1a1a1a" },
  emptySubtitle: {
    fontSize: 14,
    color: "#888",
    textAlign: "center",
    marginTop: 8,
    lineHeight: 22,
  },
  emptyButton: {
    marginTop: 24,
    backgroundColor: "#2E7D32",
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
  },
  emptyButtonText: { color: "#fff", fontSize: 14, fontWeight: "600" },
  reloadButton: { marginTop: 12 },
  reloadText: { color: "#2E7D32", fontSize: 14, fontWeight: "500" },
});
