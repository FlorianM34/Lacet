import { View, Text, StyleSheet } from "react-native";
import { getAvatarColor, getInitials, formatTime, isRdvMessage } from "../lib/chat";

interface Props {
  content: string;
  senderName: string;
  senderId: string;
  sentAt: string;
  isMine: boolean;
  isSystem?: boolean;
}

export default function MessageBubble({
  content,
  senderName,
  senderId,
  sentAt,
  isMine,
  isSystem,
}: Props) {
  // System message
  if (isSystem) {
    return (
      <View style={styles.systemRow}>
        <View style={styles.systemPill}>
          <Text style={styles.systemText}>{content}</Text>
        </View>
      </View>
    );
  }

  const avatarColor = getAvatarColor(senderId);
  const rdv = isRdvMessage(content);
  const time = formatTime(sentAt);

  // RDV pill
  if (rdv) {
    return (
      <View style={styles.rdvRow}>
        <View style={styles.rdvPill}>
          <Text style={styles.rdvPillIcon}>📍</Text>
          <View style={styles.rdvPillBody}>
            <Text style={styles.rdvPillLocation}>{rdv.location}</Text>
            <Text style={styles.rdvPillDatetime}>{rdv.datetime}</Text>
          </View>
        </View>
        <Text style={styles.rdvMeta}>
          {isMine ? "Toi" : senderName.split(" ")[0]} · {time}
        </Text>
      </View>
    );
  }

  // Regular message
  return (
    <View style={[styles.msgRow, isMine && styles.msgRowMine]}>
      {!isMine && (
        <View style={[styles.avatar, { backgroundColor: avatarColor.bg }]}>
          <Text style={[styles.avatarText, { color: avatarColor.text }]}>
            {getInitials(senderName)}
          </Text>
        </View>
      )}
      <View>
        <View style={[styles.bubble, isMine ? styles.bubbleMine : styles.bubbleTheirs]}>
          <Text style={[styles.bubbleText, isMine && styles.bubbleTextMine]}>
            {content}
          </Text>
        </View>
        <Text style={[styles.meta, isMine && styles.metaMine]}>
          {isMine ? "Toi" : senderName.split(" ")[0]} · {time}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Message row
  msgRow: { flexDirection: "row", alignItems: "flex-end", gap: 6, marginBottom: 4 },
  msgRowMine: { flexDirection: "row-reverse" },

  // Avatar
  avatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: { fontSize: 9, fontWeight: "500" },

  // Bubble
  bubble: { maxWidth: 220, paddingHorizontal: 11, paddingVertical: 8, borderRadius: 16 },
  bubbleTheirs: {
    backgroundColor: "#f0f0f0",
    borderWidth: 0.5,
    borderColor: "#e0e0e0",
    borderBottomLeftRadius: 4,
  },
  bubbleMine: {
    backgroundColor: "#1D9E75",
    borderBottomRightRadius: 4,
  },
  bubbleText: { fontSize: 13, lineHeight: 18, color: "#1a1a1a" },
  bubbleTextMine: { color: "#fff" },

  // Meta
  meta: { fontSize: 10, color: "#999", marginTop: 2, paddingHorizontal: 4 },
  metaMine: { textAlign: "right" },

  // System message
  systemRow: { alignItems: "center", marginVertical: 4 },
  systemPill: {
    backgroundColor: "#f0f0f0",
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 4,
    maxWidth: 220,
  },
  systemText: { fontSize: 11, color: "#999", textAlign: "center" },

  // RDV pill
  rdvRow: { alignItems: "center", marginVertical: 6 },
  rdvPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#E1F5EE",
    borderWidth: 0.5,
    borderColor: "#9FE1CB",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    maxWidth: 260,
  },
  rdvPillIcon: { fontSize: 18 },
  rdvPillBody: { flexShrink: 1 },
  rdvPillLocation: { fontSize: 13, fontWeight: "600", color: "#085041" },
  rdvPillDatetime: { fontSize: 11, color: "#0F6E56", marginTop: 2 },
  rdvMeta: { fontSize: 10, color: "#999", marginTop: 4 },
});
