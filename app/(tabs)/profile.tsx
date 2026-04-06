import { useState, useCallback, useLayoutEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { router, useFocusEffect, useNavigation } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../../lib/supabase";
import { useSessionContext } from "../../hooks/SessionContext";
import { getAvatarColor, getInitials } from "../../lib/chat";
import BadgeChip from "../../components/BadgeChip";
import type { HikeLevel } from "../../types";

interface HikeHistoryItem {
  hike_id: string;
  title: string;
  date_start: string;
  distance_km: number;
  role: string;
  hike_status: string;
}

interface ReviewItem {
  id: string;
  score: number;
  hike_title: string;
}

interface ProfileStats {
  totalHikes: number;
  totalKm: number;
  organized: number;
}

const LEVEL_LABELS: Record<HikeLevel, string> = {
  easy: "Facile",
  intermediate: "Intermédiaire",
  hard: "Difficile",
  expert: "Expert",
};

function getAge(birthDate: string): number {
  const today = new Date();
  const birth = new Date(birthDate);
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

function renderStars(rating: number, size: number = 14) {
  const stars = [];
  for (let i = 1; i <= 5; i++) {
    stars.push(
      <Text key={i} style={{ fontSize: size, color: i <= Math.round(rating) ? "#1D9E75" : "rgba(255,255,255,0.15)" }}>
        ★
      </Text>
    );
  }
  return stars;
}

export default function ProfileScreen() {
  const { profile } = useSessionContext();
  const navigation = useNavigation();
  const [stats, setStats] = useState<ProfileStats>({ totalHikes: 0, totalKm: 0, organized: 0 });
  const [history, setHistory] = useState<HikeHistoryItem[]>([]);
  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [badges, setBadges] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity
          onPress={() => router.push("/settings")}
          style={{ paddingHorizontal: 16, paddingVertical: 8 }}
        >
          <Ionicons name="settings-outline" size={22} color="rgba(255,255,255,0.6)" />
        </TouchableOpacity>
      ),
    });
  }, [navigation]);

  const fetchProfileData = useCallback(async () => {
    if (!profile) return;

    try {
      // Fetch participations with hike data
      const { data: participations } = await supabase
        .from("participation")
        .select("hike_id, role, hike:hike!hike_id(id, title, date_start, distance_km, status)")
        .eq("user_id", profile.id)
        .eq("status", "confirmed")
        .order("joined_at", { ascending: false });

      const items = (participations ?? []) as any[];

      // Compute stats
      const totalHikes = items.length;
      const totalKm = items.reduce((sum: number, p: any) => sum + (p.hike?.distance_km ?? 0), 0);
      const organized = items.filter((p: any) => p.role === "actor").length;
      setStats({ totalHikes, totalKm: Math.round(totalKm), organized });

      // History (last 10)
      const historyItems: HikeHistoryItem[] = items.slice(0, 10).map((p: any) => ({
        hike_id: p.hike_id,
        title: p.hike?.title ?? "Rando",
        date_start: p.hike?.date_start ?? "",
        distance_km: p.hike?.distance_km ?? 0,
        role: p.role,
        hike_status: p.hike?.status ?? "",
      }));
      setHistory(historyItems);

      // Fetch reviews (anonymous — rater identity hidden)
      const { data: ratingsData } = await supabase
        .from("rating")
        .select("id, score, hike:hike!hike_id(title)")
        .eq("rated_id", profile.id)
        .eq("revealed", true)
        .order("submitted_at", { ascending: false })
        .limit(10);

      const reviewItems: ReviewItem[] = (ratingsData ?? []).map((r: any) => ({
        id: r.id,
        score: r.score,
        hike_title: (r.hike as any)?.title ?? "",
      }));
      setReviews(reviewItems);

      // Fetch badges
      const { data: badgesData } = await supabase
        .from("user_badge")
        .select("badge_id")
        .eq("user_id", profile.id)
        .order("earned_at", { ascending: true });
      setBadges((badgesData ?? []).map((b: any) => b.badge_id));
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [profile]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      fetchProfileData();
    }, [fetchProfileData])
  );

  if (!profile) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#1D9E75" />
      </View>
    );
  }

  const avatarColor = getAvatarColor(profile.id);
  const age = getAge(profile.birth_date);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.avatarWrap}>
          <View style={[styles.avatarLg, { backgroundColor: avatarColor.bg, borderColor: "rgba(255,255,255,0.25)" }]}>
            <Text style={[styles.avatarLgText, { color: avatarColor.text }]}>
              {getInitials(profile.display_name)}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.avatarEdit}
            onPress={() => router.push("/profile/edit")}
          >
            <Text style={styles.avatarEditIcon}>✏️</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.profileName}>{profile.display_name}</Text>
        <Text style={styles.profileAge}>{age} ans</Text>

        <View style={styles.tagsRow}>
          <View style={[styles.tag, styles.tagAmber]}>
            <Text style={styles.tagAmberText}>{LEVEL_LABELS[profile.level]}</Text>
          </View>
          <View style={[styles.tag, styles.tagPurple]}>
            <Text style={styles.tagPurpleText}>{profile.languages.join(" · ")}</Text>
          </View>
        </View>

        <View style={styles.ratingBlock}>
          <View style={styles.starsRow}>{renderStars(profile.rating_avg)}</View>
          <Text style={styles.ratingVal}>{profile.rating_avg.toFixed(1)}</Text>
          <Text style={styles.ratingCount}>· {profile.rating_count} avis</Text>
        </View>
      </View>

      {/* Stats grid */}
      <View style={styles.statsGrid}>
        <View style={styles.statCell}>
          <Text style={styles.statVal}>{stats.totalHikes}</Text>
          <Text style={styles.statLbl}>randos</Text>
        </View>
        <View style={[styles.statCell, styles.statCellBorder]}>
          <Text style={styles.statVal}>{stats.totalKm}</Text>
          <Text style={styles.statLbl}>km parcourus</Text>
        </View>
        <View style={styles.statCell}>
          <Text style={styles.statVal}>{stats.organized}</Text>
          <Text style={styles.statLbl}>organisées</Text>
        </View>
      </View>

      {/* Badges */}
      {badges.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>BADGES</Text>
          <View style={styles.badgesRow}>
            {badges.map((badgeId) => (
              <BadgeChip key={badgeId} badgeId={badgeId} />
            ))}
          </View>
        </View>
      )}

      {/* History */}
      {history.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>RANDOS RÉCENTES</Text>
          {history.map((item) => {
            const d = new Date(item.date_start);
            const months = ["jan.", "fév.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
            const dateLabel = `${d.getDate()} ${months[d.getMonth()]} · ${item.distance_km} km`;
            const isPast = new Date(item.date_start) < new Date();
            const isActor = item.role === "actor";

            let badgeLabel: string;
            let badgeStyle: object;
            if (!isPast) {
              badgeLabel = "Prévue";
              badgeStyle = styles.badgePlanned;
            } else if (isActor) {
              badgeLabel = "Organisée";
              badgeStyle = styles.badgeActor;
            } else {
              badgeLabel = "Effectuée";
              badgeStyle = styles.badgeDone;
            }

            return (
              <TouchableOpacity
                key={item.hike_id}
                style={styles.hikeItem}
                onPress={() => router.push({ pathname: "/hike/[id]", params: { id: item.hike_id } })}
              >
                <View style={[styles.hikeDot, isPast ? styles.hikeDotDone : styles.hikeDotPlanned]} />
                <View style={styles.hikeInfo}>
                  <Text style={styles.hikeName} numberOfLines={1}>{item.title}</Text>
                  <Text style={styles.hikeDate}>{dateLabel}</Text>
                </View>
                <View style={[styles.hikeBadge, badgeStyle]}>
                  <Text style={[styles.hikeBadgeText, badgeStyle]}>{badgeLabel}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* Reviews */}
      {reviews.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>AVIS REÇUS</Text>
          <Text style={styles.reviewAnon}>Les avis sont anonymes</Text>
          {reviews.map((review) => (
            <View key={review.id} style={styles.reviewItem}>
              <View style={styles.reviewScore}>{renderStars(review.score, 13)}</View>
              <Text style={styles.reviewContext}>{review.hike_title}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Settings link */}
      <TouchableOpacity
        style={styles.editBtn}
        onPress={() => router.push("/settings")}
      >
        <Text style={styles.editBtnText}>Paramètres</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const BG = "#0f1f14";
const BORDER = "rgba(255,255,255,0.1)";
const SURFACE = "rgba(255,255,255,0.07)";

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  contentContainer: { paddingBottom: 40 },
  centered: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: BG },

  // Header
  header: {
    alignItems: "center",
    paddingVertical: 24,
    paddingHorizontal: 16,
    borderBottomWidth: 0.5,
    borderBottomColor: BORDER,
  },
  avatarWrap: { position: "relative", marginBottom: 14 },
  avatarLg: {
    width: 76,
    height: 76,
    borderRadius: 38,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
  },
  avatarLgText: { fontSize: 26, fontWeight: "500" },
  avatarEdit: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#1D9E75",
    borderWidth: 2,
    borderColor: BG,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarEditIcon: { fontSize: 10 },
  profileName: { fontSize: 20, fontWeight: "500", color: "white", marginBottom: 3, letterSpacing: -0.3 },
  profileAge: { fontSize: 13, color: "rgba(255,255,255,0.45)", marginBottom: 12 },
  tagsRow: { flexDirection: "row", gap: 6, flexWrap: "wrap", justifyContent: "center", marginBottom: 14 },
  tag: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, borderWidth: 0.5 },
  tagAmber: { backgroundColor: "rgba(250,199,117,0.15)", borderColor: "rgba(250,199,117,0.4)" },
  tagAmberText: { fontSize: 11, color: "#FAC775" },
  tagPurple: { backgroundColor: "rgba(206,203,246,0.12)", borderColor: "rgba(206,203,246,0.35)" },
  tagPurpleText: { fontSize: 11, color: "#CECBF6" },
  ratingBlock: { flexDirection: "row", alignItems: "center", gap: 6 },
  starsRow: { flexDirection: "row", gap: 2 },
  ratingVal: { fontSize: 15, fontWeight: "500", color: "white" },
  ratingCount: { fontSize: 12, color: "rgba(255,255,255,0.4)" },

  // Stats
  statsGrid: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: BORDER },
  statCell: { flex: 1, paddingVertical: 16, alignItems: "center" },
  statCellBorder: { borderLeftWidth: 0.5, borderRightWidth: 0.5, borderColor: BORDER },
  statVal: { fontSize: 20, fontWeight: "500", color: "white" },
  statLbl: { fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 2 },

  // Section
  section: { paddingHorizontal: 16, paddingVertical: 16, borderBottomWidth: 0.5, borderBottomColor: BORDER },
  sectionTitle: {
    fontSize: 10,
    fontWeight: "500",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: "rgba(255,255,255,0.35)",
    marginBottom: 12,
  },

  // Hike history
  hikeItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  hikeDot: { width: 8, height: 8, borderRadius: 4 },
  hikeDotDone: { backgroundColor: "#1D9E75" },
  hikeDotPlanned: { backgroundColor: "#FAC775" },
  hikeInfo: { flex: 1 },
  hikeName: { fontSize: 13, fontWeight: "500", color: "white" },
  hikeDate: { fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 2 },
  hikeBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  hikeBadgeText: { fontSize: 10 },
  badgeDone: { backgroundColor: "rgba(29,158,117,0.2)", color: "#9FE1CB" },
  badgePlanned: { backgroundColor: "rgba(250,199,117,0.15)", color: "#FAC775" },
  badgeActor: { backgroundColor: "rgba(206,203,246,0.15)", color: "#CECBF6" },

  // Reviews
  badgesRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  reviewAnon: { fontSize: 11, color: "rgba(255,255,255,0.3)", marginBottom: 10, fontStyle: "italic" },
  reviewItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  reviewScore: { flexDirection: "row", gap: 2 },
  reviewContext: { fontSize: 12, color: "rgba(255,255,255,0.5)", flex: 1 },

  // Buttons
  editBtn: {
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 8,
    paddingVertical: 12,
    borderWidth: 0.5,
    borderColor: BORDER,
    borderRadius: 12,
    alignItems: "center",
    backgroundColor: SURFACE,
  },
  editBtnText: { fontSize: 13, fontWeight: "500", color: "rgba(255,255,255,0.7)" },
});
