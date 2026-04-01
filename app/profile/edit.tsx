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
} from "react-native";
import { router } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import { supabase } from "../../lib/supabase";
import { useSessionContext } from "../../hooks/SessionContext";
import { getAvatarColor, getInitials } from "../../lib/chat";
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

export default function EditProfileScreen() {
  const { profile, refreshProfile } = useSessionContext();

  const [displayName, setDisplayName] = useState(profile?.display_name ?? "");
  const [level, setLevel] = useState<HikeLevel>(profile?.level ?? "easy");
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>(
    profile?.languages ?? ["FR"]
  );
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

  const handleSave = async () => {
    if (!displayName.trim()) {
      Alert.alert("Erreur", "Le prénom est obligatoire.");
      return;
    }
    if (selectedLanguages.length === 0) {
      Alert.alert("Erreur", "Sélectionnez au moins une langue.");
      return;
    }
    if (!profile) return;

    setLoading(true);
    try {
      let photoUrl = profile.photo_url;

      if (photoUri) {
        const ext = photoUri.split(".").pop() ?? "jpg";
        const filePath = `${profile.id}/avatar.${ext}`;
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

      const { error } = await supabase
        .from("user")
        .update({
          display_name: displayName.trim(),
          level,
          languages: selectedLanguages,
          photo_url: photoUrl,
        })
        .eq("id", profile.id);

      if (error) throw error;

      await refreshProfile();
      router.back();
    } catch (error: any) {
      Alert.alert("Erreur", error?.message ?? "Impossible de sauvegarder.");
    } finally {
      setLoading(false);
    }
  };

  if (!profile) return null;

  const avatarColor = getAvatarColor(profile.id);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      keyboardShouldPersistTaps="handled"
    >
      {/* Avatar */}
      <View style={styles.avatarSection}>
        <TouchableOpacity
          style={[styles.avatarLg, { backgroundColor: avatarColor.bg }]}
          onPress={pickPhoto}
        >
          <Text style={[styles.avatarLgText, { color: avatarColor.text }]}>
            {getInitials(displayName || profile.display_name)}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={pickPhoto}>
          <Text style={styles.changePhotoText}>
            {photoUri ? "Photo sélectionnée" : "Changer la photo"}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Prénom */}
      <Text style={styles.label}>Prénom + initiale nom</Text>
      <TextInput
        style={styles.input}
        value={displayName}
        onChangeText={setDisplayName}
        placeholder="Thomas C."
        autoCapitalize="words"
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

      {/* Save */}
      <TouchableOpacity
        style={[styles.saveBtn, loading && styles.saveBtnDisabled]}
        onPress={handleSave}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.saveBtnText}>Enregistrer</Text>
        )}
      </TouchableOpacity>

      {/* Cancel */}
      <TouchableOpacity style={styles.cancelBtn} onPress={() => router.back()}>
        <Text style={styles.cancelBtnText}>Annuler</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  contentContainer: { padding: 20, paddingBottom: 40 },

  avatarSection: { alignItems: "center", marginBottom: 20 },
  avatarLg: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8,
  },
  avatarLgText: { fontSize: 28, fontWeight: "500" },
  changePhotoText: { fontSize: 13, color: "#1D9E75", fontWeight: "500" },

  label: { fontSize: 13, fontWeight: "600", color: "#333", marginTop: 18, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    color: "#1a1a1a",
  },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#ddd",
  },
  chipActive: { backgroundColor: "#1D9E75", borderColor: "#1D9E75" },
  chipText: { fontSize: 13, color: "#333" },
  chipTextActive: { color: "#fff" },

  saveBtn: {
    backgroundColor: "#1D9E75",
    paddingVertical: 14,
    borderRadius: 10,
    marginTop: 28,
    alignItems: "center",
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: "#fff", fontSize: 15, fontWeight: "600" },
  cancelBtn: {
    paddingVertical: 12,
    marginTop: 10,
    alignItems: "center",
  },
  cancelBtnText: { color: "#999", fontSize: 14 },
});
