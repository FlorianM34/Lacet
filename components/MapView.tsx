import { useRef, useCallback } from "react";
import { StyleSheet, View, Text } from "react-native";
import Mapbox, {
  MapView as MBMapView,
  Camera,
  ShapeSource,
  LineLayer,
  CircleLayer,
} from "@rnmapbox/maps";

Mapbox.setAccessToken(process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? "");

interface Props {
  coordinates?: [number, number][];
  drawMode?: boolean;
  onMapPress?: (coordinate: [number, number]) => void;
  centerCoordinate?: [number, number];
}

export default function MapView({
  coordinates = [],
  drawMode = false,
  onMapPress,
  centerCoordinate,
}: Props) {
  const cameraRef = useRef<Camera>(null);

  const lineGeoJSON: GeoJSON.FeatureCollection = {
    type: "FeatureCollection",
    features:
      coordinates.length >= 2
        ? [
            {
              type: "Feature",
              properties: {},
              geometry: {
                type: "LineString",
                coordinates,
              },
            },
          ]
        : [],
  };

  const pointsGeoJSON: GeoJSON.FeatureCollection = {
    type: "FeatureCollection",
    features: drawMode
      ? coordinates.map((coord, i) => ({
          type: "Feature" as const,
          properties: { index: i },
          geometry: {
            type: "Point" as const,
            coordinates: coord,
          },
        }))
      : [],
  };

  const handlePress = useCallback(
    (event: any) => {
      if (!drawMode || !onMapPress) return;
      const [lng, lat] = event.geometry.coordinates as number[];
      onMapPress([lng, lat]);
    },
    [drawMode, onMapPress]
  );

  const center = centerCoordinate ??
    (coordinates.length > 0 ? coordinates[0] : [2.3522, 48.8566]);

  return (
    <View style={styles.container}>
      <MBMapView
        style={styles.map}
        onPress={handlePress}
        styleURL="mapbox://styles/mapbox/outdoors-v12"
      >
        <Camera
          ref={cameraRef}
          zoomLevel={coordinates.length > 0 ? 12 : 5}
          centerCoordinate={center}
          animationMode="none"
          animationDuration={0}
        />

        {coordinates.length >= 2 && (
          <ShapeSource id="route-line" shape={lineGeoJSON}>
            <LineLayer
              id="route-line-layer"
              style={{
                lineColor: "#2E7D32",
                lineWidth: 3,
                lineCap: "round",
                lineJoin: "round",
              }}
            />
          </ShapeSource>
        )}

        {drawMode && coordinates.length > 0 && (
          <ShapeSource id="draw-points" shape={pointsGeoJSON}>
            <CircleLayer
              id="draw-points-layer"
              style={{
                circleRadius: 6,
                circleColor: "#2E7D32",
                circleStrokeColor: "#fff",
                circleStrokeWidth: 2,
              }}
            />
          </ShapeSource>
        )}
      </MBMapView>

      {drawMode && coordinates.length === 0 && (
        <View style={styles.hint}>
          <Text style={styles.hintText}>
            Tapez sur la carte pour tracer votre itinéraire
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, borderRadius: 12, overflow: "hidden" },
  map: { flex: 1 },
  hint: {
    position: "absolute",
    bottom: 16,
    left: 16,
    right: 16,
    backgroundColor: "rgba(0,0,0,0.7)",
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  hintText: { color: "#fff", fontSize: 13 },
});
