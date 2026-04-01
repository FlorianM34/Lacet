import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
} from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as Location from "expo-location";
import { router } from "expo-router";
import { supabase } from "../../lib/supabase";
import { useSessionContext } from "../../hooks/SessionContext";
import type { HikeLevel } from "../../types";

const GREEN = "#1D9E75";
const GREEN_LIGHT = "#E1F5EE";
const GREEN_DARK = "#085041";
const GREEN_MID = "#0F6E56";
const GREEN_BORDER = "#5DCAA5";

const LEVELS: { value: HikeLevel; label: string }[] = [
  { value: "easy", label: "Facile" },
  { value: "intermediate", label: "Intermédiaire" },
  { value: "hard", label: "Difficile" },
  { value: "expert", label: "Expert" },
];

interface ParsedGPXResult {
  distance_km: number;
  elevation_m: number;
  duration_min: number;
  coordinates: [number, number][];
}

function formatDuration(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`;
}

export default function CreateScreen() {
  const { session } = useSessionContext();

  const [gpxFileName, setGpxFileName] = useState<string | null>(null);
  const [gpxFileUri, setGpxFileUri] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);

  const [coordinates, setCoordinates] = useState<[number, number][]>([]);
  const [distanceKm, setDistanceKm] = useState<number | null>(null);
  const [elevationM, setElevationM] = useState<number | null>(null);
  const [durationMin, setDurationMin] = useState<number | null>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dateStart, setDateStart] = useState("");
  const [dateFlexible, setDateFlexible] = useState(false);
  const [level, setLevel] = useState<HikeLevel>("intermediate");
  const [maxParticipants, setMaxParticipants] = useState(3);
  const [hasVehicle, setHasVehicle] = useState(true);

  const [publishing, setPublishing] = useState(false);

  const handlePickGPX = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: "*/*",
      copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets[0]) return;

    const file = result.assets[0];
    if (!file.name?.toLowerCase().endsWith(".gpx")) {
      Alert.alert("Erreur", "Veuillez sélectionner un fichier .gpx");
      return;
    }

    setGpxFileName(file.name);
    setGpxFileUri(file.uri);
    setParsing(true);

    try {
      const response = await fetch(file.uri);
      const gpxContent = await response.text();

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;

      const parseResponse = await fetch(
        `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/parse-gpx`,
        {
          method: "POST",
          headers: {
            "Content-Type": "text/xml",
            Authorization: `Bearer ${token}`,
            apikey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
          },
          body: gpxContent,
        }
      );

      console.log(parseResponse)

      if (!parseResponse.ok) {
        const err = await parseResponse.json();
        throw new Error(err.error || "Erreur lors du parsing GPX.");
      }

      const parsed: ParsedGPXResult = await parseResponse.json();
      setCoordinates(parsed.coordinates);
      setDistanceKm(parsed.distance_km);
      setElevationM(parsed.elevation_m);
      setDurationMin(parsed.duration_min);
    } catch (error: any) {
      Alert.alert("Erreur GPX", error?.message ?? "Impossible de parser le fichier GPX.");
      setGpxFileName(null);
      setGpxFileUri(null);
    } finally {
      setParsing(false);
    }
  };

  const handleChangeGPX = () => {
    setGpxFileName(null);
    setGpxFileUri(null);
    setCoordinates([]);
    setDistanceKm(null);
    setElevationM(null);
    setDurationMin(null);
  };

  const handlePublish = async () => {
    if (!title.trim()) {
      Alert.alert("Erreur", "Le titre est obligatoire.");
      return;
    }
    if (!dateStart && !dateFlexible) {
      Alert.alert("Erreur", "Indiquez une date ou activez la date flexible.");
      return;
    }
    if (coordinates.length < 2) {
      Alert.alert("Erreur", "Importez un fichier GPX pour définir le tracé.");
      return;
    }

    setPublishing(true);
    try {
      const userId = session?.user?.id;
      if (!userId) throw new Error("Session introuvable.");

      const [lng, lat] = coordinates[0];

      let gpxUrl: string | null = null;
      if (gpxFileUri && gpxFileName) {
        const response = await fetch(gpxFileUri);
        const blob = await response.blob();
        const filePath = `${userId}/${Date.now()}-${gpxFileName}`;

        const { error: uploadError } = await supabase.storage
          .from("gpx-files")
          .upload(filePath, blob, { contentType: "application/gpx+xml" });
        if (uploadError) throw uploadError;

        const { data: urlData } = await supabase.storage
          .from("gpx-files")
          .createSignedUrl(filePath, 60 * 60 * 24 * 365);
        gpxUrl = urlData?.signedUrl ?? null;
      }

      const hikeDate =
        dateFlexible && !dateStart
          ? new Date().toISOString().split("T")[0]
          : dateStart;

      const { data: hike, error: hikeError } = await supabase
        .from("hike")
        .insert({
          creator_id: userId,
          title: title.trim(),
          description: description.trim() || null,
          start_location: `SRID=4326;POINT(${lng} ${lat})`,
          gpx_url: gpxUrl,
          distance_km: distanceKm,
          duration_min: durationMin ?? 0,
          elevation_m: elevationM ?? 0,
          level,
          date_start: hikeDate,
          date_flexible: dateFlexible,
          has_vehicle: hasVehicle,
          max_participants: maxParticipants,
          current_count: 0,
          status: "open",
        })
        .select("id")
        .single();

      if (hikeError) throw hikeError;

      const { error: partError } = await supabase.from("participation").insert({
        user_id: userId,
        hike_id: hike.id,
        role: "actor",
        status: "confirmed",
      });

      if (partError) throw partError;

      Alert.alert("Rando publiée", "Votre randonnée est maintenant visible.", [
        { text: "OK", onPress: () => router.navigate("/(tabs)") },
      ]);
      resetForm();
    } catch (error: any) {
      Alert.alert("Erreur", error?.message ?? "Impossible de publier la randonnée.");
    } finally {
      setPublishing(false);
    }
  };

  const resetForm = () => {
    setTitle("");
    setDescription("");
    setDateStart("");
    setDateFlexible(false);
    setLevel("intermediate");
    setMaxParticipants(3);
    setHasVehicle(true);
    setCoordinates([]);
    setDistanceKm(null);
    setElevationM(null);
    setDurationMin(null);
    setGpxFileName(null);
    setGpxFileUri(null);
  };

  const gpxLoaded = gpxFileName !== null && !parsing;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      {/* ── Top bar ── */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={resetForm}>
          <Text style={styles.cancelBtn}>Annuler</Text>
        </TouchableOpacity>
        <Text style={styles.topTitle}>Nouvelle rando</Text>
        <TouchableOpacity
          style={[styles.publishBtn, publishing && { opacity: 0.6 }]}
          onPress={handlePublish}
          disabled={publishing}
        >
          {publishing ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.publishBtnText}>Publier</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* ── Tracé ── */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Tracé</Text>

        {!gpxLoaded && !parsing && (
          <TouchableOpacity style={styles.gpxZone} onPress={handlePickGPX}>
            <View style={styles.gpxIcon}>
              <UploadIcon />
            </View>
            <Text style={styles.gpxTitle}>Importer un fichier GPX</Text>
            <Text style={styles.gpxSub}>Depuis Komoot, AllTrails, Wikiloc…</Text>
          </TouchableOpacity>
        )}

        {parsing && (
          <View style={styles.gpxZone}>
            <ActivityIndicator color={GREEN} />
            <Text style={[styles.gpxSub, { marginTop: 8 }]}>Analyse du fichier…</Text>
          </View>
        )}

        {gpxLoaded && (
          <View>
            <View style={styles.statsRow}>
              <StatPill value={`${distanceKm} km`} label="distance" auto />
              <StatPill value={`${elevationM} m`} label="dénivelé" auto />
              <StatPill
                value={durationMin ? formatDuration(durationMin) : "--"}
                label="durée estimée"
              />
            </View>
            <TouchableOpacity onPress={handleChangeGPX}>
              <Text style={styles.changeTrace}>Changer le tracé</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* ── Informations ── */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Informations</Text>
        <View style={styles.fieldGroup}>
          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>Titre</Text>
            <TextInput
              style={styles.fieldInput}
              value={title}
              onChangeText={setTitle}
              placeholder="Tour du Pic Saint-Loup"
              placeholderTextColor="#B0B0B0"
              maxLength={100}
            />
          </View>
          <View style={[styles.fieldRow, { borderTopWidth: 0.5, borderTopColor: "#E8E8E8" }]}>
            <Text style={styles.fieldLabel}>Description</Text>
            <TextInput
              style={[styles.fieldInput, { flex: 1 }]}
              value={description}
              onChangeText={setDescription}
              placeholder="Optionnel"
              placeholderTextColor="#B0B0B0"
              multiline
            />
          </View>
        </View>
      </View>

      {/* ── Date ── */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Date</Text>
        <View style={styles.fieldGroup}>
          <View style={styles.fieldRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.toggleLabel}>Date flexible</Text>
              <Text style={styles.toggleSub}>Tu précises juste le mois</Text>
            </View>
            <Toggle value={dateFlexible} onChange={setDateFlexible} />
          </View>
          <View style={[styles.fieldRow, { borderTopWidth: 0.5, borderTopColor: "#E8E8E8" }]}>
            <Text style={styles.fieldLabel}>{dateFlexible ? "Mois" : "Date"}</Text>
            <TextInput
              style={styles.fieldInput}
              value={dateStart}
              onChangeText={setDateStart}
              placeholder={dateFlexible ? "Avril 2025" : "Sam. 5 avril 2025"}
              placeholderTextColor="#B0B0B0"
              editable={!dateFlexible}
            />
          </View>
        </View>
      </View>

      {/* ── Niveau ── */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Niveau</Text>
        <View style={styles.levelRow}>
          {LEVELS.map((l) => (
            <TouchableOpacity
              key={l.value}
              style={[styles.levelPill, level === l.value && styles.levelPillActive]}
              onPress={() => setLevel(l.value)}
            >
              <Text style={[styles.levelPillText, level === l.value && styles.levelPillTextActive]}>
                {l.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* ── Groupe ── */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Groupe</Text>
        <View style={styles.fieldGroup}>
          <View style={[styles.fieldRow, { flexDirection: "column", alignItems: "stretch", gap: 8 }]}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={styles.toggleLabel}>Nombre de participants</Text>
              <Text style={styles.participantVal}>{maxParticipants}</Text>
            </View>
            <View style={styles.sliderRow}>
              <Text style={styles.sliderEdge}>2</Text>
              <TouchableOpacity
                style={styles.sliderBtn}
                onPress={() => setMaxParticipants((p) => Math.max(2, p - 1))}
              >
                <Text style={styles.sliderBtnText}>−</Text>
              </TouchableOpacity>
              <View style={styles.sliderTrack}>
                <View
                  style={[
                    styles.sliderFill,
                    { width: `${((maxParticipants - 2) / 10) * 100}%` },
                  ]}
                />
              </View>
              <TouchableOpacity
                style={styles.sliderBtn}
                onPress={() => setMaxParticipants((p) => Math.min(12, p + 1))}
              >
                <Text style={styles.sliderBtnText}>+</Text>
              </TouchableOpacity>
              <Text style={styles.sliderEdge}>12</Text>
            </View>
          </View>
          <View style={[styles.fieldRow, { borderTopWidth: 0.5, borderTopColor: "#E8E8E8" }]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.toggleLabel}>Voiturage proposé</Text>
              <Text style={styles.toggleSub}>Tu peux emmener des gens</Text>
            </View>
            <Toggle value={hasVehicle} onChange={setHasVehicle} />
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

// ── Sub-components ──

function StatPill({ value, label, auto }: { value: string; label: string; auto?: boolean }) {
  return (
    <View style={[styles.statPill, auto && styles.statPillAuto]}>
      <Text style={[styles.statPillVal, auto && styles.statPillValAuto]}>{value}</Text>
      <Text style={[styles.statPillLbl, auto && styles.statPillLblAuto]}>{label}</Text>
    </View>
  );
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <TouchableOpacity
      style={[styles.toggle, !value && styles.toggleOff]}
      onPress={() => onChange(!value)}
      activeOpacity={0.8}
    >
      <View style={[styles.toggleKnob, value ? styles.toggleKnobOn : styles.toggleKnobOff]} />
    </TouchableOpacity>
  );
}

function UploadIcon() {
  return (
    <Text style={{ fontSize: 20, color: GREEN }}>↓</Text>
  );
}

// ── Helpers ──

async function getCurrentLocation(): Promise<[number, number]> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== "granted") return [2.3522, 48.8566];
  const loc = await Location.getCurrentPositionAsync({});
  return [loc.coords.longitude, loc.coords.latitude];
}

// ── Styles ──

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FAFAFA" },
  content: { paddingBottom: 40 },

  // Top bar
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 14,
    backgroundColor: "#fff",
    borderBottomWidth: 0.5,
    borderBottomColor: "#E8E8E8",
  },
  cancelBtn: { fontSize: 14, color: GREEN },
  topTitle: { fontSize: 16, fontWeight: "500", color: "#1A1A1A" },
  publishBtn: {
    backgroundColor: GREEN,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  publishBtnText: { fontSize: 14, fontWeight: "500", color: "#fff" },

  // Sections
  section: { paddingHorizontal: 16, paddingTop: 22 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "500",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: "#9A9A9A",
    marginBottom: 10,
  },

  // GPX zone
  gpxZone: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#CACACA",
    borderRadius: 12,
    paddingVertical: 24,
    paddingHorizontal: 16,
    alignItems: "center",
    backgroundColor: "#F5F5F5",
  },
  gpxIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: GREEN_LIGHT,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  gpxTitle: { fontSize: 14, fontWeight: "500", color: "#1A1A1A", marginBottom: 3 },
  gpxSub: { fontSize: 12, color: "#9A9A9A" },
  changeTrace: {
    fontSize: 12,
    color: GREEN,
    fontWeight: "500",
    textAlign: "right",
    marginTop: 6,
  },

  // Stats pills
  statsRow: { flexDirection: "row", gap: 6 },
  statPill: {
    flex: 1,
    backgroundColor: "#F5F5F5",
    borderWidth: 0.5,
    borderColor: "#E0E0E0",
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: "center",
  },
  statPillAuto: { backgroundColor: GREEN_LIGHT, borderColor: "#9FE1CB" },
  statPillVal: { fontSize: 13, fontWeight: "500", color: "#1A1A1A" },
  statPillValAuto: { color: GREEN_DARK },
  statPillLbl: { fontSize: 10, color: "#9A9A9A", marginTop: 2 },
  statPillLblAuto: { color: GREEN_MID },

  // Field group (card)
  fieldGroup: {
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 0.5,
    borderColor: "#E0E0E0",
    overflow: "hidden",
  },
  fieldRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 12,
  },
  fieldLabel: { fontSize: 13, color: "#6A6A6A", width: 80 },
  fieldInput: { flex: 1, fontSize: 13, color: "#1A1A1A", textAlign: "right" },

  // Toggle
  toggleLabel: { fontSize: 13, color: "#1A1A1A" },
  toggleSub: { fontSize: 11, color: "#9A9A9A", marginTop: 2 },
  toggle: {
    width: 38,
    height: 22,
    borderRadius: 11,
    backgroundColor: GREEN,
    justifyContent: "center",
  },
  toggleOff: { backgroundColor: "#D0D0D0" },
  toggleKnob: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#fff",
    position: "absolute",
  },
  toggleKnobOn: { right: 2 },
  toggleKnobOff: { left: 2 },

  // Level pills
  levelRow: { flexDirection: "row", gap: 6 },
  levelPill: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 0.5,
    borderColor: "#E0E0E0",
    alignItems: "center",
    backgroundColor: "#F5F5F5",
  },
  levelPillActive: { backgroundColor: GREEN_LIGHT, borderColor: GREEN_BORDER },
  levelPillText: { fontSize: 12, color: "#6A6A6A" },
  levelPillTextActive: { color: GREEN_DARK, fontWeight: "500" },

  // Slider
  participantVal: { fontSize: 13, fontWeight: "500", color: "#1A1A1A" },
  sliderRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  sliderEdge: { fontSize: 11, color: "#9A9A9A" },
  sliderBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 0.5,
    borderColor: "#D0D0D0",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F5F5F5",
  },
  sliderBtnText: { fontSize: 18, color: "#1A1A1A", lineHeight: 22 },
  sliderTrack: {
    flex: 1,
    height: 4,
    backgroundColor: "#E0E0E0",
    borderRadius: 2,
    overflow: "hidden",
  },
  sliderFill: { height: "100%", backgroundColor: GREEN, borderRadius: 2 },
});
