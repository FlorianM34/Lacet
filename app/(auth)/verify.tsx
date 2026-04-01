import { useState, useEffect, useRef } from "react";
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
import { router, useLocalSearchParams } from "expo-router";
import { sendOTP, verifyOTP, supabase } from "../../lib/supabase";

const RESEND_DELAY = 60;

export default function VerifyScreen() {
  const { phone } = useLocalSearchParams<{ phone: string }>();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [resendTimer, setResendTimer] = useState(RESEND_DELAY);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setResendTimer((prev) => {
        if (prev <= 1) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const handleVerify = async () => {
    if (code.length !== 6) {
      Alert.alert("Erreur", "Entrez le code à 6 chiffres.");
      return;
    }

    setLoading(true);
    try {
      await verifyOTP(phone!, code);

      // Check if user profile already exists
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Session introuvable.");

      const { data: profile } = await supabase
        .from("user")
        .select("id")
        .eq("id", user.id)
        .single();

      if (profile) {
        router.replace("/(tabs)");
      } else {
        router.replace("/(auth)/onboarding");
      }
    } catch (error: any) {
      let message = "Code invalide. Veuillez réessayer.";
      if (error?.message?.includes("expired")) {
        message = "Code expiré. Demandez un nouveau code.";
      } else if (error?.message?.includes("attempts")) {
        message = "Trop de tentatives. Veuillez patienter quelques minutes.";
      }
      Alert.alert("Erreur", message);
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    try {
      await sendOTP(phone!);
      setResendTimer(RESEND_DELAY);
      intervalRef.current = setInterval(() => {
        setResendTimer((prev) => {
          if (prev <= 1) {
            if (intervalRef.current) clearInterval(intervalRef.current);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      Alert.alert("Code renvoyé", "Un nouveau code a été envoyé.");
    } catch {
      Alert.alert("Erreur", "Impossible de renvoyer le code. Réessayez plus tard.");
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={styles.content}>
        <Text style={styles.title}>Vérification</Text>
        <Text style={styles.subtitle}>
          Entrez le code à 6 chiffres envoyé au {phone}
        </Text>

        <TextInput
          style={styles.input}
          value={code}
          onChangeText={(text) => setCode(text.replace(/[^0-9]/g, "").slice(0, 6))}
          placeholder="000000"
          keyboardType="number-pad"
          maxLength={6}
          autoFocus
          editable={!loading}
          textContentType="oneTimeCode"
        />

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleVerify}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Vérifier</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleResend}
          disabled={resendTimer > 0}
          style={styles.resendContainer}
        >
          <Text style={[styles.resendText, resendTimer > 0 && styles.resendDisabled]}>
            {resendTimer > 0
              ? `Renvoyer le code (${resendTimer}s)`
              : "Renvoyer le code"}
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  content: { flex: 1, justifyContent: "center", paddingHorizontal: 32 },
  title: { fontSize: 28, fontWeight: "bold", textAlign: "center", color: "#2E7D32" },
  subtitle: {
    fontSize: 15,
    color: "#666",
    textAlign: "center",
    marginTop: 12,
    marginBottom: 32,
    lineHeight: 22,
  },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 12,
    padding: 16,
    fontSize: 24,
    letterSpacing: 8,
    textAlign: "center",
  },
  button: {
    backgroundColor: "#2E7D32",
    paddingVertical: 16,
    borderRadius: 12,
    marginTop: 20,
    alignItems: "center",
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  resendContainer: { marginTop: 24, alignItems: "center" },
  resendText: { fontSize: 14, color: "#2E7D32", fontWeight: "500" },
  resendDisabled: { color: "#999" },
});
