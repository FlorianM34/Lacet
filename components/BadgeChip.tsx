import { View, Text, StyleSheet } from "react-native";
import { BADGES } from "../lib/badges";

const FAMILY_STYLES = {
  distance: {
    bg: "rgba(29,158,117,0.18)",
    border: "rgba(29,158,117,0.45)",
    text: "#9FE1CB",
    icon: "▲",
  },
  hikes: {
    bg: "rgba(250,199,117,0.15)",
    border: "rgba(250,199,117,0.4)",
    text: "#FAC775",
    icon: "◉",
  },
  organizer: {
    bg: "rgba(206,203,246,0.12)",
    border: "rgba(206,203,246,0.35)",
    text: "#CECBF6",
    icon: "★",
  },
};

interface Props {
  badgeId: string;
}

export default function BadgeChip({ badgeId }: Props) {
  const badge = BADGES.find((b) => b.id === badgeId);
  if (!badge) return null;

  const style = FAMILY_STYLES[badge.family];

  return (
    <View style={[styles.chip, { backgroundColor: style.bg, borderColor: style.border }]}>
      <Text style={[styles.icon, { color: style.text }]}>{style.icon}</Text>
      <Text style={[styles.label, { color: style.text }]}>{badge.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 0.5,
  },
  icon: { fontSize: 10, lineHeight: 14 },
  label: { fontSize: 11, fontWeight: "500" },
});
