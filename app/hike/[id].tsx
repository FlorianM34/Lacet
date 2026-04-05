import { useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import Mapbox, { MapView, Camera, MarkerView, ShapeSource, LineLayer } from "@rnmapbox/maps";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../../lib/supabase";
import { getAvatarColor, getInitials } from "../../lib/chat";
import { useSessionContext } from "../../hooks/SessionContext";
import type { Hike, User, HikeLevel } from "../../types";

Mapbox.setAccessToken(process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? "");

// Parse EWKB hex (returned by Supabase direct queries) or GeoJSON object
function parseCoords(raw: any): [number, number] {
  if (!raw) return [2.35, 48.85];
  // GeoJSON object (from RPC with ST_AsGeoJSON)
  if (typeof raw === "object" && raw.coordinates) return raw.coordinates;
  // EWKB hex string (from direct table query)
  if (typeof raw === "string" && raw.length >= 50) {
    try {
      const isLE = raw.substring(0, 2) === "01";
      const xHex = raw.substring(18, 34);
      const yHex = raw.substring(34, 50);
      const toDouble = (hex: string) => {
        const bytes = new Uint8Array(8);
        for (let i = 0; i < 8; i++)
          bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
        return new DataView(bytes.buffer).getFloat64(0, isLE);
      };
      return [toDouble(xHex), toDouble(yHex)];
    } catch {
      return [2.35, 48.85];
    }
  }
  return [2.35, 48.85];
}

const GREEN = "#1D9E75";
const GREEN_LIGHT = "#E1F5EE";
const GREEN_DARK = "#085041";
const GREEN_MID = "#0F6E56";

const LEVEL_LABELS: Record<HikeLevel, string> = {
  easy: "Facile",
  intermediate: "Intermédiaire",
  hard: "Difficile",
  expert: "Expert",
};

const LEVEL_COLORS: Record<HikeLevel, { bg: string; text: string; border: string }> = {
  easy:         { bg: "#E1F5EE", text: "#085041", border: "#9FE1CB" },
  intermediate: { bg: "#FAEEDA", text: "#633806", border: "#FAC775" },
  hard:         { bg: "#FAECE7", text: "#712B13", border: "#F4A98A" },
  expert:       { bg: "#EEEDFE", text: "#3C3489", border: "#CECBF6" },
};

interface Member {
  id: string;
  display_name: string;
  birth_date: string;
  role: string;
}

function formatDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}min`;
  if (m === 0) return `${h}h`;
  return `${h}h${String(m).padStart(2, "0")}`;
}

function formatDate(dateStr: string, flexible: boolean): string {
  const d = new Date(dateStr);
  const months = ["jan.", "fév.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
  if (flexible) return `Flexible — ${months[d.getMonth()]} ${d.getFullYear()}`;
  const days = ["Dim.", "Lun.", "Mar.", "Mer.", "Jeu.", "Ven.", "Sam."];
  return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

function getAge(birthDate: string): number {
  const today = new Date();
  const birth = new Date(birthDate);
  let age = today.getFullYear() - birth.getFullYear();
  if (
    today.getMonth() < birth.getMonth() ||
    (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())
  ) age--;
  return age;
}

export default function HikeDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useSessionContext();
  const userId = session?.user?.id;

  const [hike, setHike] = useState<Hike | null>(null);
  const [creator, setCreator] = useState<User | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const [{ data: hikeData }, { data: membersData }] = await Promise.all([
        supabase.from("hike").select("*").eq("id", id).single(),
        supabase
          .from("participation")
          .select("user_id, role, user:user!user_id(id, display_name, birth_date)")
          .eq("hike_id", id)
          .eq("status", "confirmed"),
      ]);

      if (hikeData) {
        setHike(hikeData as Hike);
        const { data: creatorData } = await supabase
          .from("user")
          .select("*")
          .eq("id", hikeData.creator_id)
          .single();
        if (creatorData) setCreator(creatorData as User);
      }

      if (membersData) {
        setMembers(
          membersData.map((p: any) => ({
            id: p.user_id,
            display_name: p.user?.display_name ?? "Inconnu",
            birth_date: p.user?.birth_date ?? "",
            role: p.role,
          }))
        );
      }

      setLoading(false);
    })();
  }, [id]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={GREEN} />
      </View>
    );
  }

  if (!hike) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Randonnée introuvable.</Text>
      </View>
    );
  }

  const coords: [number, number] = parseCoords(hike.start_location);

  const route = hike.route_coordinates;
  const hasRoute = Array.isArray(route) && route.length >= 2;
  console.log(`[HikeCard] "${hike.title}" route_coordinates:`, route === null ? "null" : route === undefined ? "undefined (RPC manquant)" : `${route.length} points`);
  console.log(route?.length)
    
  const cameraBounds = hasRoute ? (() => {
    const lngs = route!.map((c) => c[0]);
    const lats = route!.map((c) => c[1]);
    return {
      ne: [Math.max(...lngs), Math.max(...lats)] as [number, number],
      sw: [Math.min(...lngs), Math.min(...lats)] as [number, number],
      paddingTop: 40,
      paddingBottom: 40,
      paddingLeft: 24,
      paddingRight: 24,
    };
  })() : null;

  const lineGeoJSON = {
    type: "Feature" as const,
    properties: {},
    geometry: { type: "LineString" as const, coordinates: hasRoute ? route! : [] },
  };

  const handleCancel = () => {
    Alert.alert(
      "Annuler la randonnée",
      "Le groupe restera accessible mais la rando sera marquée comme annulée. Cette action est irréversible.",
      [
        { text: "Retour", style: "cancel" },
        {
          text: "Annuler la rando",
          style: "destructive",
          onPress: async () => {
            setCancelling(true);
            const { error } = await supabase
              .from("hike")
              .update({ status: "cancelled" })
              .eq("id", hike.id);
            setCancelling(false);
            if (error) {
              Alert.alert("Erreur", "Impossible d'annuler la randonnée.");
            } else {
              setHike((prev) => prev ? { ...prev, status: "cancelled" } : prev);
            }
          },
        },
      ]
    );
  };
  const placesLeft = hike.max_participants - hike.current_count;
  const levelStyle = LEVEL_COLORS[hike.level];
  const isActor = hike.creator_id === userId;
  const isMember = members.some((m) => m.id === userId);

  const handleLeave = () => {
    Alert.alert(
      "Quitter la randonnée",
      "Tu seras retiré du groupe et ta place sera libérée.",
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Quitter",
          style: "destructive",
          onPress: async () => {
            setLeaving(true);
            const { error } = await supabase
              .from("participation")
              .update({ status: "left" })
              .eq("hike_id", hike.id)
              .eq("user_id", userId);
            setLeaving(false);
            if (error) {
              Alert.alert("Erreur", "Impossible de quitter la randonnée.");
            } else {
              router.back();
            }
          },
        },
      ]
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>

      {/* ── Map ── */}
      <View style={styles.mapContainer}>
        <MapView
          style={styles.map}
          styleURL="mapbox://styles/mapbox/outdoors-v12"
          scrollEnabled={false}
          zoomEnabled={false}
          rotateEnabled={false}
          pitchEnabled={false}
          attributionEnabled={false}
          logoEnabled={false}
        >
          {cameraBounds ? (
            <Camera bounds={cameraBounds} animationMode="none" animationDuration={0} />
          ) : (
            <Camera centerCoordinate={coords} zoomLevel={12} animationMode="none" animationDuration={0} />
          )}

          {hasRoute && (
            <ShapeSource id="route-detail" shape={lineGeoJSON}>
              <LineLayer
                id="routeLine-detail"
                style={{
                  lineColor: "#1D9E75",
                  lineWidth: 3,
                  lineOpacity: 0.9,
                  lineCap: "round",
                  lineJoin: "round",
                }}
              />
            </ShapeSource>
          )}

          <MarkerView coordinate={coords}>
            <View style={styles.marker}>
              <View style={styles.markerDot} />
            </View>
          </MarkerView>
        </MapView>

        {/* Back button overlay */}
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={20} color="#1a1a1a" />
        </TouchableOpacity>
      </View>

      {/* ── Title + status ── */}
      <View style={styles.titleRow}>
        <Text style={styles.title}>{hike.title}</Text>
        {hike.status === "full" && (
          <View style={styles.fullBadge}>
            <Text style={styles.fullBadgeText}>Complet</Text>
          </View>
        )}
      </View>

      {/* ── Stats pills ── */}
      <View style={styles.statsRow}>
        <StatPill icon="map-outline" value={`${hike.distance_km} km`} label="distance" />
        <StatPill icon="trending-up-outline" value={`${hike.elevation_m} m`} label="dénivelé" />
        <StatPill icon="time-outline" value={formatDuration(hike.duration_min)} label="durée" />
        <StatPill icon="people-outline" value={`${hike.current_count}/${hike.max_participants}`} label="places" />
      </View>

      {/* ── Info card ── */}
      <View style={styles.card}>
        <InfoRow icon="calendar-outline" label="Date" value={formatDate(hike.date_start, hike.date_flexible)} />
        <Divider />
        <InfoRow
          icon="bar-chart-outline"
          label="Niveau"
          value={LEVEL_LABELS[hike.level]}
          valueStyle={{ color: levelStyle.text, backgroundColor: levelStyle.bg, borderColor: levelStyle.border }}
        />
        <Divider />
        <InfoRow
          icon="people-outline"
          label="Participants"
          value={placesLeft > 0 ? `${placesLeft} place${placesLeft > 1 ? "s" : ""} restante${placesLeft > 1 ? "s" : ""}` : "Groupe complet"}
          valueStyle={placesLeft === 0 ? { color: "#712B13" } : undefined}
        />
        {hike.has_vehicle && (
          <>
            <Divider />
            <InfoRow icon="car-outline" label="Voiturage" value="Proposé par l'organisateur" />
          </>
        )}
      </View>

      {/* ── Description ── */}
      {hike.description ? (
        <View style={styles.card}>
          <Text style={styles.sectionLabel}>Description</Text>
          <Text style={styles.description}>{hike.description}</Text>
        </View>
      ) : null}

      {/* ── Organisateur ── */}
      {creator && (
        <View style={styles.card}>
          <Text style={styles.sectionLabel}>Organisateur</Text>
          <TouchableOpacity
            style={styles.creatorRow}
            onPress={() => router.push({ pathname: "/profile/[userId]", params: { userId: creator.id } })}
          >
            <View style={[styles.avatar, { backgroundColor: getAvatarColor(creator.id).bg }]}>
              <Text style={[styles.avatarText, { color: getAvatarColor(creator.id).text }]}>
                {getInitials(creator.display_name)}
              </Text>
            </View>
            <View style={styles.creatorInfo}>
              <Text style={styles.creatorName}>{creator.display_name}</Text>
              <Text style={styles.creatorSub}>
                {getAge(creator.birth_date)} ans
                {creator.rating_count > 0
                  ? ` · ${creator.rating_avg.toFixed(1)} ★ · ${creator.rating_count} rando${creator.rating_count > 1 ? "s" : ""}`
                  : " · Nouveau"}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#C0C0C0" />
          </TouchableOpacity>
        </View>
      )}

      {/* ── Membres ── */}
      {members.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.sectionLabel}>Membres ({members.length})</Text>
          <View style={styles.membersGrid}>
            {members.map((m) => {
              const color = getAvatarColor(m.id);
              const isMe = m.id === userId;
              return (
                <TouchableOpacity
                  key={m.id}
                  style={styles.memberItem}
                  onPress={() =>
                    !isMe && router.push({ pathname: "/profile/[userId]", params: { userId: m.id } })
                  }
                >
                  <View style={[styles.memberAvatar, { backgroundColor: color.bg }]}>
                    <Text style={[styles.memberAvatarText, { color: color.text }]}>
                      {getInitials(m.display_name)}
                    </Text>
                  </View>
                  <Text style={styles.memberName} numberOfLines={1}>
                    {isMe ? "Toi" : m.display_name.split(" ")[0]}
                  </Text>
                  {m.role === "actor" && (
                    <View style={styles.actorBadge}>
                      <Text style={styles.actorBadgeText}>orga</Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}

      {/* ── Quitter (volontaire uniquement) ── */}
      {!isActor && isMember && hike.status !== "cancelled" && (
        <TouchableOpacity
          style={styles.cancelBtn}
          onPress={handleLeave}
          disabled={leaving}
        >
          {leaving
            ? <ActivityIndicator color="#E24B4A" size="small" />
            : <Text style={styles.cancelBtnText}>Quitter la randonnée</Text>
          }
        </TouchableOpacity>
      )}

      {/* ── Annuler (acteur uniquement, rando non annulée) ── */}
      {isActor && hike.status !== "cancelled" && hike.status !== "completed" && (
        <TouchableOpacity
          style={styles.cancelBtn}
          onPress={handleCancel}
          disabled={cancelling}
        >
          {cancelling
            ? <ActivityIndicator color="#E24B4A" size="small" />
            : <Text style={styles.cancelBtnText}>Annuler la randonnée</Text>
          }
        </TouchableOpacity>
      )}

    </ScrollView>
  );
}

// ── Sub-components ──

function StatPill({ icon, value, label }: { icon: any; value: string; label: string }) {
  return (
    <View style={styles.statPill}>
      <Ionicons name={icon} size={14} color={GREEN} />
      <Text style={styles.statPillVal}>{value}</Text>
      <Text style={styles.statPillLbl}>{label}</Text>
    </View>
  );
}

function InfoRow({
  icon,
  label,
  value,
  valueStyle,
}: {
  icon: any;
  label: string;
  value: string;
  valueStyle?: object;
}) {
  const isPill = valueStyle && ("backgroundColor" in valueStyle);
  return (
    <View style={styles.infoRow}>
      <Ionicons name={icon} size={15} color="#9A9A9A" />
      <Text style={styles.infoLabel}>{label}</Text>
      {isPill ? (
        <View style={[styles.levelPill, valueStyle]}>
          <Text style={[styles.levelPillText, { color: (valueStyle as any).color }]}>{value}</Text>
        </View>
      ) : (
        <Text style={[styles.infoValue, valueStyle]}>{value}</Text>
      )}
    </View>
  );
}

function Divider() {
  return <View style={styles.divider} />;
}

// ── Styles ──

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FAFAFA" },
  content: { paddingBottom: 40 },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  errorText: { fontSize: 15, color: "#9A9A9A" },

  // Map
  mapContainer: { height: 240, backgroundColor: "#dce8d6" },
  map: { flex: 1 },
  backBtn: {
    position: "absolute",
    top: 52,
    left: 14,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(255,255,255,0.92)",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  marker: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "rgba(29,158,117,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  markerDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: GREEN,
    borderWidth: 2,
    borderColor: "#fff",
  },

  // Title
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 12,
    gap: 8,
  },
  title: { fontSize: 20, fontWeight: "600", color: "#1A1A1A", flex: 1 },
  fullBadge: {
    backgroundColor: "#FAECE7",
    borderWidth: 0.5,
    borderColor: "#F4A98A",
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  fullBadgeText: { fontSize: 11, color: "#712B13", fontWeight: "500" },

  // Stats pills row
  statsRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    gap: 6,
    marginBottom: 16,
  },
  statPill: {
    flex: 1,
    backgroundColor: "#fff",
    borderWidth: 0.5,
    borderColor: "#E0E0E0",
    borderRadius: 10,
    paddingVertical: 8,
    alignItems: "center",
    gap: 2,
  },
  statPillVal: { fontSize: 12, fontWeight: "600", color: "#1A1A1A" },
  statPillLbl: { fontSize: 10, color: "#9A9A9A" },

  // Card
  card: {
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 0.5,
    borderColor: "#E0E0E0",
    overflow: "hidden",
    paddingHorizontal: 14,
    paddingVertical: 4,
  },
  divider: { height: 0.5, backgroundColor: "#F0F0F0", marginHorizontal: -14 },

  // Info row
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    gap: 10,
  },
  infoLabel: { fontSize: 13, color: "#6A6A6A", flex: 1 },
  infoValue: { fontSize: 13, color: "#1A1A1A", fontWeight: "500", textAlign: "right" },
  levelPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
    borderWidth: 0.5,
  },
  levelPillText: { fontSize: 12, fontWeight: "500" },

  // Section label
  sectionLabel: {
    fontSize: 11,
    fontWeight: "500",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: "#9A9A9A",
    paddingTop: 12,
    paddingBottom: 8,
  },
  description: {
    fontSize: 14,
    color: "#3A3A3A",
    lineHeight: 21,
    paddingBottom: 14,
  },

  // Creator
  creatorRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    gap: 10,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: { fontSize: 14, fontWeight: "600" },
  creatorInfo: { flex: 1 },
  creatorName: { fontSize: 14, fontWeight: "500", color: "#1A1A1A" },
  creatorSub: { fontSize: 12, color: "#9A9A9A", marginTop: 2 },

  // Members grid
  membersGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    paddingBottom: 14,
  },
  memberItem: { alignItems: "center", gap: 4, width: 52 },
  memberAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
  },
  memberAvatarText: { fontSize: 15, fontWeight: "600" },
  memberName: { fontSize: 11, color: "#6A6A6A", textAlign: "center" },
  actorBadge: {
    backgroundColor: GREEN_LIGHT,
    borderRadius: 10,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  actorBadgeText: { fontSize: 9, color: GREEN_MID, fontWeight: "500" },

  cancelBtn: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#F4A8A8",
    alignItems: "center",
    backgroundColor: "#FFF5F5",
  },
  cancelBtnText: { fontSize: 14, color: "#E24B4A", fontWeight: "500" },
});
