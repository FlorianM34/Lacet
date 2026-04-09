import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { router } from "expo-router";
import { sendOTP } from "../../lib/supabase";

export default function PhoneScreen() {
  const [phone, setPhone] = useState("+33");
  const [loading, setLoading] = useState(false);

  const handleSend = async () => {
    const cleaned = phone.replace(/\s/g, "");
    if (cleaned.length < 10) {
      Alert.alert("Erreur", "Numéro de téléphone invalide.");
      return;
    }

    setLoading(true);
    try {
      await sendOTP(cleaned);
      router.push({ pathname: "/(auth)/verify", params: { phone: cleaned } });
    } catch (error: any) {
      const message =
        error?.message === "For security purposes, you can only request this after 60 seconds."
          ? "Veuillez patienter 60 secondes avant de renvoyer un code."
          : "Impossible d'envoyer le code. Vérifiez votre numéro.";
      Alert.alert("Erreur", message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={styles.content}>
        <Text style={styles.title}>Bienvenue sur Lacet</Text>
        <Text style={styles.subtitle}>
          Entrez votre numéro de téléphone pour recevoir un code de vérification.
        </Text>

        <TextInput
          style={styles.input}
          value={phone}
          onChangeText={setPhone}
          placeholder="+33 6 12 34 56 78"
          placeholderTextColor="rgba(255,255,255,0.25)"
          keyboardType="phone-pad"
          autoFocus
          editable={!loading}
        />

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleSend}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Envoyer le code</Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f1f14" },
  content: { flex: 1, justifyContent: "center", paddingHorizontal: 32 },
  title: { fontSize: 28, fontWeight: "700", textAlign: "center", color: "white" },
  subtitle: {
    fontSize: 15,
    color: "rgba(255,255,255,0.45)",
    textAlign: "center",
    marginTop: 12,
    marginBottom: 32,
    lineHeight: 22,
  },
  input: {
    backgroundColor: "#162a1c",
    borderWidth: 0.5,
    borderColor: "rgba(255,255,255,0.12)",
    borderRadius: 12,
    padding: 16,
    fontSize: 18,
    letterSpacing: 1,
    color: "white",
  },
  button: {
    backgroundColor: "#1D9E75",
    paddingVertical: 16,
    borderRadius: 12,
    marginTop: 20,
    alignItems: "center",
  },
  buttonDisabled: { opacity: 0.55 },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
});
