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
}

export default function MatchOverlay({ visible, hikeName, onViewGroup }: Props) {
  return (
    <Modal visible={visible} animationType="fade" transparent>
      <View style={styles.overlay}>
        <Text style={styles.emoji}>🎉</Text>
        <Text style={styles.title}>Tu rejoins la rando !</Text>
        <Text style={styles.subtitle}>
          Tu es ajouté au groupe «{hikeName}».{"\n"}Le chat est maintenant ouvert.
        </Text>
        <TouchableOpacity style={styles.button} onPress={onViewGroup}>
          <Text style={styles.buttonText}>Voir le groupe</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(29,158,117,0.97)",
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  emoji: { fontSize: 40, marginBottom: 12 },
  title: { fontSize: 26, fontWeight: "500", color: "#fff" },
  subtitle: {
    fontSize: 14,
    color: "rgba(255,255,255,0.85)",
    textAlign: "center",
    marginTop: 8,
    lineHeight: 22,
  },
  button: {
    marginTop: 24,
    backgroundColor: "#fff",
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: 24,
  },
  buttonText: { fontSize: 14, fontWeight: "500", color: "#085041" },
});
