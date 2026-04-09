import React, { useState, useMemo, useRef, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  Modal,
  Animated,
} from "react-native";
import Mapbox, { MapView, Camera, ShapeSource, LineLayer, MarkerView } from "@rnmapbox/maps";

Mapbox.setAccessToken(process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? "");
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as DocumentPicker from "expo-document-picker";
import * as Location from "expo-location";
import { router } from "expo-router";
import { supabase } from "../../lib/supabase";
import { useSessionContext } from "../../hooks/SessionContext";
import { Calendar } from "react-native-calendars";
import type { HikeLevel } from "../../types";

const GREEN = "#1D9E75";
const GREEN_LIGHT = "#9FE1CB";
const GREEN_DIM = "rgba(29,158,117,0.2)";
const BG = "#0f1f14";
const BG_NAV = "#0a1510";
const SURFACE = "rgba(255,255,255,0.07)";
const BORDER = "rgba(255,255,255,0.12)";

const LEVELS: { value: HikeLevel; label: string }[] = [
  { value: "easy", label: "Facile" },
  { value: "intermediate", label: "Interméd." },
  { value: "hard", label: "Difficile" },
  { value: "expert", label: "Expert" },
];

interface ParsedGPXResult {
  distance_km: number;
  elevation_m: number;
  duration_min: number;
  coordinates: [number, number][];
  name?: string;
  description?: string;
}

function sampleCoordinates(coords: [number, number][], maxPoints = 300): [number, number][] {
  if (coords.length <= maxPoints) return coords;
  const step = (coords.length - 1) / (maxPoints - 1);
  return Array.from({ length: maxPoints }, (_, i) => coords[Math.round(i * step)]);
}

function formatDuration(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`;
}

export default function CreateScreen() {
  const { session } = useSessionContext();
  const insets = useSafeAreaInsets();

  const [step, setStep] = useState(0);
  const [inputMode, setInputMode] = useState<"gpx" | "manual">("gpx");

  // GPX
  const [gpxFileName, setGpxFileName] = useState<string | null>(null);
  const [gpxFileUri, setGpxFileUri] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [coordinates, setCoordinates] = useState<[number, number][]>([]);
  const [distanceKm, setDistanceKm] = useState<number | null>(null);
  const [elevationM, setElevationM] = useState<number | null>(null);
  const [durationMin, setDurationMin] = useState<number | null>(null);

  // Manuel
  const [manualLat, setManualLat] = useState("");
  const [manualLon, setManualLon] = useState("");
  const [manualDistance, setManualDistance] = useState("");
  const [manualDuration, setManualDuration] = useState("");
  const [manualElevation, setManualElevation] = useState("");

  // Info
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dateStart, setDateStart] = useState("");
  const [dateFlexible, setDateFlexible] = useState(false);
  const [level, setLevel] = useState<HikeLevel>("intermediate");

  // Groupe
  const [maxParticipants, setMaxParticipants] = useState(4);
  const [hasVehicle, setHasVehicle] = useState(true);
  const [autoAccept, setAutoAccept] = useState(true);

  const [publishing, setPublishing] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);

  const gpxLoaded = gpxFileName !== null && !parsing;
  const manualFilled =
    manualLat.trim() && manualLon.trim() &&
    manualDistance.trim() && manualDuration.trim() && manualElevation.trim();
  const step0Valid = inputMode === "gpx" ? gpxLoaded : !!manualFilled;

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

      const parseResponse = await fetch(
        `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/parse-gpx`,
        {
          method: "POST",
          headers: { "Content-Type": "text/xml" },
          body: gpxContent,
        }
      );

      if (!parseResponse.ok) {
        const err = await parseResponse.json();
        throw new Error(err.error || "Erreur lors du parsing GPX.");
      }

      const parsed: ParsedGPXResult = await parseResponse.json();
      setCoordinates(parsed.coordinates);
      setDistanceKm(parsed.distance_km);
      setElevationM(parsed.elevation_m);
      setDurationMin(parsed.duration_min);
      if (parsed.name && !title.trim()) setTitle(parsed.name);
      if (parsed.description && !description.trim()) setDescription(parsed.description);
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

  const goNext = () => {
    if (step === 0) {
      if (!step0Valid) return;
      setStep(1);
    } else if (step === 1) {
      if (!title.trim()) {
        Alert.alert("Erreur", "Le titre est obligatoire.");
        return;
      }
      if (!dateStart && !dateFlexible) {
        Alert.alert("Erreur", "Indiquez une date ou activez la date flexible.");
        return;
      }
      setStep(2);
    }
  };

  const handlePublish = async () => {
    if (!title.trim()) { Alert.alert("Erreur", "Le titre est obligatoire."); return; }
    if (!dateStart && !dateFlexible) { Alert.alert("Erreur", "Indiquez une date."); return; }

    let startLng: number, startLat: number;
    let finalDistance: number, finalDuration: number, finalElevation: number;

    if (inputMode === "gpx") {
      if (coordinates.length < 2) { Alert.alert("Erreur", "Importez un fichier GPX."); return; }
      [startLng, startLat] = coordinates[0];
      finalDistance = distanceKm ?? 0;
      finalDuration = durationMin ?? 0;
      finalElevation = elevationM ?? 0;
    } else {
      const parsedLat = parseFloat(manualLat.replace(",", "."));
      const parsedLon = parseFloat(manualLon.replace(",", "."));
      const parsedDist = parseFloat(manualDistance.replace(",", "."));
      const parsedDur = parseInt(manualDuration, 10);
      const parsedElev = parseFloat(manualElevation.replace(",", "."));
      if (isNaN(parsedLat) || isNaN(parsedLon) || isNaN(parsedDist) || isNaN(parsedDur) || isNaN(parsedElev)) {
        Alert.alert("Erreur", "Vérifiez les valeurs saisies.");
        return;
      }
      startLng = parsedLon; startLat = parsedLat;
      finalDistance = parsedDist; finalDuration = parsedDur; finalElevation = parsedElev;
    }

    setPublishing(true);
    try {
      const userId = session?.user?.id;
      if (!userId) throw new Error("Session introuvable.");

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
          start_location: `SRID=4326;POINT(${startLng} ${startLat})`,
          gpx_url: gpxUrl,
          route_coordinates: inputMode === "gpx" && coordinates.length >= 2 ? sampleCoordinates(coordinates) : null,
          distance_km: finalDistance,
          duration_min: finalDuration,
          elevation_m: finalElevation,
          level,
          date_start: hikeDate,
          date_flexible: dateFlexible,
          has_vehicle: hasVehicle,
          auto_accept: autoAccept,
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

      Alert.alert("Rando publiée !", "Votre randonnée est maintenant visible.", [
        { text: "OK", onPress: () => { resetForm(); router.navigate("/(tabs)"); } },
      ]);
    } catch (error: any) {
      Alert.alert("Erreur", error?.message ?? "Impossible de publier la randonnée.");
    } finally {
      setPublishing(false);
    }
  };

  const resetForm = () => {
    setStep(0); setInputMode("gpx");
    setTitle(""); setDescription(""); setDateStart(""); setDateFlexible(false);
    setLevel("intermediate"); setMaxParticipants(4); setHasVehicle(true);
    setGpxFileName(null); setGpxFileUri(null); setCoordinates([]);
    setDistanceKm(null); setElevationM(null); setDurationMin(null);
    setManualLat(""); setManualLon(""); setManualDistance(""); setManualDuration(""); setManualElevation("");
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Top bar */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={resetForm}>
          <Text style={styles.cancelBtn}>Annuler</Text>
        </TouchableOpacity>
        <Text style={styles.topTitle}>Nouvelle rando</Text>
        <TouchableOpacity
          style={[styles.publishBtn, step < 2 && styles.publishBtnDim]}
          onPress={step === 2 ? handlePublish : undefined}
          disabled={publishing || step < 2}
        >
          {publishing
            ? <ActivityIndicator color="#fff" size="small" />
            : <Text style={styles.publishBtnText}>Publier</Text>
          }
        </TouchableOpacity>
      </View>

      {/* Progress bar */}
      <View style={styles.stepsBar}>
        {[0, 1, 2].map((i) => (
          <View
            key={i}
            style={[
              styles.stepSeg,
              i < step && styles.stepSegDone,
              i === step && styles.stepSegActive,
            ]}
          />
        ))}
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ── STEP 0 : Tracé ── */}
        {step === 0 && (
          <View style={styles.stepPanel}>
            <Text style={styles.stepLabel}>Étape 1 sur 3</Text>
            <Text style={styles.stepTitle}>Le tracé</Text>
            <Text style={styles.stepSub}>
              Importe un fichier GPX ou renseigne les infos manuellement.
            </Text>

            {/* Mode selector */}
            <View style={styles.modeRow}>
              <TouchableOpacity
                style={[styles.modeChip, inputMode === "gpx" && styles.modeChipSelected]}
                onPress={() => setInputMode("gpx")}
              >
                <Text style={[styles.modeChipText, inputMode === "gpx" && styles.modeChipTextSelected]}>
                  Fichier GPX
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modeChip, inputMode === "manual" && styles.modeChipSelected]}
                onPress={() => setInputMode("manual")}
              >
                <Text style={[styles.modeChipText, inputMode === "manual" && styles.modeChipTextSelected]}>
                  Saisie manuelle
                </Text>
              </TouchableOpacity>
            </View>

            {/* ── Mode GPX ── */}
            {inputMode === "gpx" && (
              <>
                {!gpxLoaded && !parsing && (
                  <TouchableOpacity style={styles.gpxZone} onPress={handlePickGPX} activeOpacity={0.7}>
                    <View style={styles.gpxIcon}>
                      <Text style={{ fontSize: 18, color: GREEN_LIGHT }}>↓</Text>
                    </View>
                    <Text style={styles.gpxTitle}>Importer un fichier GPX</Text>
                    <Text style={styles.gpxSub}>Depuis Komoot, AllTrails, Wikiloc…</Text>
                  </TouchableOpacity>
                )}
                {parsing && (
                  <View style={[styles.gpxZone, { gap: 10 }]}>
                    <ActivityIndicator color={GREEN} />
                    <Text style={styles.gpxSub}>Analyse du fichier…</Text>
                  </View>
                )}
                {gpxLoaded && (
                  <View>
                    {/* Mini map preview */}
                    {coordinates.length >= 2 && (() => {
                      const lngs = coordinates.map((c) => c[0]);
                      const lats = coordinates.map((c) => c[1]);
                      const bounds = {
                        ne: [Math.max(...lngs), Math.max(...lats)] as [number, number],
                        sw: [Math.min(...lngs), Math.min(...lats)] as [number, number],
                        paddingTop: 24,
                        paddingBottom: 24,
                        paddingLeft: 24,
                        paddingRight: 24,
                      };
                      const lineGeoJSON = {
                        type: "Feature" as const,
                        properties: {},
                        geometry: { type: "LineString" as const, coordinates },
                      };
                      return (
                        <View style={styles.mapPreviewContainer}>
                          <MapView
                            style={styles.mapPreview}
                            styleURL="mapbox://styles/mapbox/outdoors-v12"
                            scrollEnabled={false}
                            zoomEnabled={false}
                            rotateEnabled={false}
                            pitchEnabled={false}
                            attributionEnabled={false}
                            logoEnabled={false}
                          >
                            <Camera bounds={bounds} animationMode="none" animationDuration={0} />
                            <ShapeSource id="gpx-preview-route" shape={lineGeoJSON}>
                              <LineLayer
                                id="gpx-preview-line"
                                style={{
                                  lineColor: GREEN,
                                  lineWidth: 3,
                                  lineOpacity: 0.9,
                                  lineCap: "round",
                                  lineJoin: "round",
                                }}
                              />
                            </ShapeSource>
                            <MarkerView coordinate={coordinates[0]}>
                              <View style={styles.mapMarker}>
                                <View style={styles.mapMarkerDot} />
                              </View>
                            </MarkerView>
                          </MapView>
                          <View style={styles.mapPreviewOverlay}>
                            <Text style={styles.mapPreviewFileName} numberOfLines={1}>
                              {gpxFileName}
                            </Text>
                          </View>
                        </View>
                      );
                    })()}

                    {/* Stats row */}
                    <View style={styles.statsAutoRow}>
                      <View style={styles.statAuto}>
                        <Text style={styles.statAutoVal}>{distanceKm} km</Text>
                        <Text style={styles.statAutoLbl}>distance</Text>
                      </View>
                      <View style={styles.statAuto}>
                        <Text style={styles.statAutoVal}>{elevationM} m</Text>
                        <Text style={styles.statAutoLbl}>dénivelé</Text>
                      </View>
                      <View style={styles.statAuto}>
                        <Text style={styles.statAutoVal}>{durationMin ? formatDuration(durationMin) : "--"}</Text>
                        <Text style={styles.statAutoLbl}>estimé</Text>
                      </View>
                    </View>
                    <TouchableOpacity onPress={handleChangeGPX}>
                      <Text style={styles.changeLink}>Changer le tracé</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </>
            )}

            {/* ── Mode manuel ── */}
            {inputMode === "manual" && (
              <View style={styles.manualForm}>
                <ManualField label="Latitude" value={manualLat} onChangeText={setManualLat} placeholder="48.8566" keyboardType="decimal-pad" />
                <ManualField label="Longitude" value={manualLon} onChangeText={setManualLon} placeholder="2.3522" keyboardType="decimal-pad" />
                <TouchableOpacity
                  style={styles.locationBtn}
                  onPress={async () => {
                    const [lon, lat] = await getCurrentLocation();
                    setManualLat(String(lat));
                    setManualLon(String(lon));
                  }}
                >
                  <Text style={styles.locationBtnText}>📍 Utiliser ma position</Text>
                </TouchableOpacity>
                <ManualField label="Distance" value={manualDistance} onChangeText={setManualDistance} placeholder="12.5" keyboardType="decimal-pad" unit="km" />
                <ManualField label="Durée" value={manualDuration} onChangeText={setManualDuration} placeholder="180" keyboardType="number-pad" unit="min" />
                <ManualField label="Dénivelé +" value={manualElevation} onChangeText={setManualElevation} placeholder="450" keyboardType="number-pad" unit="m" />
              </View>
            )}

            <TouchableOpacity
              style={[styles.nextBtn, !step0Valid && styles.nextBtnDim]}
              onPress={goNext}
              disabled={!step0Valid}
              activeOpacity={0.8}
            >
              <Text style={styles.nextBtnText}>Suivant</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── STEP 1 : La rando ── */}
        {step === 1 && (
          <View style={styles.stepPanel}>
            <Text style={styles.stepLabel}>Étape 2 sur 3</Text>
            <Text style={styles.stepTitle}>La rando</Text>
            <Text style={styles.stepSub}>Donne envie. Un bon titre et quelques mots suffisent.</Text>

            <Text style={styles.fieldLabel}>Titre</Text>
            <TextInput
              style={styles.darkInput}
              value={title}
              onChangeText={setTitle}
              placeholder="Ex : Tour du Pic Saint-Loup"
              placeholderTextColor="rgba(255,255,255,0.25)"
              maxLength={100}
            />

            <Text style={styles.fieldLabel}>
              Description <Text style={styles.optionalHint}>(optionnel)</Text>
            </Text>
            <TextInput
              style={styles.darkTextarea}
              value={description}
              onChangeText={setDescription}
              placeholder="Quelques mots sur la rando, le départ, ce qu'il faut prévoir…"
              placeholderTextColor="rgba(255,255,255,0.25)"
              multiline
              numberOfLines={3}
            />

            <Text style={styles.fieldLabel}>Date</Text>
            <View style={styles.dateChipsRow}>
              <TouchableOpacity
                style={[styles.dateChip, !dateFlexible && styles.dateChipSelected]}
                onPress={() => { setDateFlexible(false); setDateStart(""); }}
              >
                <Text style={[styles.dateChipText, !dateFlexible && styles.dateChipTextSelected]}>
                  Date fixe
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.dateChip, dateFlexible && styles.dateChipSelected]}
                onPress={() => { setDateFlexible(true); setDateStart(""); }}
              >
                <Text style={[styles.dateChipText, dateFlexible && styles.dateChipTextSelected]}>
                  Mois flexible
                </Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity onPress={() => setShowDatePicker(true)}>
              <View style={styles.darkInput}>
                <Text style={dateStart ? styles.darkInputText : styles.darkInputPlaceholder}>
                  {dateStart
                    ? formatDateDisplay(dateStart, dateFlexible)
                    : dateFlexible ? "Choisir un mois" : "Choisir une date"}
                </Text>
              </View>
            </TouchableOpacity>

            <Text style={styles.fieldLabel}>Niveau</Text>
            <View style={styles.levelChipsRow}>
              {LEVELS.map((l) => (
                <TouchableOpacity
                  key={l.value}
                  style={[styles.levelChip, level === l.value && styles.levelChipSelected]}
                  onPress={() => setLevel(l.value)}
                >
                  <Text style={[styles.levelChipText, level === l.value && styles.levelChipTextSelected]}>
                    {l.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity style={styles.nextBtn} onPress={goNext} activeOpacity={0.8}>
              <Text style={styles.nextBtnText}>Suivant</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── STEP 2 : Le groupe ── */}
        {step === 2 && (
          <View style={styles.stepPanel}>
            <Text style={styles.stepLabel}>Étape 3 sur 3</Text>
            <Text style={styles.stepTitle}>Le groupe</Text>
            <Text style={styles.stepSub}>Définit la taille et les conditions du groupe.</Text>

            {/* Participants stepper */}
            <View style={styles.sliderWrap}>
              <View style={styles.sliderHeader}>
                <Text style={styles.sliderLbl}>Nombre de participants</Text>
                <Text style={styles.sliderVal}>{maxParticipants}</Text>
              </View>
              <View style={styles.stepperRow}>
                <TouchableOpacity
                  style={styles.stepperBtn}
                  onPress={() => setMaxParticipants((p) => Math.max(2, p - 1))}
                >
                  <Text style={styles.stepperBtnText}>−</Text>
                </TouchableOpacity>
                <View style={styles.stepperTrack}>
                  <View style={[styles.stepperFill, { width: `${((maxParticipants - 2) / 10) * 100}%` }]} />
                </View>
                <TouchableOpacity
                  style={styles.stepperBtn}
                  onPress={() => setMaxParticipants((p) => Math.min(12, p + 1))}
                >
                  <Text style={styles.stepperBtnText}>+</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Toggles */}
            <ToggleRow
              label="Voiturage proposé"
              sub="Tu peux emmener des participants"
              value={hasVehicle}
              onChange={setHasVehicle}
            />
            <ToggleRow
              label="Accepter automatiquement"
              sub="Sans validation de ta part"
              value={autoAccept}
              onChange={setAutoAccept}
              last
            />

            <TouchableOpacity
              style={[styles.nextBtn, publishing && styles.nextBtnDim]}
              onPress={handlePublish}
              disabled={publishing}
              activeOpacity={0.8}
            >
              {publishing
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={styles.nextBtnText}>Publier la rando</Text>
              }
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* Date picker modal */}
      <BottomSheet visible={showDatePicker} onClose={() => setShowDatePicker(false)}>
        {dateFlexible ? (
          <MonthPicker
            selected={dateStart}
            onSelect={(iso) => { setDateStart(iso); setShowDatePicker(false); }}
            onClose={() => setShowDatePicker(false)}
          />
        ) : (
          <CalendarPicker
            selected={dateStart}
            onSelect={(iso) => { setDateStart(iso); setShowDatePicker(false); }}
            onClose={() => setShowDatePicker(false)}
          />
        )}
      </BottomSheet>
    </View>
  );
}

// ── Sub-components ──

function ManualField({ label, value, onChangeText, placeholder, keyboardType, unit }: {
  label: string; value: string; onChangeText: (v: string) => void;
  placeholder: string; keyboardType?: any; unit?: string;
}) {
  return (
    <View style={styles.manualRow}>
      <Text style={styles.manualLabel}>{label}</Text>
      <TextInput
        style={styles.manualInput}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="rgba(255,255,255,0.25)"
        keyboardType={keyboardType}
      />
      {unit && <Text style={styles.manualUnit}>{unit}</Text>}
    </View>
  );
}

function ToggleRow({
  label, sub, value, onChange, last,
}: {
  label: string; sub: string; value: boolean; onChange: (v: boolean) => void; last?: boolean;
}) {
  return (
    <View style={[styles.toggleRow, last && styles.toggleRowLast]}>
      <View style={{ flex: 1 }}>
        <Text style={styles.toggleLabel}>{label}</Text>
        <Text style={styles.toggleSub}>{sub}</Text>
      </View>
      <TouchableOpacity
        style={[styles.toggle, value && styles.toggleOn]}
        onPress={() => onChange(!value)}
        activeOpacity={0.8}
      >
        <View style={[styles.toggleKnob, value ? styles.toggleKnobOn : styles.toggleKnobOff]} />
      </TouchableOpacity>
    </View>
  );
}

function BottomSheet({ visible, onClose, children }: {
  visible: boolean; onClose: () => void; children: React.ReactNode;
}) {
  const slideY = useRef(new Animated.Value(600)).current;

  useEffect(() => {
    Animated.spring(slideY, {
      toValue: visible ? 0 : 600,
      useNativeDriver: true,
      bounciness: 4,
    }).start();
  }, [visible]);

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.modalOverlay}>
        <Animated.View style={[styles.modalSheet, { transform: [{ translateY: slideY }] }]}>
          <View style={styles.modalHandle} />
          {children}
        </Animated.View>
      </View>
    </Modal>
  );
}

// ── Date helpers ──

const MONTHS_LONG = ["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];
const MONTHS_SHORT = ["Jan.","Fév.","Mars","Avr.","Mai","Juin","Juil.","Août","Sep.","Oct.","Nov.","Déc."];

function formatDateDisplay(iso: string, flexible: boolean): string {
  const d = new Date(iso + "T00:00:00");
  if (flexible) return `${MONTHS_LONG[d.getMonth()]} ${d.getFullYear()}`;
  const days = ["Dim.","Lun.","Mar.","Mer.","Jeu.","Ven.","Sam."];
  return `${days[d.getDay()]} ${d.getDate()} ${MONTHS_LONG[d.getMonth()]} ${d.getFullYear()}`;
}

function CalendarPicker({ selected, onSelect, onClose }: {
  selected: string; onSelect: (iso: string) => void; onClose: () => void;
}) {
  const today = new Date().toISOString().split("T")[0];
  const markedDates = useMemo(() => {
    if (!selected) return {};
    return { [selected]: { selected: true, selectedColor: GREEN } };
  }, [selected]);

  return (
    <View>
      <View style={calStyles.header}>
        <Text style={calStyles.title}>Choisir une date</Text>
        <TouchableOpacity onPress={onClose}>
          <Text style={calStyles.close}>Annuler</Text>
        </TouchableOpacity>
      </View>
      <Calendar
        current={selected || today}
        minDate={today}
        markedDates={markedDates}
        onDayPress={(day: { dateString: string }) => onSelect(day.dateString)}
        firstDay={1}
        theme={{
          backgroundColor: "#132219",
          calendarBackground: "#132219",
          textSectionTitleColor: "rgba(255,255,255,0.4)",
          selectedDayBackgroundColor: GREEN,
          selectedDayTextColor: "#fff",
          todayTextColor: GREEN_LIGHT,
          dayTextColor: "white",
          textDisabledColor: "rgba(255,255,255,0.2)",
          arrowColor: GREEN,
          monthTextColor: "white",
          textDayFontSize: 14,
          textMonthFontSize: 15,
          textMonthFontWeight: "600" as any,
          textDayHeaderFontSize: 11,
        }}
      />
    </View>
  );
}

function MonthPicker({ selected, onSelect, onClose }: {
  selected: string; onSelect: (iso: string) => void; onClose: () => void;
}) {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const selMonth = selected ? new Date(selected + "T00:00:00").getMonth() : null;
  const selYear = selected ? new Date(selected + "T00:00:00").getFullYear() : null;
  const isPastMonth = (month: number) =>
    viewYear < today.getFullYear() ||
    (viewYear === today.getFullYear() && month < today.getMonth());

  return (
    <View>
      <View style={calStyles.header}>
        <Text style={calStyles.title}>Choisir un mois</Text>
        <TouchableOpacity onPress={onClose}>
          <Text style={calStyles.close}>Annuler</Text>
        </TouchableOpacity>
      </View>
      <View style={calStyles.navRow}>
        <TouchableOpacity style={calStyles.navBtn} onPress={() => setViewYear(y => y - 1)}>
          <Text style={calStyles.navArrow}>‹</Text>
        </TouchableOpacity>
        <Text style={calStyles.navLabel}>{viewYear}</Text>
        <TouchableOpacity style={calStyles.navBtn} onPress={() => setViewYear(y => y + 1)}>
          <Text style={calStyles.navArrow}>›</Text>
        </TouchableOpacity>
      </View>
      <View style={calStyles.monthGrid}>
        {MONTHS_SHORT.map((name, i) => {
          const past = isPastMonth(i);
          const sel = i === selMonth && viewYear === selYear;
          const cur = i === today.getMonth() && viewYear === today.getFullYear();
          return (
            <TouchableOpacity
              key={i}
              style={[calStyles.monthCell, sel && calStyles.monthCellSel, cur && !sel && calStyles.monthCellCur]}
              onPress={() => {
                if (past) return;
                onSelect(`${viewYear}-${String(i + 1).padStart(2, "0")}-01`);
              }}
              disabled={past}
            >
              <Text style={[calStyles.monthText, past && calStyles.monthTextPast, sel && calStyles.monthTextSel]}>
                {name}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

async function getCurrentLocation(): Promise<[number, number]> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== "granted") return [2.3522, 48.8566];
  const loc = await Location.getCurrentPositionAsync({});
  return [loc.coords.longitude, loc.coords.latitude];
}

// ── Styles ──

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 40 },

  // Top bar
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 10,
    paddingTop: 8,
  },
  cancelBtn: { fontSize: 13, color: "rgba(255,255,255,0.5)" },
  topTitle: { fontSize: 15, fontWeight: "500", color: "white" },
  publishBtn: {
    backgroundColor: GREEN,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  publishBtnDim: { opacity: 0.4 },
  publishBtnText: { fontSize: 13, fontWeight: "500", color: "white" },

  // Progress bar
  stepsBar: {
    flexDirection: "row",
    gap: 4,
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  stepSeg: {
    flex: 1,
    height: 3,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.15)",
  },
  stepSegDone: { backgroundColor: GREEN },
  stepSegActive: { backgroundColor: "rgba(29,158,117,0.6)" },

  // Step panel
  stepPanel: { paddingHorizontal: 16, paddingTop: 4 },
  stepLabel: {
    fontSize: 10,
    fontWeight: "500",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: "rgba(255,255,255,0.4)",
    marginBottom: 6,
  },
  stepTitle: { fontSize: 22, fontWeight: "500", color: "white", marginBottom: 5, letterSpacing: -0.3 },
  stepSub: { fontSize: 12, color: "rgba(255,255,255,0.45)", marginBottom: 22, lineHeight: 18 },

  // Mode selector
  modeRow: { flexDirection: "row", gap: 8, marginBottom: 16 },
  modeChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 0.5,
    borderColor: BORDER,
    backgroundColor: SURFACE,
    alignItems: "center",
  },
  modeChipSelected: {
    backgroundColor: "rgba(29,158,117,0.2)",
    borderColor: "rgba(29,158,117,0.5)",
  },
  modeChipText: { fontSize: 13, color: "rgba(255,255,255,0.45)" },
  modeChipTextSelected: { color: GREEN_LIGHT, fontWeight: "500" },

  // Manuel form
  manualForm: {
    backgroundColor: SURFACE,
    borderWidth: 0.5,
    borderColor: BORDER,
    borderRadius: 12,
    overflow: "hidden",
    marginBottom: 4,
  },
  manualRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: "rgba(255,255,255,0.07)",
    gap: 10,
  },
  manualLabel: { fontSize: 13, color: "rgba(255,255,255,0.5)", width: 90 },
  manualInput: { flex: 1, fontSize: 13, color: "white", textAlign: "right" },
  manualUnit: { fontSize: 12, color: "rgba(255,255,255,0.3)", marginLeft: 4 },
  locationBtn: { paddingHorizontal: 14, paddingVertical: 12 },
  locationBtnText: { fontSize: 13, color: GREEN_LIGHT, fontWeight: "500" },

  // GPX zone
  gpxZone: {
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: "rgba(255,255,255,0.2)",
    borderRadius: 14,
    paddingVertical: 28,
    paddingHorizontal: 16,
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.04)",
    marginBottom: 10,
  },
  gpxIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: GREEN_DIM,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  gpxTitle: { fontSize: 13, fontWeight: "500", color: "white", marginBottom: 3 },
  gpxSub: { fontSize: 11, color: "rgba(255,255,255,0.4)" },

  // Stats auto (after GPX load)
  mapPreviewContainer: {
    height: 200,
    borderRadius: 14,
    overflow: "hidden",
    marginBottom: 12,
    borderWidth: 0.5,
    borderColor: "rgba(255,255,255,0.1)",
  },
  mapPreview: { flex: 1 },
  mapPreviewOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "rgba(6,16,10,0.65)",
  },
  mapPreviewFileName: {
    fontSize: 11,
    color: "rgba(255,255,255,0.6)",
  },
  mapMarker: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "rgba(29,158,117,0.25)",
    alignItems: "center",
    justifyContent: "center",
  },
  mapMarkerDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: GREEN,
    borderWidth: 1.5,
    borderColor: "#fff",
  },
  statsAutoRow: { flexDirection: "row", gap: 6, marginBottom: 6 },
  statAuto: {
    flex: 1,
    backgroundColor: "rgba(29,158,117,0.15)",
    borderWidth: 0.5,
    borderColor: "rgba(29,158,117,0.3)",
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: "center",
  },
  statAutoVal: { fontSize: 12, fontWeight: "500", color: GREEN_LIGHT },
  statAutoLbl: { fontSize: 9, color: "rgba(157,225,203,0.6)", marginTop: 1 },
  changeLink: { fontSize: 11, color: "#5DCAA5", textAlign: "right", marginBottom: 4 },

  // Next button
  nextBtn: {
    backgroundColor: GREEN,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 22,
  },
  nextBtnDim: { opacity: 0.35 },
  nextBtnText: { fontSize: 14, fontWeight: "500", color: "white" },

  // Dark inputs
  fieldLabel: {
    fontSize: 11,
    color: "rgba(255,255,255,0.45)",
    marginBottom: 6,
    marginTop: 16,
  },
  optionalHint: { color: "rgba(255,255,255,0.2)", fontSize: 11 },
  darkInput: {
    backgroundColor: SURFACE,
    borderWidth: 0.5,
    borderColor: BORDER,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 13,
    color: "white",
    justifyContent: "center",
  },
  darkInputText: { fontSize: 13, color: "white" },
  darkInputPlaceholder: { fontSize: 13, color: "rgba(255,255,255,0.25)" },
  darkTextarea: {
    backgroundColor: SURFACE,
    borderWidth: 0.5,
    borderColor: BORDER,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 13,
    color: "white",
    minHeight: 80,
    textAlignVertical: "top",
  },

  // Date chips
  dateChipsRow: { flexDirection: "row", gap: 8, marginBottom: 8 },
  dateChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 0.5,
    borderColor: BORDER,
    backgroundColor: SURFACE,
    alignItems: "center",
  },
  dateChipSelected: {
    backgroundColor: "rgba(29,158,117,0.2)",
    borderColor: "rgba(29,158,117,0.5)",
  },
  dateChipText: { fontSize: 12, color: "rgba(255,255,255,0.5)" },
  dateChipTextSelected: { color: GREEN_LIGHT, fontWeight: "500" },

  // Level chips
  levelChipsRow: { flexDirection: "row", gap: 6 },
  levelChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 0.5,
    borderColor: BORDER,
    backgroundColor: "rgba(255,255,255,0.05)",
    alignItems: "center",
  },
  levelChipSelected: {
    backgroundColor: "rgba(29,158,117,0.2)",
    borderColor: "rgba(29,158,117,0.5)",
  },
  levelChipText: { fontSize: 11, color: "rgba(255,255,255,0.45)", textAlign: "center" },
  levelChipTextSelected: { color: GREEN_LIGHT, fontWeight: "500" },

  // Participants stepper
  sliderWrap: { marginTop: 4, marginBottom: 6 },
  sliderHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 },
  sliderLbl: { fontSize: 13, color: "rgba(255,255,255,0.5)" },
  sliderVal: { fontSize: 18, fontWeight: "500", color: "white" },
  stepperRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  stepperBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: SURFACE,
    borderWidth: 0.5,
    borderColor: BORDER,
    alignItems: "center",
    justifyContent: "center",
  },
  stepperBtnText: { fontSize: 18, color: "white", lineHeight: 22 },
  stepperTrack: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.15)",
    overflow: "hidden",
  },
  stepperFill: { height: "100%", backgroundColor: GREEN, borderRadius: 2 },

  // Toggle row
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    borderBottomWidth: 0.5,
    borderBottomColor: "rgba(255,255,255,0.07)",
    marginTop: 4,
  },
  toggleRowLast: { borderBottomWidth: 0 },
  toggleLabel: { fontSize: 13, color: "white" },
  toggleSub: { fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 2 },
  toggle: {
    width: 38,
    height: 22,
    borderRadius: 11,
    backgroundColor: "rgba(255,255,255,0.15)",
    justifyContent: "center",
  },
  toggleOn: { backgroundColor: GREEN },
  toggleKnob: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "white",
    position: "absolute",
  },
  toggleKnobOn: { right: 2 },
  toggleKnobOff: { left: 2 },

  // Modal / bottom sheet
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: "#132219",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 32,
  },
  modalHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignSelf: "center",
    marginTop: 10,
    marginBottom: 4,
  },
});

const calStyles = StyleSheet.create({
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  title: { fontSize: 15, fontWeight: "500", color: "white" },
  close: { fontSize: 13, color: "rgba(255,255,255,0.5)" },
  navRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 24,
    paddingVertical: 8,
  },
  navBtn: { padding: 8 },
  navArrow: { fontSize: 22, color: GREEN_LIGHT },
  navLabel: { fontSize: 16, fontWeight: "500", color: "white", minWidth: 60, textAlign: "center" },
  monthGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 12,
    paddingBottom: 12,
    gap: 8,
  },
  monthCell: {
    width: "30%",
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.07)",
    alignItems: "center",
  },
  monthCellSel: { backgroundColor: GREEN },
  monthCellCur: { borderWidth: 1, borderColor: GREEN },
  monthText: { fontSize: 13, color: "rgba(255,255,255,0.6)" },
  monthTextPast: { color: "rgba(255,255,255,0.2)" },
  monthTextSel: { color: "white", fontWeight: "500" },
});
