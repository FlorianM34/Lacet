import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Modal,
  KeyboardAvoidingView,
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
    <Modal visible={visible} animationType="slide" transparent statusBarTranslucent>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.title}>Point de rendez-vous</Text>

          <Text style={styles.label}>Lieu</Text>
          <TextInput
            style={styles.input}
            value={location}
            onChangeText={setLocation}
            placeholder="Parking de Saint-Mathieu"
            placeholderTextColor="rgba(255,255,255,0.25)"
            autoFocus
          />

          <Text style={styles.label}>Date et heure</Text>
          <TextInput
            style={styles.input}
            value={datetime}
            onChangeText={setDatetime}
            placeholder="Sam. 5 avr. à 8h00"
            placeholderTextColor="rgba(255,255,255,0.25)"
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
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "flex-end" },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.6)" },
  sheet: {
    backgroundColor: "#162a1c",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: 40,
    borderTopWidth: 0.5,
    borderColor: "rgba(255,255,255,0.08)",
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignSelf: "center",
    marginBottom: 16,
  },
  title: { fontSize: 18, fontWeight: "600", color: "white", marginBottom: 16 },
  label: { fontSize: 13, fontWeight: "500", color: "rgba(255,255,255,0.55)", marginTop: 12, marginBottom: 8 },
  input: {
    backgroundColor: "#0f1f14",
    borderWidth: 0.5,
    borderColor: "rgba(255,255,255,0.12)",
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: "white",
  },
  actions: { flexDirection: "row", gap: 12, marginTop: 24 },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 0.5,
    borderColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
  },
  cancelText: { color: "rgba(255,255,255,0.5)", fontSize: 14, fontWeight: "500" },
  sendBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: "#1D9E75",
    alignItems: "center",
  },
  sendBtnDisabled: { opacity: 0.5 },
  sendText: { color: "#fff", fontSize: 14, fontWeight: "600" },
});
