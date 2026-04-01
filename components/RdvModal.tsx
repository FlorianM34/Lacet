import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Platform,
} from "react-native";

interface Props {
  visible: boolean;
  onSend: (location: string, datetime: string) => void;
  onClose: () => void;
}

export default function RdvModal({ visible, onSend, onClose }: Props) {
  const [location, setLocation] = useState("");
  const [datetime, setDatetime] = useState("");

  const handleSend = () => {
    if (!location.trim()) return;
    onSend(location.trim(), datetime.trim() || "À confirmer");
    setLocation("");
    setDatetime("");
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.title}>Point de rendez-vous</Text>

          <Text style={styles.label}>Lieu</Text>
          <TextInput
            style={styles.input}
            value={location}
            onChangeText={setLocation}
            placeholder="Parking de Saint-Mathieu"
            autoFocus
          />

          <Text style={styles.label}>Date et heure</Text>
          <TextInput
            style={styles.input}
            value={datetime}
            onChangeText={setDatetime}
            placeholder="Sam. 5 avr. à 8h00"
            keyboardType={Platform.OS === "ios" ? "default" : "default"}
          />

          <View style={styles.actions}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelText}>Annuler</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.sendBtn, !location.trim() && styles.sendBtnDisabled]}
              onPress={handleSend}
              disabled={!location.trim()}
            >
              <Text style={styles.sendText}>Envoyer</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.4)" },
  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: 40,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#ddd",
    alignSelf: "center",
    marginBottom: 16,
  },
  title: { fontSize: 18, fontWeight: "600", color: "#1a1a1a", marginBottom: 16 },
  label: { fontSize: 14, fontWeight: "600", color: "#333", marginTop: 12, marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
  },
  actions: { flexDirection: "row", gap: 12, marginTop: 24 },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#ccc",
    alignItems: "center",
  },
  cancelText: { color: "#666", fontSize: 14, fontWeight: "500" },
  sendBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: "#2E7D32",
    alignItems: "center",
  },
  sendBtnDisabled: { opacity: 0.5 },
  sendText: { color: "#fff", fontSize: 14, fontWeight: "600" },
});
