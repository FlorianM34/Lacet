import { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Modal } from "react-native";
import { supabase } from "../lib/supabase";
import { useSessionContext } from "../hooks/SessionContext";
import type { HikeWithCreator } from "../types";

interface Props {
  hike: HikeWithCreator;
  onContinue: () => void;
  visible: boolean;
}

function formatDate(dateStr: string, flexible: boolean): string {
  const d = new Date(dateStr);
  const months = ["jan.", "fév.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
  if (flexible) return `Flexible ${months[d.getMonth()]}`;
  const days = ["Dim.", "Lun.", "Mar.", "Mer.", "Jeu.", "Ven.", "Sam."];
  return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]}`;
}

export default function PendingMatchScreen({ hike, onContinue, visible }: Props) {
  const { session } = useSessionContext();
  const userId = session?.user?.id;
  const [cancelling, setCancelling] = useState(false);

  const handleCancel = async () => {
    if (!userId) return;
    setCancelling(true);
    try {
      await supabase
        .from("participation")
        .delete()
        .eq("user_id", userId)
        .eq("hike_id", hike.id)
        .eq("status", "pending");
    } finally {
      setCancelling(false);
      onContinue();
    }
  };

  return (
    <Modal visible={visible} animationType="fade" transparent>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          {/* Clock icon */}
          <View style={styles.iconCircle}>
            <Text style={styles.icon}>⏳</Text>
          </View>

          <Text style={styles.title}>Demande envoyée</Text>
          <Text style={styles.subtitle}>
            L'organisateur doit valider ta demande avant que tu rejoignes le groupe.
          </Text>

          {/* Hike reference */}
          <View style={styles.hikeCard}>
            <Text style={styles.hikeTitle} numberOfLines={2}>{hike.title}</Text>
            <View style={styles.hikeMeta}>
              <Text style={styles.hikeMetaText}>
                {formatDate(hike.date_start, hike.date_flexible)}
              </Text>
              <View style={styles.metaDot} />
              <Text style={styles.hikeMetaText}>
                {hike.current_count}/{hike.max_participants} places
              </Text>
            </View>
            <Text style={styles.hikeStat}>
              {hike.distance_km} km · {hike.elevation_m} m dénivelé
            </Text>
          </View>

          {/* Primary button */}
          <TouchableOpacity style={styles.continueBtn} onPress={onContinue} activeOpacity={0.85}>
            <Text style={styles.continueBtnText}>Continuer à explorer</Text>
          </TouchableOpacity>

          {/* Cancel link */}
          <TouchableOpacity
            style={styles.cancelLink}
            onPress={handleCancel}
            disabled={cancelling}
            activeOpacity={0.7}
          >
            {cancelling ? (
              <ActivityIndicator size="small" color="rgba(255,255,255,0.4)" />
            ) : (
              <Text style={styles.cancelLinkText}>Annuler ma demande</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.75)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  card: {
    backgroundColor: "#1a3020",
    borderRadius: 20,
    padding: 28,
    width: "100%",
    alignItems: "center",
    borderWidth: 0.5,
    borderColor: "rgba(255,255,255,0.12)",
  },

  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "rgba(239,159,39,0.2)",
    borderWidth: 1.5,
    borderColor: "rgba(239,159,39,0.5)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 18,
  },
  icon: { fontSize: 28 },

  title: {
    fontSize: 20,
    fontWeight: "600",
    color: "white",
    marginBottom: 10,
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 14,
    color: "rgba(255,255,255,0.45)",
    textAlign: "center",
    lineHeight: 21,
    marginBottom: 22,
  },

  hikeCard: {
    width: "100%",
    backgroundColor: "rgba(255,255,255,0.07)",
    borderRadius: 12,
    padding: 14,
    marginBottom: 24,
    borderWidth: 0.5,
    borderColor: "rgba(255,255,255,0.12)",
  },
  hikeTitle: {
    fontSize: 15,
    fontWeight: "500",
    color: "white",
    marginBottom: 6,
  },
  hikeMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
  },
  hikeMetaText: { fontSize: 12, color: "rgba(255,255,255,0.55)" },
  metaDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: "rgba(255,255,255,0.3)",
  },
  hikeStat: { fontSize: 11, color: "rgba(255,255,255,0.35)" },

  continueBtn: {
    width: "100%",
    backgroundColor: "#1D9E75",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    marginBottom: 14,
  },
  continueBtnText: { color: "white", fontSize: 15, fontWeight: "600" },

  cancelLink: {
    paddingVertical: 8,
    minHeight: 36,
    justifyContent: "center",
  },
  cancelLinkText: {
    fontSize: 13,
    color: "rgba(255,255,255,0.35)",
    textDecorationLine: "underline",
  },
});
