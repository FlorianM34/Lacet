import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
} from "react-native";

interface Props {
  visible: boolean;
  hikeName: string;
  onViewGroup: () => void;
  onContinue?: () => void;
}

export default function MatchOverlay({ visible, hikeName, onViewGroup, onContinue }: Props) {
  return (
    <Modal visible={visible} animationType="fade" transparent>
      <View style={styles.overlay}>
        <View style={styles.iconCircle}>
          <Text style={styles.iconText}>✓</Text>
        </View>
        <Text style={styles.title}>Tu rejoins la rando !</Text>
        <Text style={styles.subtitle}>
          Tu es ajouté au groupe.{"\n"}Le chat est maintenant ouvert.
        </Text>
        <TouchableOpacity style={styles.primaryBtn} onPress={onViewGroup}>
          <Text style={styles.primaryBtnText}>Voir le groupe</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.secondaryBtn}
          onPress={onContinue ?? onViewGroup}
        >
          <Text style={styles.secondaryBtnText}>Continuer à explorer</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "#1D9E75",
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  iconCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: "rgba(255,255,255,0.2)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 18,
  },
  iconText: { fontSize: 30, color: "white", fontWeight: "600", lineHeight: 34 },
  title: {
    fontSize: 26,
    fontWeight: "500",
    color: "white",
    marginBottom: 10,
    textAlign: "center",
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 14,
    color: "rgba(255,255,255,0.8)",
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 28,
  },
  primaryBtn: {
    backgroundColor: "white",
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: 24,
  },
  primaryBtnText: { fontSize: 14, fontWeight: "500", color: "#085041" },
  secondaryBtn: { marginTop: 12, padding: 8 },
  secondaryBtnText: { fontSize: 13, color: "rgba(255,255,255,0.7)" },
});
