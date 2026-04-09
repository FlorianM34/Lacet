import { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Animated,
  ScrollView,
  ActivityIndicator,
  Alert,
} from "react-native";
import { supabase } from "../lib/supabase";
import { getAvatarColor, getInitials } from "../lib/chat";

interface Candidate {
  participation_id: string;
  user_id: string;
  display_name: string;
  age: number;
  rating_avg: number;
  rating_count: number;
  expo_push_token: string | null;
}

interface Props {
  hikeId: string;
  hikeTitle: string;
  maxParticipants: number;
  currentCount: number;
  visible: boolean;
  onClose: () => void;
  onCountChange: (newCount: number) => void;
}

function getAge(birthDate: string): number {
  const today = new Date();
  const birth = new Date(birthDate);
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

export default function PendingRequestsPanel({
  hikeId,
  hikeTitle,
  maxParticipants,
  currentCount,
  visible,
  onClose,
  onCountChange,
}: Props) {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const fadeAnims = useRef<Record<string, Animated.Value>>({});
  const sheetAnim = useRef(new Animated.Value(500)).current;

  useEffect(() => {
    if (visible) {
      fetchCandidates();
      Animated.spring(sheetAnim, { toValue: 0, useNativeDriver: true, bounciness: 0 }).start();
    } else {
      Animated.timing(sheetAnim, { toValue: 500, duration: 220, useNativeDriver: true }).start();
    }
  }, [visible, hikeId]);

  const fetchCandidates = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("participation")
      .select("id, user_id, user:user!user_id(display_name, birth_date, rating_avg, rating_count, expo_push_token)")
      .eq("hike_id", hikeId)
      .eq("status", "pending");

    if (error || !data) {
      setLoading(false);
      return;
    }

    const list: Candidate[] = data.map((p: any) => ({
      participation_id: p.id,
      user_id: p.user_id,
      display_name: p.user?.display_name ?? "Inconnu",
      age: p.user?.birth_date ? getAge(p.user.birth_date) : 0,
      rating_avg: p.user?.rating_avg ?? 0,
      rating_count: p.user?.rating_count ?? 0,
      expo_push_token: p.user?.expo_push_token ?? null,
    }));

    // Init fade animations
    list.forEach((c) => {
      if (!fadeAnims.current[c.participation_id]) {
        fadeAnims.current[c.participation_id] = new Animated.Value(1);
      }
    });

    setCandidates(list);
    setLoading(false);
  };

  const removeWithAnimation = (participationId: string, callback: () => void) => {
    const anim = fadeAnims.current[participationId];
    if (anim) {
      Animated.timing(anim, { toValue: 0, duration: 280, useNativeDriver: true }).start(() => {
        setCandidates((prev) => prev.filter((c) => c.participation_id !== participationId));
        callback();
      });
    } else {
      setCandidates((prev) => prev.filter((c) => c.participation_id !== participationId));
      callback();
    }
  };

  const sendPush = async (token: string | null, title: string, body: string, data?: object) => {
    if (!token) return;
    try {
      await fetch(`${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/send-push`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: token, title, body, data }),
      });
    } catch {}
  };

  const handleAccept = async (candidate: Candidate) => {
    if (processingId) return;
    if (currentCount >= maxParticipants) {
      Alert.alert("Groupe complet", "Il n'y a plus de places disponibles.");
      return;
    }

    setProcessingId(candidate.participation_id);
    try {
      // Accept participation — the DB trigger fn_update_hike_count auto-increments current_count
      const { error: updateErr } = await supabase
        .from("participation")
        .update({ status: "confirmed" })
        .eq("id", candidate.participation_id);
      if (updateErr) throw updateErr;

      const newCount = currentCount + 1;
      onCountChange(newCount);

      // System message in group chat
      await supabase.from("group_message").insert({
        hike_id: hikeId,
        sender_id: null,
        is_system: true,
        content: JSON.stringify({
          type: "system",
          text: `${candidate.display_name} a rejoint le groupe`,
        }),
      });

      // Push to accepted user
      await sendPush(
        candidate.expo_push_token,
        "Demande acceptée !",
        `Tu fais maintenant partie du groupe pour "${hikeTitle}".`,
        { screen: "chat", hike_id: hikeId }
      );

      removeWithAnimation(candidate.participation_id, () => {
        setProcessingId(null);
      });
    } catch (e: any) {
      Alert.alert("Erreur", e?.message ?? "Impossible d'accepter la demande.");
      setProcessingId(null);
    }
  };

  const handleReject = async (candidate: Candidate) => {
    if (processingId) return;
    setProcessingId(candidate.participation_id);
    try {
      const { error } = await supabase
        .from("participation")
        .update({ status: "cancelled" })
        .eq("id", candidate.participation_id);
      if (error) throw error;

      await sendPush(
        candidate.expo_push_token,
        "Demande refusée",
        `Ta demande pour "${hikeTitle}" n'a pas été retenue.`
      );

      removeWithAnimation(candidate.participation_id, () => {
        setProcessingId(null);
      });
    } catch (e: any) {
      Alert.alert("Erreur", e?.message ?? "Impossible de refuser la demande.");
      setProcessingId(null);
    }
  };

  // Auto-close when list becomes empty
  useEffect(() => {
    if (!loading && candidates.length === 0 && visible) {
      const timer = setTimeout(onClose, 1500);
      return () => clearTimeout(timer);
    }
  }, [candidates.length, loading, visible]);

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
      <Animated.View style={[styles.sheet, { transform: [{ translateY: sheetAnim }] }]}>
        <View style={styles.handle} />
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Demandes en attente</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Text style={styles.closeBtnText}>✕</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color="#1D9E75" />
          </View>
        ) : candidates.length === 0 ? (
          <View style={styles.centered}>
            <Text style={styles.emptyIcon}>✓</Text>
            <Text style={styles.emptyText}>Aucune demande en attente</Text>
          </View>
        ) : (
          <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
            {candidates.map((c) => {
              const color = getAvatarColor(c.user_id);
              const anim = fadeAnims.current[c.participation_id] ?? new Animated.Value(1);
              const isProcessing = processingId === c.participation_id;

              return (
                <Animated.View
                  key={c.participation_id}
                  style={[styles.candidateRow, { opacity: anim }]}
                >
                  {/* Avatar */}
                  <View style={[styles.avatar, { backgroundColor: color.bg }]}>
                    <Text style={[styles.avatarText, { color: color.text }]}>
                      {getInitials(c.display_name)}
                    </Text>
                  </View>

                  {/* Info */}
                  <View style={styles.candidateInfo}>
                    <Text style={styles.candidateName}>
                      {c.display_name}{c.age > 0 ? ` · ${c.age} ans` : ""}
                    </Text>
                    <Text style={styles.candidateRating}>
                      {c.rating_count > 0
                        ? `★ ${c.rating_avg.toFixed(1)} · ${c.rating_count} rando${c.rating_count > 1 ? "s" : ""}`
                        : "Nouveau membre"}
                    </Text>
                  </View>

                  {/* Actions */}
                  {isProcessing ? (
                    <ActivityIndicator size="small" color="#1D9E75" style={styles.loader} />
                  ) : (
                    <View style={styles.actions}>
                      <TouchableOpacity
                        style={styles.rejectBtn}
                        onPress={() => handleReject(c)}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.rejectBtnText}>✕</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.acceptBtn}
                        onPress={() => handleAccept(c)}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.acceptBtnText}>✓</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </Animated.View>
              );
            })}
          </ScrollView>
        )}
      </Animated.View>
    </Modal>
  );
}

const BG = "#0f1f14";
const SURFACE = "rgba(255,255,255,0.07)";
const BORDER = "rgba(255,255,255,0.1)";

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  sheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#132219",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "70%",
    paddingBottom: 32,
    borderTopWidth: 0.5,
    borderColor: BORDER,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignSelf: "center",
    marginTop: 10,
    marginBottom: 4,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 0.5,
    borderBottomColor: BORDER,
  },
  headerTitle: { fontSize: 16, fontWeight: "600", color: "white" },
  closeBtn: { padding: 4 },
  closeBtnText: { fontSize: 16, color: "rgba(255,255,255,0.4)" },

  centered: {
    paddingVertical: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyIcon: { fontSize: 32, color: "#1D9E75", marginBottom: 10 },
  emptyText: { fontSize: 14, color: "rgba(255,255,255,0.45)" },

  list: { flex: 1 },
  listContent: { paddingHorizontal: 16, paddingTop: 8 },

  candidateRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
    flexShrink: 0,
  },
  avatarText: { fontSize: 15, fontWeight: "500" },
  candidateInfo: { flex: 1 },
  candidateName: { fontSize: 14, fontWeight: "500", color: "white", marginBottom: 3 },
  candidateRating: { fontSize: 12, color: "rgba(255,255,255,0.4)" },

  actions: { flexDirection: "row", gap: 8 },
  loader: { width: 76 },

  rejectBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(226,75,74,0.15)",
    borderWidth: 0.5,
    borderColor: "rgba(226,75,74,0.4)",
    justifyContent: "center",
    alignItems: "center",
  },
  rejectBtnText: { fontSize: 14, color: "#E24B4A", fontWeight: "600" },
  acceptBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(29,158,117,0.2)",
    borderWidth: 0.5,
    borderColor: "rgba(29,158,117,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  acceptBtnText: { fontSize: 14, color: "#1D9E75", fontWeight: "600" },
});
