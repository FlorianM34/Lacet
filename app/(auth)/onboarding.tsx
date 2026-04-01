import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ScrollView,
  Platform,
} from "react-native";
import { router } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import { supabase } from "../../lib/supabase";
import type { HikeLevel } from "../../types";

const LEVELS: { value: HikeLevel; label: string }[] = [
  { value: "easy", label: "Facile" },
  { value: "intermediate", label: "Intermédiaire" },
  { value: "hard", label: "Difficile" },
  { value: "expert", label: "Expert" },
];

const LANGUAGES = [
  { code: "FR", label: "Français" },
  { code: "EN", label: "English" },
  { code: "ES", label: "Español" },
  { code: "DE", label: "Deutsch" },
  { code: "IT", label: "Italiano" },
];

export default function OnboardingScreen() {
  const [displayName, setDisplayName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [level, setLevel] = useState<HikeLevel>("easy");
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>(["FR"]);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const toggleLanguage = (code: string) => {
    setSelectedLanguages((prev) =>
      prev.includes(code) ? prev.filter((l) => l !== code) : [...prev, code]
    );
  };

  const pickPhoto = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: "image/*",
      copyToCacheDirectory: true,
    });
    if (!result.canceled && result.assets[0]) {
      setPhotoUri(result.assets[0].uri);
    }
  };

  const handleSubmit = async () => {
    if (!displayName.trim()) {
      Alert.alert("Erreur", "Le prénom est obligatoire.");
      return;
    }

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(birthDate)) {
      Alert.alert("Erreur", "Date de naissance invalide. Format : AAAA-MM-JJ");
      return;
    }

    if (selectedLanguages.length === 0) {
      Alert.alert("Erreur", "Sélectionnez au moins une langue.");
      return;
    }

    setLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Session introuvable.");

      let photoUrl: string | null = null;

      if (photoUri) {
        const ext = photoUri.split(".").pop() ?? "jpg";
        const filePath = `${user.id}/avatar.${ext}`;
        const response = await fetch(photoUri);
        const blob = await response.blob();

        const { error: uploadError } = await supabase.storage
          .from("profile-photos")
          .upload(filePath, blob, { contentType: `image/${ext}`, upsert: true });

        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage
          .from("profile-photos")
          .getPublicUrl(filePath);
        photoUrl = urlData.publicUrl;
      }

      const { error } = await supabase.from("user").insert({
        id: user.id,
        phone: user.phone!,
        phone_verified: true,
        display_name: displayName.trim(),
        birth_date: birthDate,
        level,
        languages: selectedLanguages,
        photo_url: photoUrl,
      });

      if (error) throw error;

      router.replace("/(tabs)");
    } catch (error: any) {
      Alert.alert("Erreur", error?.message ?? "Impossible de créer le profil.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.title}>Créer votre profil</Text>
      <Text style={styles.subtitle}>
        Ces informations seront visibles par les autres randonneurs.
      </Text>

      {/* Prénom */}
      <Text style={styles.label}>Prénom + initiale nom</Text>
      <TextInput
        style={styles.input}
        value={displayName}
        onChangeText={setDisplayName}
        placeholder="Thomas C."
        autoCapitalize="words"
      />

      {/* Date de naissance */}
      <Text style={styles.label}>Date de naissance</Text>
      <TextInput
        style={styles.input}
        value={birthDate}
        onChangeText={setBirthDate}
        placeholder="1990-05-15"
        keyboardType={Platform.OS === "ios" ? "numbers-and-punctuation" : "default"}
      />

      {/* Niveau */}
      <Text style={styles.label}>Niveau d'expérience</Text>
      <View style={styles.chipRow}>
        {LEVELS.map((l) => (
          <TouchableOpacity
            key={l.value}
            style={[styles.chip, level === l.value && styles.chipActive]}
            onPress={() => setLevel(l.value)}
          >
            <Text style={[styles.chipText, level === l.value && styles.chipTextActive]}>
              {l.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Langues */}
      <Text style={styles.label}>Langues parlées</Text>
      <View style={styles.chipRow}>
        {LANGUAGES.map((lang) => (
          <TouchableOpacity
            key={lang.code}
            style={[
              styles.chip,
              selectedLanguages.includes(lang.code) && styles.chipActive,
            ]}
            onPress={() => toggleLanguage(lang.code)}
          >
            <Text
              style={[
                styles.chipText,
                selectedLanguages.includes(lang.code) && styles.chipTextActive,
              ]}
            >
              {lang.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Photo */}
      <Text style={styles.label}>Photo de profil (optionnelle)</Text>
      <TouchableOpacity style={styles.photoButton} onPress={pickPhoto}>
        <Text style={styles.photoButtonText}>
          {photoUri ? "Photo sélectionnée" : "Choisir une photo"}
        </Text>
      </TouchableOpacity>

      {/* Submit */}
      <TouchableOpacity
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={handleSubmit}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Commencer</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  contentContainer: { padding: 32, paddingTop: 80 },
  title: { fontSize: 28, fontWeight: "bold", color: "#2E7D32" },
  subtitle: { fontSize: 15, color: "#666", marginTop: 8, marginBottom: 28, lineHeight: 22 },
  label: { fontSize: 14, fontWeight: "600", color: "#333", marginTop: 20, marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
  },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#ccc",
  },
  chipActive: { backgroundColor: "#2E7D32", borderColor: "#2E7D32" },
  chipText: { fontSize: 14, color: "#333" },
  chipTextActive: { color: "#fff" },
  photoButton: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 12,
    borderStyle: "dashed",
    padding: 16,
    alignItems: "center",
  },
  photoButtonText: { color: "#666", fontSize: 14 },
  button: {
    backgroundColor: "#2E7D32",
    paddingVertical: 16,
    borderRadius: 12,
    marginTop: 32,
    marginBottom: 40,
    alignItems: "center",
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
});
