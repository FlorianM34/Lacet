import { useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useUnreadContext } from "../../hooks/UnreadContext";
import { GroupWithUnread } from "../../hooks/useUnreadCounts";
import { getAvatarColor, getInitials } from "../../lib/chat";

function formatTimestamp(isoString: string): string {
  const now = new Date();
  const date = new Date(isoString);
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  } else if (diffDays === 1) {
    return "Hier";
  } else if (diffDays < 7) {
    const days = ["Dim.", "Lun.", "Mar.", "Mer.", "Jeu.", "Ven.", "Sam."];
    return days[date.getDay()];
  } else {
    const dd = date.getDate().toString().padStart(2, "0");
    const mm = (date.getMonth() + 1).toString().padStart(2, "0");
    return `${dd}/${mm}`;
  }
}

function StatusPill({ status }: { status: string }) {
  let label = "";
  let bg = "";
  let color = "";

  if (status === "open" || status === "full") {
    label = "À venir";
    bg = "#E1F5EE";
    color = "#1D9E75";
  } else if (status === "completed") {
    label = "Terminée";
    bg = "#f0f0f0";
    color = "#888";
  } else if (status === "cancelled") {
    label = "Annulée";
    bg = "#FFF5F5";
    color = "#A32D2D";
  } else {
    return null;
  }

  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      <Text style={[styles.pillText, { color }]}>{label}</Text>
    </View>
  );
}

export default function GroupsScreen() {
  const { groups, loading, refetch } = useUnreadContext();

  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch])
  );

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#1D9E75" />
      </View>
    );
  }

  if (groups.length === 0) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyEmoji}>👥</Text>
        <Text style={styles.emptyTitle}>Aucun groupe</Text>
        <Text style={styles.emptySubtitle}>
          Rejoignez une rando depuis l'onglet Explorer{"\n"}ou créez la vôtre.
        </Text>
      </View>
    );
  }

  const renderItem = ({ item }: { item: GroupWithUnread }) => {
    const color = getAvatarColor(item.hike_id);
    const hasUnread = item.unread_count > 0;
    const badgeLabel = item.unread_count >= 10 ? "9+" : String(item.unread_count);

    return (
      <TouchableOpacity
        style={styles.row}
        onPress={() =>
          router.push({ pathname: "/chat/[hikeId]", params: { hikeId: item.hike_id } })
        }
      >
        {/* Avatar */}
        <View style={[styles.avatar, { backgroundColor: color.bg }]}>
          <Text style={[styles.avatarText, { color: color.text }]}>
            {getInitials(item.title)}
          </Text>
        </View>

        {/* Main info */}
        <View style={styles.info}>
          <View style={styles.topRow}>
            <Text style={[styles.title, hasUnread && styles.titleBold]} numberOfLines={1}>
              {item.title}
            </Text>
            <View style={styles.topRight}>
              {item.last_message_at && (
                <Text style={styles.timestamp}>
                  {formatTimestamp(item.last_message_at)}
                </Text>
              )}
            </View>
          </View>

          <View style={styles.bottomRow}>
            {item.last_message_preview ? (
              <Text
                style={[styles.preview, hasUnread && styles.previewBold]}
                numberOfLines={1}
              >
                {item.last_message_sender !== null
                  ? `${item.last_message_sender} : ${item.last_message_preview}`
                  : item.last_message_preview}
              </Text>
            ) : (
              <Text style={styles.previewEmpty}>Aucun message</Text>
            )}

            <View style={styles.bottomRight}>
              <StatusPill status={item.status} />
              {hasUnread && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{badgeLabel}</Text>
                </View>
              )}
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={groups}
        keyExtractor={(item) => item.hike_id}
        contentContainerStyle={styles.list}
        renderItem={renderItem}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  centered: { flex: 1, justifyContent: "center", alignItems: "center", padding: 32 },
  list: { paddingTop: 4 },

  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: "#e0e0e0",
    gap: 12,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    flexShrink: 0,
  },
  avatarText: { fontSize: 15, fontWeight: "600" },

  info: { flex: 1, minWidth: 0 },
  topRow: { flexDirection: "row", alignItems: "center", marginBottom: 3 },
  title: { flex: 1, fontSize: 15, fontWeight: "400", color: "#1a1a1a" },
  titleBold: { fontWeight: "600" },
  topRight: { flexShrink: 0, marginLeft: 6 },
  timestamp: { fontSize: 11, color: "#999" },

  bottomRow: { flexDirection: "row", alignItems: "center" },
  preview: { flex: 1, fontSize: 12, color: "#999", minWidth: 0 },
  previewBold: { color: "#555", fontWeight: "500" },
  previewEmpty: { flex: 1, fontSize: 12, color: "#ccc", fontStyle: "italic" },
  bottomRight: { flexDirection: "row", alignItems: "center", gap: 6, marginLeft: 6, flexShrink: 0 },

  pill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  pillText: { fontSize: 10, fontWeight: "500" },

  badge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#E53935",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 4,
  },
  badgeText: { fontSize: 10, fontWeight: "600", color: "#fff" },

  emptyEmoji: { fontSize: 48, marginBottom: 12 },
  emptyTitle: { fontSize: 18, fontWeight: "600", color: "#1a1a1a" },
  emptySubtitle: {
    fontSize: 14,
    color: "#888",
    textAlign: "center",
    marginTop: 8,
    lineHeight: 22,
  },
});
