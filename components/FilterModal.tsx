import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
} from "react-native";
import type { FeedFilters, HikeLevel } from "../types";

const RADII = [10, 25, 50, 100];
const DATE_RANGES: { value: FeedFilters["dateRange"]; label: string }[] = [
  { value: "week", label: "Cette semaine" },
  { value: "month", label: "Ce mois" },
  { value: "flexible", label: "Flexible" },
  { value: "all", label: "Tout" },
];
const LEVELS: { value: HikeLevel | null; label: string }[] = [
  { value: null, label: "Tous" },
  { value: "easy", label: "Facile" },
  { value: "intermediate", label: "Intermédiaire" },
  { value: "hard", label: "Difficile" },
  { value: "expert", label: "Expert" },
];

interface Props {
  visible: boolean;
  filters: FeedFilters;
  onChange: (filters: FeedFilters) => void;
  onClose: () => void;
}

export default function FilterModal({ visible, filters, onChange, onClose }: Props) {
  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.title}>Filtres</Text>

          {/* Radius */}
          <Text style={styles.label}>Rayon de recherche</Text>
          <View style={styles.chipRow}>
            {RADII.map((r) => (
              <TouchableOpacity
                key={r}
                style={[styles.chip, filters.radiusKm === r && styles.chipActive]}
                onPress={() => onChange({ ...filters, radiusKm: r })}
              >
                <Text style={[styles.chipText, filters.radiusKm === r && styles.chipTextActive]}>
                  {r} km
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Date */}
          <Text style={styles.label}>Période</Text>
          <View style={styles.chipRow}>
            {DATE_RANGES.map((d) => (
              <TouchableOpacity
                key={d.value}
                style={[styles.chip, filters.dateRange === d.value && styles.chipActive]}
                onPress={() => onChange({ ...filters, dateRange: d.value })}
              >
                <Text
                  style={[styles.chipText, filters.dateRange === d.value && styles.chipTextActive]}
                >
                  {d.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Level */}
          <Text style={styles.label}>Niveau</Text>
          <View style={styles.chipRow}>
            {LEVELS.map((l) => (
              <TouchableOpacity
                key={l.value ?? "all"}
                style={[styles.chip, filters.level === l.value && styles.chipActive]}
                onPress={() => onChange({ ...filters, level: l.value })}
              >
                <Text
                  style={[styles.chipText, filters.level === l.value && styles.chipTextActive]}
                >
                  {l.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity style={styles.applyButton} onPress={onClose}>
            <Text style={styles.applyText}>Appliquer</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.4)" },
  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: 40,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#ddd",
    alignSelf: "center",
    marginBottom: 16,
  },
  title: { fontSize: 18, fontWeight: "600", color: "#1a1a1a", marginBottom: 20 },
  label: { fontSize: 14, fontWeight: "600", color: "#333", marginTop: 16, marginBottom: 10 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#ccc",
  },
  chipActive: { backgroundColor: "#2E7D32", borderColor: "#2E7D32" },
  chipText: { fontSize: 13, color: "#333" },
  chipTextActive: { color: "#fff" },
  applyButton: {
    backgroundColor: "#2E7D32",
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 28,
  },
  applyText: { color: "#fff", fontSize: 16, fontWeight: "600" },
});
