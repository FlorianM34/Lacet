import { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Animated,
} from "react-native";
import { supabase } from "../lib/supabase";
import { getAvatarColor, getInitials } from "../lib/chat";

interface RatableMember {
  id: string;
  display_name: string;
  birth_date?: string | null;
  rating_count?: number;
}

interface Props {
  visible: boolean;
  hikeId: string;
  raterId: string;
  members: RatableMember[];
  onClose: () => void;
  onDone: () => void;
}

function getAge(birthDate: string): number {
  const today = new Date();
  const birth = new Date(birthDate);
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

export default function RatingModal({ visible, hikeId, raterId, members, onClose, onDone }: Props) {
  const [step, setStep] = useState(0);
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [done, setDone] = useState(false);

  const slideY = useRef(new Animated.Value(600)).current;

  useEffect(() => {
    if (visible) {
      Animated.spring(slideY, { toValue: 0, useNativeDriver: true, bounciness: 4 }).start();
    } else {
      slideY.setValue(600);
      setStep(0);
      setRatings({});
      setDone(false);
    }
  }, [visible]);

  const current = members[step];

  const handleNext = async () => {
    if (step < members.length - 1) {
      setStep((s) => s + 1);
    } else {
      await submitRatings();
    }
  };

  const handleSkip = () => {
    if (step < members.length - 1) {
      setStep((s) => s + 1);
    } else {
      submitRatings();
    }
  };

  const submitRatings = async () => {
    const inserts = Object.entries(ratings).map(([rated_id, score]) => ({
      hike_id: hikeId,
      rater_id: raterId,
      rated_id,
      score,
      context: "completed" as const,
      revealed: false,
    }));
    if (inserts.length > 0) {
      await supabase.from("rating").insert(inserts);
    }
    setDone(true);
  };

  const handleClose = () => {
    onDone();
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <Animated.View style={[styles.sheet, { transform: [{ translateY: slideY }] }]}>
          <View style={styles.handle} />

          {!done ? (
            <>
              {/* Header */}
              <View style={styles.header}>
                <Text style={styles.title}>Notation</Text>
                <Text style={styles.subtitle}>
                  {step + 1} sur {members.length} · {current?.display_name}
                </Text>
                <View style={styles.dots}>
                  {members.map((_, i) => (
                    <View
                      key={i}
                      style={[
                        styles.dot,
                        i < step && styles.dotDone,
                        i === step && styles.dotActive,
                      ]}
                    />
                  ))}
                </View>
              </View>

              {/* Person */}
              {current && (
                <View style={styles.personCard}>
                  <View style={styles.personRow}>
                    <View style={[styles.personAvatar, { backgroundColor: getAvatarColor(current.id).bg }]}>
                      <Text style={[styles.personAvatarText, { color: getAvatarColor(current.id).text }]}>
                        {getInitials(current.display_name)}
                      </Text>
                    </View>
                    <View>
                      <Text style={styles.personName}>{current.display_name}</Text>
                      <Text style={styles.personMeta}>
                        {current.birth_date ? `${getAge(current.birth_date)} ans` : ""}
                        {current.rating_count != null
                          ? `  ·  ${current.rating_count} rando${current.rating_count !== 1 ? "s" : ""}`
                          : ""}
                      </Text>
                    </View>
                  </View>

                  {/* Stars */}
                  <View style={styles.starsRow}>
                    {[1, 2, 3, 4, 5].map((score) => {
                      const selected = (ratings[current.id] ?? 0) >= score;
                      return (
                        <TouchableOpacity
                          key={score}
                          style={[styles.starBtn, selected && styles.starBtnSelected]}
                          onPress={() => setRatings((prev) => ({ ...prev, [current.id]: score }))}
                        >
                          <Text style={[styles.starText, selected && styles.starTextSelected]}>★</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  <TouchableOpacity
                    style={[styles.nextBtn, ratings[current.id] && styles.nextBtnReady]}
                    onPress={handleNext}
                    disabled={!ratings[current.id]}
                  >
                    <Text style={styles.nextBtnText}>
                      {step < members.length - 1 ? "Suivant" : "Envoyer mes notes"}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity onPress={handleSkip}>
                    <Text style={styles.skipBtn}>Passer</Text>
                  </TouchableOpacity>
                </View>
              )}
            </>
          ) : (
            <View style={styles.doneScreen}>
              <View style={styles.doneIcon}>
                <Text style={styles.doneIconText}>✓</Text>
              </View>
              <Text style={styles.doneTitle}>Notes envoyées !</Text>
              <Text style={styles.doneSub}>
                Tes notes seront révélées quand tous les membres auront répondu, ou dans 48h.
              </Text>
              <TouchableOpacity style={styles.closeBtn} onPress={handleClose}>
                <Text style={styles.closeBtnText}>Fermer</Text>
              </TouchableOpacity>
            </View>
          )}
        </Animated.View>
      </View>
    </Modal>
  );
}

const GREEN = "#1D9E75";
const GREEN_LIGHT = "#E1F5EE";

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 36,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#E0E0E0",
    alignSelf: "center",
    marginTop: 10,
    marginBottom: 4,
  },

  // Header
  header: {
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 0.5,
    borderBottomColor: "#ECECEC",
  },
  title: { fontSize: 14, fontWeight: "500", color: "#1A1A1A" },
  subtitle: { fontSize: 11, color: "#999", marginTop: 2 },
  dots: { flexDirection: "row", gap: 5, marginTop: 10 },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#E0E0E0",
  },
  dotActive: { width: 18, borderRadius: 3, backgroundColor: GREEN },
  dotDone: { backgroundColor: "#9FE1CB" },

  // Person card
  personCard: { paddingHorizontal: 18, paddingTop: 18 },
  personRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 18 },
  personAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    justifyContent: "center",
    alignItems: "center",
  },
  personAvatarText: { fontSize: 15, fontWeight: "500" },
  personName: { fontSize: 14, fontWeight: "500", color: "#1A1A1A" },
  personMeta: { fontSize: 11, color: "#999", marginTop: 2 },

  // Stars
  starsRow: { flexDirection: "row", justifyContent: "center", gap: 8, marginBottom: 20 },
  starBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: "#E0E0E0",
    backgroundColor: "#F5F5F5",
    justifyContent: "center",
    alignItems: "center",
  },
  starBtnSelected: { backgroundColor: "#FAEEDA", borderColor: "#FAC775" },
  starText: { fontSize: 20, color: "#D3D1C7" },
  starTextSelected: { color: "#EF9F27" },

  // Buttons
  nextBtn: {
    backgroundColor: "#CCCCCC",
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: "center",
    opacity: 0.5,
  },
  nextBtnReady: { backgroundColor: GREEN, opacity: 1 },
  nextBtnText: { fontSize: 13, fontWeight: "500", color: "#fff" },
  skipBtn: {
    textAlign: "center",
    fontSize: 11,
    color: "#999",
    marginTop: 12,
    paddingBottom: 4,
  },

  // Done screen
  doneScreen: { padding: 28, alignItems: "center" },
  doneIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: GREEN_LIGHT,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 14,
  },
  doneIconText: { fontSize: 22, color: GREEN, fontWeight: "600" },
  doneTitle: { fontSize: 15, fontWeight: "500", color: "#1A1A1A", marginBottom: 8 },
  doneSub: {
    fontSize: 12,
    color: "#888",
    textAlign: "center",
    lineHeight: 18,
    marginBottom: 20,
  },
  closeBtn: {
    width: "100%",
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 0.5,
    borderColor: "#E0E0E0",
    backgroundColor: "#F5F5F5",
    alignItems: "center",
  },
  closeBtnText: { fontSize: 13, color: "#1A1A1A" },
});
