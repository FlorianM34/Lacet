import { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Switch,
  TextInput,
  Modal,
  StyleSheet,
  Alert,
  Linking,
  ActionSheetIOS,
  Platform,
  ActivityIndicator,
} from "react-native";
import { router } from "expo-router";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";
import { supabase } from "../lib/supabase";
import { useSessionContext } from "../hooks/SessionContext";

interface NotificationPrefs {
  new_member: boolean;
  new_message: boolean;
  group_full: boolean;
  reminder: boolean;
  rating: boolean;
}

const NOTIFICATION_LABELS: { key: keyof NotificationPrefs; title: string; subtitle: string }[] = [
  { key: "new_member", title: "Nouveau membre", subtitle: "Quand quelqu'un rejoint ta rando" },
  { key: "new_message", title: "Nouveaux messages", subtitle: "Dans tes groupes" },
  { key: "group_full", title: "Groupe complet", subtitle: "Quand ta rando est pleine" },
  { key: "reminder", title: "Rappel J-1", subtitle: "La veille de chaque rando" },
  { key: "rating", title: "Notation", subtitle: "Après une rando terminée" },
];

const THEME_OPTIONS = ["Système", "Clair", "Sombre"] as const;
type ThemeChoice = typeof THEME_OPTIONS[number];

export default function SettingsScreen() {
  const { session, signOut, profile } = useSessionContext();
  const userId = session?.user?.id;

  const [notifPerms, setNotifPerms] = useState<"granted" | "denied" | "undetermined">("undetermined");
  const [notifPrefs, setNotifPrefs] = useState<NotificationPrefs>({
    new_member: true,
    new_message: true,
    group_full: true,
    reminder: false,
    rating: true,
  });

  const [language, setLanguage] = useState("Français");
  const [theme, setTheme] = useState<ThemeChoice>("Système");

  // Delete account modal state
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleteLoading, setDeleteLoading] = useState(false);

  const appVersion = Constants.expoConfig?.version ?? "1.0.0";
  const buildNumber = (Constants.expoConfig as any)?.ios?.buildNumber ?? "1";

  // Format phone number as +33 X XX XX XX XX
  const formatPhone = (phone: string | null | undefined): string => {
    if (!phone) return "—";
    const digits = phone.replace(/\D/g, "");
    if (digits.startsWith("33") && digits.length === 11) {
      const local = digits.slice(2);
      return `+33 ${local[0]} ${local.slice(1, 3)} ${local.slice(3, 5)} ${local.slice(5, 7)} ${local.slice(7, 9)}`;
    }
    return phone;
  };

  useEffect(() => {
    Notifications.getPermissionsAsync().then(({ status }) => {
      setNotifPerms(status as "granted" | "denied" | "undetermined");
    });

    if (userId) {
      supabase
        .from("user")
        .select("notification_prefs")
        .eq("id", userId)
        .single()
        .then(({ data }) => {
          if (data?.notification_prefs) {
            setNotifPrefs(data.notification_prefs as NotificationPrefs);
          }
        });
    }

    SecureStore.getItemAsync("lacet_language").then((v) => { if (v) setLanguage(v); });
    SecureStore.getItemAsync("lacet_theme").then((v) => { if (v) setTheme(v as ThemeChoice); });
  }, [userId]);

  const toggleNotif = useCallback(async (key: keyof NotificationPrefs, value: boolean) => {
    const updated = { ...notifPrefs, [key]: value };
    setNotifPrefs(updated);
    if (!userId) return;
    await supabase
      .from("user")
      .update({ notification_prefs: updated })
      .eq("id", userId);
  }, [userId, notifPrefs]);

  const handleLanguage = () => {
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ["Annuler", "Français", "English"], cancelButtonIndex: 0 },
        (idx) => {
          if (idx === 0) return;
          const chosen = idx === 1 ? "Français" : "English";
          setLanguage(chosen);
          SecureStore.setItemAsync("lacet_language", chosen);
        }
      );
    }
  };

  const handleTheme = (choice: ThemeChoice) => {
    setTheme(choice);
    SecureStore.setItemAsync("lacet_theme", choice);
  };

  const handleSignOut = () => {
    Alert.alert("Déconnexion", "Voulez-vous vraiment vous déconnecter ?", [
      { text: "Annuler", style: "cancel" },
      {
        text: "Se déconnecter",
        style: "destructive",
        onPress: async () => {
          await signOut();
          router.replace("/(auth)/phone");
        },
      },
    ]);
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== "SUPPRIMER") return;
    setDeleteLoading(true);
    try {
      const { error } = await supabase.functions.invoke("delete-account");
      if (error) throw error;
      await SecureStore.deleteItemAsync("lacet_language").catch(() => {});
      await SecureStore.deleteItemAsync("lacet_theme").catch(() => {});
      router.replace("/(auth)/phone");
    } catch (err: any) {
      Alert.alert("Erreur", err?.message ?? "La suppression a échoué. Réessaie.");
    } finally {
      setDeleteLoading(false);
      setDeleteModalVisible(false);
    }
  };

  const phoneDisplay = formatPhone((profile as any)?.phone ?? session?.user?.phone);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>

      {/* ── Section Mon compte ── */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>MON COMPTE</Text>

        <View style={styles.row}>
          <Text style={styles.rowLabel}>Téléphone</Text>
          <Text style={styles.rowValueRight}>{phoneDisplay}</Text>
        </View>

        <TouchableOpacity style={styles.row} onPress={() => router.push("/profile/edit")}>
          <Text style={styles.rowLabel}>Modifier mon profil</Text>
          <Text style={styles.rowChevron}>›</Text>
        </TouchableOpacity>

        <View style={[styles.row, styles.rowLast]}>
          <Text style={styles.rowLabel}>Version</Text>
          <Text style={styles.rowValueRight}>{appVersion} ({buildNumber})</Text>
        </View>
      </View>

      {/* ── Section Notifications ── */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>NOTIFICATIONS</Text>

        {notifPerms !== "granted" && (
          <View style={styles.notifBanner}>
            <Text style={styles.notifBannerText}>Notifications désactivées dans les réglages iOS</Text>
            <TouchableOpacity onPress={() => Linking.openSettings()}>
              <Text style={styles.notifBannerBtn}>Réglages</Text>
            </TouchableOpacity>
          </View>
        )}

        {NOTIFICATION_LABELS.map(({ key, title, subtitle }, idx) => (
          <View
            key={key}
            style={[styles.toggleRow, idx === NOTIFICATION_LABELS.length - 1 && styles.rowLast]}
          >
            <View style={styles.toggleLabels}>
              <Text style={[styles.rowLabel, notifPerms !== "granted" && { opacity: 0.4 }]}>{title}</Text>
              <Text style={[styles.toggleSubtitle, notifPerms !== "granted" && { opacity: 0.4 }]}>{subtitle}</Text>
            </View>
            <Switch
              value={notifPrefs[key]}
              onValueChange={(v) => toggleNotif(key, v)}
              disabled={notifPerms !== "granted"}
              trackColor={{ false: "rgba(255,255,255,0.15)", true: "rgba(29,158,117,0.6)" }}
              thumbColor={notifPrefs[key] ? "#1D9E75" : "rgba(255,255,255,0.6)"}
              style={notifPerms !== "granted" ? { opacity: 0.4 } : undefined}
            />
          </View>
        ))}
      </View>

      {/* ── Section Affichage ── */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>AFFICHAGE</Text>

        <TouchableOpacity style={styles.row} onPress={handleLanguage}>
          <Text style={styles.rowLabel}>Langue</Text>
          <View style={styles.rowRight}>
            <Text style={styles.rowValueRight}>{language}</Text>
            <Text style={styles.rowChevron}>›</Text>
          </View>
        </TouchableOpacity>

        <View style={[styles.row, styles.rowLast, { alignItems: "flex-start", paddingVertical: 12 }]}>
          <Text style={styles.rowLabel}>Thème</Text>
          <View style={styles.themeRow}>
            {THEME_OPTIONS.map((option) => (
              <TouchableOpacity
                key={option}
                style={[styles.themeBtn, theme === option && styles.themeBtnActive]}
                onPress={() => handleTheme(option)}
              >
                <Text style={[styles.themeBtnText, theme === option && styles.themeBtnTextActive]}>
                  {option}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>

      {/* ── Section Légal & support ── */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>LÉGAL & SUPPORT</Text>

        <TouchableOpacity
          style={styles.row}
          onPress={() => Linking.openURL("https://lacet.app/cgu")} // TODO: remplacer par l'URL réelle
        >
          <Text style={styles.rowLabel}>Conditions d'utilisation</Text>
          <Text style={styles.rowChevron}>›</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.row}
          onPress={() => Linking.openURL("https://lacet.app/privacy")} // TODO: remplacer par l'URL réelle
        >
          <Text style={styles.rowLabel}>Politique de confidentialité</Text>
          <Text style={styles.rowChevron}>›</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.row}
          onPress={() => Linking.openURL("mailto:support@lacet.app?subject=Support Lacet")}
        >
          <Text style={styles.rowLabel}>Nous contacter</Text>
          <Text style={styles.rowChevron}>›</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.row, styles.rowLast]}
          onPress={() => Linking.openURL("itms-apps://itunes.apple.com/app/idTON_APP_ID")} // TODO: remplacer TON_APP_ID après soumission App Store
        >
          <Text style={styles.rowLabel}>Noter Lacet</Text>
          <Text style={styles.rowChevron}>›</Text>
        </TouchableOpacity>
      </View>

      {/* ── Zone danger ── */}
      <View style={[styles.section, styles.dangerZone]}>
        <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut}>
          <Text style={styles.signOutText}>Se déconnecter</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.deleteBtn}
          onPress={() => { setDeleteConfirmText(""); setDeleteModalVisible(true); }}
        >
          <Text style={styles.deleteText}>Supprimer mon compte</Text>
        </TouchableOpacity>
      </View>

      {/* ── Modal confirmation suppression ── */}
      <Modal
        visible={deleteModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setDeleteModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Supprimer mon compte</Text>
            <Text style={styles.modalSubtitle}>
              Cette action est irréversible. Toutes tes données seront effacées.{"\n"}
              Tape <Text style={{ fontWeight: "700" }}>SUPPRIMER</Text> pour confirmer.
            </Text>
            <TextInput
              style={styles.confirmInput}
              placeholder="SUPPRIMER"
              placeholderTextColor="rgba(255,255,255,0.25)"
              autoCapitalize="characters"
              value={deleteConfirmText}
              onChangeText={setDeleteConfirmText}
            />
            <TouchableOpacity
              style={[
                styles.confirmBtn,
                deleteConfirmText !== "SUPPRIMER" && styles.confirmBtnDisabled,
              ]}
              onPress={handleDeleteAccount}
              disabled={deleteConfirmText !== "SUPPRIMER" || deleteLoading}
            >
              {deleteLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.confirmBtnText}>Supprimer définitivement</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={() => setDeleteModalVisible(false)}
            >
              <Text style={styles.cancelText}>Annuler</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const BG = "#0f1f14";
const SURFACE = "rgba(255,255,255,0.07)";
const BORDER = "rgba(255,255,255,0.1)";
const BORDER_SUBTLE = "rgba(255,255,255,0.06)";

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  content: { paddingBottom: 48 },

  section: {
    backgroundColor: SURFACE,
    marginTop: 16,
    borderTopWidth: 0.5,
    borderBottomWidth: 0.5,
    borderColor: BORDER,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: "500",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: "rgba(255,255,255,0.35)",
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 6,
  },

  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderTopWidth: 0.5,
    borderTopColor: BORDER_SUBTLE,
  },
  rowLast: { borderBottomWidth: 0 },
  rowLabel: { fontSize: 15, color: "white" },
  rowRight: { flexDirection: "row", alignItems: "center", gap: 4 },
  rowValueRight: { fontSize: 14, color: "rgba(255,255,255,0.4)" },
  rowChevron: { fontSize: 20, color: "rgba(255,255,255,0.25)", lineHeight: 22 },

  // Notifications
  notifBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(250,199,117,0.12)",
    borderWidth: 0.5,
    borderColor: "rgba(250,199,117,0.3)",
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  notifBannerText: { fontSize: 12, color: "#FAC775", flex: 1, marginRight: 8 },
  notifBannerBtn: { fontSize: 12, fontWeight: "600", color: "#FAC775" },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 0.5,
    borderTopColor: BORDER_SUBTLE,
  },
  toggleLabels: { flex: 1, marginRight: 12 },
  toggleSubtitle: { fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 2 },

  // Thème
  themeRow: { flexDirection: "row", gap: 6 },
  themeBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 0.5,
    borderColor: BORDER,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  themeBtnActive: { backgroundColor: "rgba(29,158,117,0.25)", borderColor: "rgba(29,158,117,0.5)" },
  themeBtnText: { fontSize: 13, color: "rgba(255,255,255,0.45)" },
  themeBtnTextActive: { color: "#9FE1CB", fontWeight: "500" },

  // Danger zone
  dangerZone: { marginTop: 24, borderTopWidth: 0.5, borderTopColor: BORDER },
  signOutBtn: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderTopWidth: 0.5,
    borderTopColor: BORDER_SUBTLE,
    alignItems: "center",
  },
  signOutText: { fontSize: 15, color: "#1D9E75", fontWeight: "500" },
  deleteBtn: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderTopWidth: 0.5,
    borderTopColor: BORDER_SUBTLE,
    alignItems: "center",
  },
  deleteText: { fontSize: 15, color: "#E53E3E", fontWeight: "500" },

  // Delete modal
  modalOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.6)" },
  modalSheet: {
    backgroundColor: "#132219",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 40,
  },
  modalTitle: { fontSize: 18, fontWeight: "600", color: "white", marginBottom: 8 },
  modalSubtitle: { fontSize: 14, color: "rgba(255,255,255,0.55)", lineHeight: 20, marginBottom: 20 },
  confirmInput: {
    backgroundColor: SURFACE,
    borderWidth: 0.5,
    borderColor: BORDER,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: "white",
    marginBottom: 16,
    letterSpacing: 1,
  },
  confirmBtn: {
    backgroundColor: "#E53E3E",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    marginBottom: 10,
  },
  confirmBtnDisabled: { opacity: 0.35 },
  confirmBtnText: { fontSize: 15, fontWeight: "600", color: "#fff" },
  cancelBtn: { alignItems: "center", paddingVertical: 10 },
  cancelText: { fontSize: 14, color: "rgba(255,255,255,0.4)" },
});
