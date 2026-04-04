import { View, Text, StyleSheet } from "react-native";
import { BADGES } from "../lib/badges";

const FAMILY_STYLES = {
  distance: {
    bg: "#E1F5EE",
    border: "#9FE1CB",
    text: "#085041",
    icon: "▲",
  },
  hikes: {
    bg: "#FAEEDA",
    border: "#FAC775",
    text: "#633806",
    icon: "◉",
  },
  organizer: {
    bg: "#EEEDFE",
    border: "#CECBF6",
    text: "#3C3489",
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
