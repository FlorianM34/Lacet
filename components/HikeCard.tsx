import { useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  Animated,
  PanResponder,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Mapbox, { MapView, MarkerView, Camera, ShapeSource, LineLayer } from "@rnmapbox/maps";
import type { HikeWithCreator, HikeLevel } from "../types";

Mapbox.setAccessToken(process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? "");

const SCREEN_WIDTH = Dimensions.get("window").width;
const SWIPE_THRESHOLD = 80;
const GREEN = "#1D9E75";

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
  const d = new Date(dateStr);
  const months = ["jan.", "fév.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
  if (flexible) return `Flexible ${months[d.getMonth()]}`;
  const days = ["Dim.", "Lun.", "Mar.", "Mer.", "Jeu.", "Ven.", "Sam."];
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

  const isTopRef = useRef(isTop);
  isTopRef.current = isTop;

  const rotate = translateX.interpolate({
    inputRange: [-SCREEN_WIDTH, 0, SCREEN_WIDTH],
    outputRange: ["-18deg", "0deg", "18deg"],
    extrapolate: "clamp",
  });

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => isTopRef.current,
      onMoveShouldSetPanResponder: (_, g) => isTopRef.current && Math.abs(g.dx) > 5,
      onPanResponderMove: (_, gestureState) => {
        if (!isTopRef.current) return;
        translateX.setValue(gestureState.dx);
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
        if (!isTopRef.current) return;
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
          Animated.spring(translateX, { toValue: 0, useNativeDriver: true, friction: 5 }).start();
          Animated.timing(likeOpacity, { toValue: 0, duration: 150, useNativeDriver: true }).start();
          Animated.timing(nopeOpacity, { toValue: 0, duration: 150, useNativeDriver: true }).start();
        }
      },
    })
  ).current;

  const placesLeft = hike.max_participants - hike.current_count;
  const coords = hike.start_location?.coordinates;

  const route = hike.route_coordinates;
  const hasRoute = Array.isArray(route) && route.length >= 2;

  const cameraBounds = hasRoute
    ? (() => {
      const lngs = route!.map((c) => c[0]);
      const lats = route!.map((c) => c[1]);
      return {
        ne: [Math.max(...lngs), Math.max(...lats)] as [number, number],
        sw: [Math.min(...lngs), Math.min(...lats)] as [number, number],
        paddingTop: 80,
        paddingBottom: 220,
        paddingLeft: 32,
        paddingRight: 32,
      };
    })()
    : null;

  const lineGeoJSON = {
    type: "Feature" as const,
    properties: {},
    geometry: { type: "LineString" as const, coordinates: hasRoute ? route! : [] },
  };

  const { creator } = hike;
  const creatorAge = creator?.birth_date ? getAge(creator.birth_date) : null;

  const cardStyle = isTop
    ? { transform: [{ translateX }, { rotate }] }
    : { transform: [{ scale: 0.97 }, { translateY: 10 }], opacity: 0.75 };

  return (
    <Animated.View
      style={[styles.card, cardStyle]}
      {...(isTop ? panResponder.panHandlers : {})}
    >
      {/* Map fills entire card */}
      <MapView
        style={styles.map}
        styleURL="mapbox://styles/mapbox/outdoors-v12"
        scrollEnabled={true}
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

      {/* Gradient overlay */}
      <LinearGradient
        colors={["rgba(6,16,10,0.72)", "transparent", "rgba(8,20,12,0.55)", "rgba(6,16,10,0.97)"]}
        locations={[0, 0.25, 0.55, 0.82]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      {/* Swipe hints */}
      {isTop && (
        <>
          <Animated.View style={[styles.joinHint, { opacity: likeOpacity }]}>
            <Text style={styles.joinHintText}>Rejoindre</Text>
          </Animated.View>
          <Animated.View style={[styles.passHint, { opacity: nopeOpacity }]}>
            <Text style={styles.passHintText}>Passer</Text>
          </Animated.View>
        </>
      )}

      {/* Info panel */}
      <View style={styles.infoPanel}>
        <Text style={styles.hikeTitle} numberOfLines={2}>{hike.title}</Text>

        {/* Stats row */}
        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <Text style={styles.statVal}>{hike.distance_km} km</Text>
            <Text style={styles.statLbl}>distance</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statVal}>{formatDuration(hike.duration_min)}</Text>
            <Text style={styles.statLbl}>durée</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statVal}>{hike.elevation_m} m</Text>
            <Text style={styles.statLbl}>dénivelé</Text>
          </View>
          <View style={[styles.stat, placesLeft <= 2 && styles.statUrgent]}>
            <Text style={[styles.statVal, placesLeft <= 2 && styles.statValUrgent]}>
              {placesLeft}/{hike.max_participants}
            </Text>
            <Text style={styles.statLbl}>places</Text>
          </View>
        </View>

        {/* Tags row */}
        <View style={styles.tagsRow}>
          <View style={styles.tag}>
            <Text style={styles.tagText}>{formatDate(hike.date_start, hike.date_flexible)}</Text>
          </View>
          <View style={styles.tag}>
            <Text style={styles.tagText}>{levelLabel(hike.level)}</Text>
          </View>
          {hike.has_vehicle && (
            <View style={[styles.tag, styles.tagGreen]}>
              <Text style={[styles.tagText, styles.tagGreenText]}>Voiturage</Text>
            </View>
          )}
        </View>

        {/* Organizer */}
        <View style={styles.organizer}>
          <View style={styles.orgAvatar}>
            <Text style={styles.orgAvatarText}>
              {creator ? getInitials(creator.display_name) : "?"}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.orgName}>
              {creator?.display_name ?? "Organisateur"}
              {creatorAge ? ` · ${creatorAge} ans` : ""}
            </Text>
            <Text style={styles.orgRating}>
              {creator && creator.rating_count > 0
                ? `★ ${creator.rating_avg.toFixed(1)} · ${creator.rating_count} rando${creator.rating_count > 1 ? "s" : ""} organisée${creator.rating_count > 1 ? "s" : ""}`
                : "Nouveau organisateur"}
            </Text>
          </View>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    overflow: "hidden",
    backgroundColor: "#1a2e20",
  },
  // Map
  map: {flex: 1},
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

  // Swipe hints
  joinHint: {
    position: "absolute",
    top: 80,
    left: 18,
    backgroundColor: "#1D9E75",
    borderWidth: 2,
    borderColor: "white",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 5,
    zIndex: 20,
    transform: [{ rotate: "-15deg" }],
  },
  joinHintText: { fontSize: 13, fontWeight: "600", color: "white" },
  passHint: {
    position: "absolute",
    top: 80,
    right: 18,
    backgroundColor: "#E24B4A",
    borderWidth: 2,
    borderColor: "white",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 5,
    zIndex: 20,
    transform: [{ rotate: "15deg" }],
  },
  passHintText: { fontSize: 13, fontWeight: "600", color: "white" },

  // Info panel
  infoPanel: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
    paddingBottom: 100,
  },
  hikeTitle: {
    fontSize: 20,
    fontWeight: "500",
    color: "white",
    marginBottom: 4,
    lineHeight: 24,
    letterSpacing: -0.3,
  },

  // Stats row
  statsRow: {
    flexDirection: "row",
    gap: 6,
    marginBottom: 10,
    marginTop: 8,
  },
  stat: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 0.5,
    borderColor: "rgba(255,255,255,0.2)",
    borderRadius: 8,
    paddingVertical: 7,
    alignItems: "center",
  },
  statUrgent: {
    backgroundColor: "rgba(250,163,53,0.22)",
    borderColor: "rgba(250,163,53,0.4)",
  },
  statVal: { fontSize: 12, fontWeight: "600", color: "white" },
  statValUrgent: { color: "#FAC040" },
  statLbl: { fontSize: 9, color: "rgba(255,255,255,0.55)", marginTop: 1 },

  // Tags row
  tagsRow: { flexDirection: "row", gap: 5, flexWrap: "wrap", marginBottom: 10 },
  tag: {
    backgroundColor: "rgba(255,255,255,0.15)",
    borderWidth: 0.5,
    borderColor: "rgba(255,255,255,0.2)",
    borderRadius: 12,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  tagText: { fontSize: 10, color: "white" },
  tagGreen: {
    backgroundColor: "rgba(29,158,117,0.35)",
    borderColor: "rgba(29,158,117,0.6)",
  },
  tagGreenText: { color: "#9FE1CB" },

  // Organizer
  organizer: { flexDirection: "row", alignItems: "center", gap: 8 },
  orgAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#E1F5EE",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.4)",
    flexShrink: 0,
  },
  orgAvatarText: { fontSize: 10, fontWeight: "600", color: "#085041" },
  orgName: { fontSize: 12, color: "rgba(255,255,255,0.9)", fontWeight: "500" },
  orgRating: { fontSize: 10, color: "rgba(255,255,255,0.5)", marginTop: 1 },
});
