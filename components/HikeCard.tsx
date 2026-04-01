import { useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  Animated,
  PanResponder,
} from "react-native";
import Mapbox, { MapView, Camera, ShapeSource, LineLayer } from "@rnmapbox/maps";
import type { HikeWithCreator, HikeLevel } from "../types";

Mapbox.setAccessToken(process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? "");

const SCREEN_WIDTH = Dimensions.get("window").width;
const SWIPE_THRESHOLD = 80;

interface Props {
  hike: HikeWithCreator;
  onSwipeLeft: () => void;
  onSwipeRight: () => void;
  isTop: boolean;
}

function formatDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}min`;
  if (m === 0) return `${h}h`;
  return `${h}h${String(m).padStart(2, "0")}`;
}

function formatDate(dateStr: string, flexible: boolean): string {
  if (flexible) {
    const d = new Date(dateStr);
    const months = ["jan.", "fév.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
    return `Flexible ${months[d.getMonth()]}`;
  }
  const d = new Date(dateStr);
  const days = ["Dim.", "Lun.", "Mar.", "Mer.", "Jeu.", "Ven.", "Sam."];
  const months = ["jan.", "fév.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
  return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]}`;
}

function levelLabel(level: HikeLevel): string {
  const map: Record<HikeLevel, string> = {
    easy: "Facile",
    intermediate: "Intermédiaire",
    hard: "Difficile",
    expert: "Expert",
  };
  return map[level];
}

function getAge(birthDate: string): number {
  const today = new Date();
  const birth = new Date(birthDate);
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export default function HikeCard({ hike, onSwipeLeft, onSwipeRight, isTop }: Props) {
  const translateX = useRef(new Animated.Value(0)).current;
  const likeOpacity = useRef(new Animated.Value(0)).current;
  const nopeOpacity = useRef(new Animated.Value(0)).current;

  const rotate = translateX.interpolate({
    inputRange: [-SCREEN_WIDTH, 0, SCREEN_WIDTH],
    outputRange: ["-18deg", "0deg", "18deg"],
    extrapolate: "clamp",
  });

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => isTop,
      onMoveShouldSetPanResponder: (_, g) => isTop && Math.abs(g.dx) > 5,
      onPanResponderMove: (_, gestureState) => {
        translateX.setValue(gestureState.dx);
        // Update hint opacities
        if (gestureState.dx > 30) {
          likeOpacity.setValue(Math.min((gestureState.dx - 30) / 60, 1));
          nopeOpacity.setValue(0);
        } else if (gestureState.dx < -30) {
          nopeOpacity.setValue(Math.min((-gestureState.dx - 30) / 60, 1));
          likeOpacity.setValue(0);
        } else {
          likeOpacity.setValue(0);
          nopeOpacity.setValue(0);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dx > SWIPE_THRESHOLD) {
          Animated.timing(translateX, {
            toValue: SCREEN_WIDTH * 1.4,
            duration: 300,
            useNativeDriver: true,
          }).start(onSwipeRight);
        } else if (gestureState.dx < -SWIPE_THRESHOLD) {
          Animated.timing(translateX, {
            toValue: -SCREEN_WIDTH * 1.4,
            duration: 300,
            useNativeDriver: true,
          }).start(onSwipeLeft);
        } else {
          Animated.spring(translateX, {
            toValue: 0,
            useNativeDriver: true,
            friction: 5,
          }).start();
          Animated.timing(likeOpacity, { toValue: 0, duration: 150, useNativeDriver: true }).start();
          Animated.timing(nopeOpacity, { toValue: 0, duration: 150, useNativeDriver: true }).start();
        }
      },
    })
  ).current;

  // Trigger swipe programmatically
  (HikeCard as any).swipeLeft = () => {
    Animated.timing(translateX, {
      toValue: -SCREEN_WIDTH * 1.4,
      duration: 300,
      useNativeDriver: true,
    }).start(onSwipeLeft);
  };
  (HikeCard as any).swipeRight = () => {
    Animated.timing(translateX, {
      toValue: SCREEN_WIDTH * 1.4,
      duration: 300,
      useNativeDriver: true,
    }).start(onSwipeRight);
  };

  const placesLeft = hike.max_participants - hike.current_count;

  // Mini map GeoJSON
  const coords = hike.start_location?.coordinates;
  const mapCenter: [number, number] = coords ? [coords[0], coords[1]] : [2.35, 48.85];

  const { creator } = hike;
  const creatorAge = creator?.birth_date ? getAge(creator.birth_date) : null;

  const cardStyle = isTop
    ? { transform: [{ translateX }, { rotate }] }
    : { transform: [{ scale: 0.95 }, { translateY: 8 }] };

  return (
    <Animated.View
      style={[styles.card, cardStyle]}
      {...(isTop ? panResponder.panHandlers : {})}
    >
      {/* Swipe hints */}
      {isTop && (
        <>
          <Animated.View style={[styles.likeHint, { opacity: likeOpacity }]}>
            <Text style={styles.likeHintText}>Rejoindre</Text>
          </Animated.View>
          <Animated.View style={[styles.nopeHint, { opacity: nopeOpacity }]}>
            <Text style={styles.nopeHintText}>Passer</Text>
          </Animated.View>
        </>
      )}

      {/* Mini map */}
      <View style={styles.mapArea}>
        <MapView
          style={styles.miniMap}
          styleURL="mapbox://styles/mapbox/outdoors-v12"
          scrollEnabled={false}
          zoomEnabled={false}
          rotateEnabled={false}
          pitchEnabled={false}
          attributionEnabled={false}
          logoEnabled={false}
        >
          <Camera
            defaultSettings={{ centerCoordinate: [2.35, 48.85], zoomLevel: 8 }}
            centerCoordinate={mapCenter}
            zoomLevel={11}
            animationMode="none"
            animationDuration={0}
          />
        </MapView>
      </View>

      {/* Card body */}
      <View style={styles.body}>

        {/* Title */}
        <Text style={styles.cardTitle} numberOfLines={2}>{hike.title}</Text>

        {/* Stats 2×2 grid */}
        <View style={styles.statsGrid}>
          <View style={styles.statBox}>
            <Text style={styles.statBoxValue}>{hike.distance_km} km</Text>
            <Text style={styles.statBoxLabel}>Distance</Text>
          </View>
          <View style={[styles.statBox, styles.statBoxBorderLeft]}>
            <Text style={styles.statBoxValue}>{formatDuration(hike.duration_min)}</Text>
            <Text style={styles.statBoxLabel}>Durée</Text>
          </View>
          <View style={[styles.statBox, styles.statBoxBorderTop]}>
            <Text style={styles.statBoxValue}>+{hike.elevation_m} m</Text>
            <Text style={styles.statBoxLabel}>Dénivelé</Text>
          </View>
          <View style={[styles.statBox, styles.statBoxBorderLeft, styles.statBoxBorderTop, placesLeft <= 2 && styles.statBoxUrgent]}>
            <Text style={[styles.statBoxValue, placesLeft <= 2 && styles.statBoxValueUrgent]}>
              {placesLeft}/{hike.max_participants}
            </Text>
            <Text style={[styles.statBoxLabel, placesLeft <= 2 && styles.statBoxLabelUrgent]}>
              {placesLeft <= 2 ? "Presque complet" : "Places libre"}
            </Text>
          </View>
        </View>

        {/* Date section */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Date</Text>
          <View style={styles.dateRow}>
            <Text style={styles.dateText}>{formatDate(hike.date_start, hike.date_flexible)}</Text>
            {hike.date_flexible && (
              <View style={styles.flexibleBadge}>
                <Text style={styles.flexibleBadgeText}>Flexible</Text>
              </View>
            )}
          </View>
        </View>

        {/* Description section */}
        {hike.description ? (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>À propos</Text>
            <Text style={styles.description} numberOfLines={2}>{hike.description}</Text>
          </View>
        ) : null}

        {/* Niveau & options */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Niveau</Text>
          <View style={styles.tagsRow}>
            <View style={[styles.tag, styles.tagAmber]}>
              <Text style={[styles.tagText, styles.tagAmberText]}>{levelLabel(hike.level)}</Text>
            </View>
            {hike.has_vehicle && (
              <View style={[styles.tag, styles.tagPurple]}>
                <Text style={[styles.tagText, styles.tagPurpleText]}>Voiturage 🚗</Text>
              </View>
            )}
          </View>
        </View>

        {/* Organisateur section */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Organisateur</Text>
          <View style={styles.organizer}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {creator ? getInitials(creator.display_name) : "?"}
              </Text>
            </View>
            <View style={styles.orgInfo}>
              <Text style={styles.orgName}>{creator?.display_name ?? "Organisateur"}</Text>
              <Text style={styles.orgRating}>
                {creatorAge ? `${creatorAge} ans` : ""}
                {creator && creator.rating_count > 0
                  ? `  ·  ★ ${creator.rating_avg.toFixed(1)}  ·  ${creator.rating_count} rando${creator.rating_count > 1 ? "s" : ""}`
                  : "  ·  Nouveau"}
              </Text>
            </View>
          </View>
        </View>

      </View>
    </Animated.View>
  );
}

// Expose programmatic swipe methods via ref-like pattern
HikeCard.swipeLeft = () => {};
HikeCard.swipeRight = () => {};

const styles = StyleSheet.create({
  card: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#fff",
    borderRadius: 18,
    borderWidth: 0.5,
    borderColor: "#e0e0e0",
    overflow: "hidden",
  },

  // Swipe hints
  likeHint: {
    position: "absolute",
    top: 16,
    left: 14,
    backgroundColor: "#E1F5EE",
    borderWidth: 1.5,
    borderColor: "#1D9E75",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    zIndex: 10,
  },
  likeHintText: { fontSize: 13, fontWeight: "500", color: "#085041" },
  nopeHint: {
    position: "absolute",
    top: 16,
    right: 14,
    backgroundColor: "#FCEBEB",
    borderWidth: 1.5,
    borderColor: "#E24B4A",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    zIndex: 10,
  },
  nopeHintText: { fontSize: 13, fontWeight: "500", color: "#A32D2D" },

  // Mini map
  mapArea: { height: 160, backgroundColor: "#e8f0e4" },
  miniMap: { flex: 1 },

  // Body
  body: { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 12, flex: 1, gap: 0 },

  cardTitle: { fontSize: 17, fontWeight: "600", color: "#1a1a1a", lineHeight: 22, marginBottom: 10 },

  // Stats 2×2 grid
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    borderWidth: 0.5,
    borderColor: "#e8e8e8",
    borderRadius: 10,
    overflow: "hidden",
    marginBottom: 0,
  },
  statBox: {
    width: "50%",
    paddingVertical: 10,
    alignItems: "center",
    backgroundColor: "#fafafa",
  },
  statBoxBorderLeft: { borderLeftWidth: 0.5, borderLeftColor: "#e8e8e8" },
  statBoxBorderTop: { borderTopWidth: 0.5, borderTopColor: "#e8e8e8" },
  statBoxUrgent: { backgroundColor: "#FFF8ED" },
  statBoxValue: { fontSize: 16, fontWeight: "600", color: "#1a1a1a" },
  statBoxValueUrgent: { color: "#B45309" },
  statBoxLabel: { fontSize: 10, color: "#999", marginTop: 2 },
  statBoxLabelUrgent: { color: "#D97706" },

  // Sections
  section: {
    borderTopWidth: 0.5,
    borderTopColor: "#ececec",
    paddingTop: 9,
    marginTop: 9,
  },
  sectionLabel: {
    fontSize: 9,
    fontWeight: "700",
    color: "#bbb",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginBottom: 5,
  },

  // Date
  dateRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  dateText: { fontSize: 12, fontWeight: "500", color: "#1a1a1a" },
  flexibleBadge: {
    backgroundColor: "#E1F5EE",
    borderWidth: 0.5,
    borderColor: "#9FE1CB",
    borderRadius: 20,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  flexibleBadgeText: { fontSize: 10, color: "#085041", fontWeight: "500" },

  // Description preview
  description: { fontSize: 12, color: "#666", lineHeight: 17, fontWeight: "500" },

  // Tags
  tagsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  tag: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
    backgroundColor: "#E1F5EE",
    borderWidth: 0.5,
    borderColor: "#9FE1CB",
  },
  tagText: { fontSize: 11, color: "#085041" },
  tagAmber: { backgroundColor: "#FAEEDA", borderColor: "#FAC775" },
  tagAmberText: { color: "#633806" },
  tagPurple: { backgroundColor: "#EEEDFE", borderColor: "#CECBF6" },
  tagPurpleText: { color: "#3C3489" },

  // Organizer
  organizer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#E1F5EE",
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: { fontSize: 11, fontWeight: "500", color: "#085041" },
  orgInfo: { flex: 1 },
  orgName: { fontSize: 12, fontWeight: "500", color: "#1a1a1a" },
  orgRating: { fontSize: 11, color: "#999" },
});
