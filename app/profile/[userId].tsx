import { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { supabase } from "../../lib/supabase";
import { getAvatarColor, getInitials } from "../../lib/chat";
import BadgeChip from "../../components/BadgeChip";
import type { HikeLevel } from "../../types";

interface PublicProfile {
  id: string;
  display_name: string;
  birth_date: string;
  level: HikeLevel;
  languages: string[];
  rating_avg: number;
  rating_count: number;
}

interface PublicStats {
  totalHikes: number;
  totalKm: number;
  organized: number;
}

interface PublicReview {
  id: string;
  score: number;
  rater_name: string;
  rater_id: string;
  hike_title: string;
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
      <Text key={i} style={{ fontSize: size, color: i <= Math.round(rating) ? "#1D9E75" : "#9FE1CB" }}>
        ★
      </Text>
    );
  }
  return stars;
}

export default function PublicProfileScreen() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [stats, setStats] = useState<PublicStats>({ totalHikes: 0, totalKm: 0, organized: 0 });
  const [reviews, setReviews] = useState<PublicReview[]>([]);
  const [badges, setBadges] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;

    (async () => {
      try {
        // Fetch user profile
        const { data: userData } = await supabase
          .from("user")
          .select("id, display_name, birth_date, level, languages, rating_avg, rating_count")
          .eq("id", userId)
          .single();

        if (!userData) {
          setLoading(false);
          return;
        }
        setProfile(userData as PublicProfile);

        // Fetch participations for stats
        const { data: participations } = await supabase
          .from("participation")
          .select("hike_id, role, hike:hike!hike_id(distance_km)")
          .eq("user_id", userId)
          .eq("status", "confirmed");

        const items = (participations ?? []) as any[];
        const totalHikes = items.length;
        const totalKm = items.reduce((sum: number, p: any) => sum + (p.hike?.distance_km ?? 0), 0);
        const organized = items.filter((p: any) => p.role === "actor").length;
        setStats({ totalHikes, totalKm: Math.round(totalKm), organized });

        // Fetch reviews
        const { data: ratingsData } = await supabase
          .from("rating")
          .select("id, score, rater_id, rater:user!rater_id(display_name), hike:hike!hike_id(title)")
          .eq("rated_id", userId)
          .eq("revealed", true)
          .order("submitted_at", { ascending: false })
          .limit(5);

        const reviewItems: PublicReview[] = (ratingsData ?? []).map((r: any) => ({
          id: r.id,
          score: r.score,
          rater_name: (r.rater as any)?.display_name ?? "Inconnu",
          rater_id: r.rater_id,
          hike_title: (r.hike as any)?.title ?? "",
        }));
        setReviews(reviewItems);

        // Fetch badges
        const { data: badgesData } = await supabase
          .from("user_badge")
          .select("badge_id")
          .eq("user_id", userId)
          .order("earned_at", { ascending: true });
        setBadges((badgesData ?? []).map((b: any) => b.badge_id));
      } catch {
        // silently fail
      } finally {
        setLoading(false);
      }
    })();
  }, [userId]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#1D9E75" />
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyText}>Profil introuvable</Text>
      </View>
    );
  }

  const avatarColor = getAvatarColor(profile.id);
  const age = getAge(profile.birth_date);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      {/* Header */}
      <View style={styles.header}>
        <View style={[styles.avatarLg, { backgroundColor: avatarColor.bg }]}>
          <Text style={[styles.avatarLgText, { color: avatarColor.text }]}>
            {getInitials(profile.display_name)}
          </Text>
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

      {/* Reviews */}
      {reviews.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>AVIS REÇUS</Text>
          {reviews.map((review) => {
            const color = getAvatarColor(review.rater_id);
            return (
              <View key={review.id} style={styles.reviewItem}>
                <View style={styles.reviewHeader}>
                  <View style={[styles.reviewAvatar, { backgroundColor: color.bg }]}>
                    <Text style={[styles.reviewAvatarText, { color: color.text }]}>
                      {getInitials(review.rater_name)}
                    </Text>
                  </View>
                  <Text style={styles.reviewName}>{review.rater_name}</Text>
                  <View style={styles.reviewScore}>{renderStars(review.score, 11)}</View>
                </View>
                <Text style={styles.reviewContext}>{review.hike_title}</Text>
              </View>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  contentContainer: { paddingBottom: 40 },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  emptyText: { fontSize: 15, color: "#999" },

  header: {
    alignItems: "center",
    paddingVertical: 20,
    paddingHorizontal: 16,
    borderBottomWidth: 0.5,
    borderBottomColor: "#e0e0e0",
  },
  avatarLg: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  avatarLgText: { fontSize: 24, fontWeight: "500" },
  profileName: { fontSize: 18, fontWeight: "500", color: "#1a1a1a", marginBottom: 3 },
  profileAge: { fontSize: 13, color: "#888", marginBottom: 10 },
  tagsRow: { flexDirection: "row", gap: 6, flexWrap: "wrap", justifyContent: "center", marginBottom: 14 },
  tag: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20, borderWidth: 0.5 },
  tagAmber: { backgroundColor: "#FAEEDA", borderColor: "#FAC775" },
  tagAmberText: { fontSize: 11, color: "#633806" },
  tagPurple: { backgroundColor: "#EEEDFE", borderColor: "#CECBF6" },
  tagPurpleText: { fontSize: 11, color: "#3C3489" },
  ratingBlock: { flexDirection: "row", alignItems: "center", gap: 6 },
  starsRow: { flexDirection: "row", gap: 2 },
  ratingVal: { fontSize: 15, fontWeight: "500", color: "#1a1a1a" },
  ratingCount: { fontSize: 12, color: "#999" },

  statsGrid: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#e0e0e0" },
  statCell: { flex: 1, paddingVertical: 14, alignItems: "center" },
  statCellBorder: { borderLeftWidth: 0.5, borderRightWidth: 0.5, borderColor: "#e0e0e0" },
  statVal: { fontSize: 18, fontWeight: "500", color: "#1a1a1a" },
  statLbl: { fontSize: 11, color: "#999", marginTop: 2 },

  section: { paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: "#e0e0e0" },
  badgesRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "500",
    letterSpacing: 0.5,
    color: "#999",
    marginBottom: 10,
  },

  reviewItem: { marginBottom: 12 },
  reviewHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 },
  reviewAvatar: { width: 22, height: 22, borderRadius: 11, justifyContent: "center", alignItems: "center" },
  reviewAvatarText: { fontSize: 9, fontWeight: "500" },
  reviewName: { fontSize: 12, fontWeight: "500", color: "#1a1a1a", flex: 1 },
  reviewScore: { flexDirection: "row", gap: 2 },
  reviewContext: { fontSize: 11, color: "#999", paddingLeft: 28 },
});
