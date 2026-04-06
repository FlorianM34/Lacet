import { useState, useCallback, useLayoutEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { router, useFocusEffect, useNavigation } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useUnreadContext } from "../../hooks/UnreadContext";
import { GroupWithUnread } from "../../hooks/useUnreadCounts";
import { getAvatarColor, getInitials } from "../../lib/chat";

const BG = "#0f1f14";
const ROW_BG = "#162a1c";

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

function formatHikeDate(isoString: string): string {
  if (!isoString) return "";
  const date = new Date(isoString);
  const days = ["Dim.", "Lun.", "Mar.", "Mer.", "Jeu.", "Ven.", "Sam."];
  const months = [
    "janv.", "févr.", "mars", "avr.", "mai", "juin",
    "juil.", "août", "sept.", "oct.", "nov.", "déc.",
  ];
  return `${days[date.getDay()]} ${date.getDate()} ${months[date.getMonth()]}`;
}

function MemberAvatars({ participants }: { participants: Array<{ id: string; name: string }> }) {
  return (
    <View style={styles.membersRow}>
      {participants.slice(0, 4).map((p, i) => {
        const color = getAvatarColor(p.id);
        return (
          <View
            key={p.id}
            style={[
              styles.memberAvatar,
              { backgroundColor: color.bg, marginLeft: i === 0 ? 0 : -5 },
            ]}
          >
            <Text style={[styles.memberAvatarText, { color: color.text }]}>
              {getInitials(p.name)}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function GroupRow({
  item,
  isFirst,
  isLast,
  isOnly,
  isDone,
}: {
  item: GroupWithUnread;
  isFirst: boolean;
  isLast: boolean;
  isOnly: boolean;
  isDone: boolean;
}) {
  const hasUnread = item.unread_count > 0;
  const badgeLabel = item.unread_count >= 10 ? "9+" : String(item.unread_count);

  const radiusStyle = isOnly
    ? { borderRadius: 14 }
    : isFirst
    ? { borderTopLeftRadius: 14, borderTopRightRadius: 14 }
    : isLast
    ? { borderBottomLeftRadius: 14, borderBottomRightRadius: 14 }
    : {};

  const dotStyle = isDone ? styles.dotDone : styles.dotUpcoming;

  const metaCount =
    item.max_participants > 0
      ? `${item.current_count}/${item.max_participants}`
      : `${item.current_count}`;
  const metaText = `${metaCount} · ${formatHikeDate(item.date_start)}`;

  return (
    <TouchableOpacity
      style={[styles.groupRow, radiusStyle, !isFirst && styles.groupRowBorder]}
      onPress={() =>
        router.push({ pathname: "/chat/[hikeId]", params: { hikeId: item.hike_id } })
      }
      activeOpacity={0.75}
    >
      <View style={[styles.statusDot, dotStyle]} />

      <View style={styles.rowLeft}>
        <Text
          style={[styles.rowTitle, hasUnread && styles.rowTitleUnread]}
          numberOfLines={1}
        >
          {item.title}
        </Text>
        <View style={styles.rowMeta}>
          {item.participants.length > 0 && (
            <MemberAvatars participants={item.participants} />
          )}
          <Text style={styles.rowMetaText}>{metaText}</Text>
        </View>
        {item.last_message_preview ? (
          <Text
            style={[styles.rowPreview, hasUnread && styles.rowPreviewUnread]}
            numberOfLines={1}
          >
            {item.last_message_sender !== null
              ? `${item.last_message_sender} : ${item.last_message_preview}`
              : item.last_message_preview}
          </Text>
        ) : (
          <Text style={styles.rowPreview} numberOfLines={1}>
            Groupe créé · {item.current_count} membre
            {item.current_count > 1 ? "s" : ""}
          </Text>
        )}
      </View>

      <View style={styles.rowRight}>
        {item.last_message_at && (
          <Text style={[styles.rowTime, hasUnread && styles.rowTimeUnread]}>
            {formatTimestamp(item.last_message_at)}
          </Text>
        )}
        {hasUnread && (
          <View style={styles.unreadBadge}>
            <Text style={styles.unreadBadgeText}>{badgeLabel}</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

export default function GroupsScreen() {
  const { groups, loading, refetch } = useUnreadContext();
  const navigation = useNavigation();
  const [activeTab, setActiveTab] = useState<"upcoming" | "done">("upcoming");

  useLayoutEffect(() => {
    navigation.setOptions({
      headerTitle: "Mes groupes",
      headerStyle: { backgroundColor: BG },
      headerTitleStyle: { color: "white", fontSize: 18, fontWeight: "500" },
      headerShadowVisible: false,
      headerRight: () => (
        <TouchableOpacity style={styles.searchBtn}>
          <Ionicons name="search" size={15} color="rgba(255,255,255,0.6)" />
        </TouchableOpacity>
      ),
    });
  }, [navigation]);

  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch])
  );

  const upcoming = groups.filter((g) => g.status === "open" || g.status === "full");
  const done = groups.filter(
    (g) => g.status === "completed" || g.status === "cancelled"
  );
  const displayed = activeTab === "upcoming" ? upcoming : done;

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#1D9E75" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, activeTab === "upcoming" ? styles.tabActive : styles.tabInactive]}
          onPress={() => setActiveTab("upcoming")}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === "upcoming" ? styles.tabTextActive : styles.tabTextInactive,
            ]}
          >
            À venir
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === "done" ? styles.tabActive : styles.tabInactive]}
          onPress={() => setActiveTab("done")}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === "done" ? styles.tabTextActive : styles.tabTextInactive,
            ]}
          >
            Terminées
          </Text>
        </TouchableOpacity>
      </View>

      {displayed.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyTitle}>
            {activeTab === "upcoming" ? "Aucune rando à venir" : "Aucune rando terminée"}
          </Text>
          <Text style={styles.emptySubtitle}>
            {activeTab === "upcoming"
              ? "Rejoignez une rando depuis l'onglet Explorer\nou créez la vôtre."
              : "Vos randos terminées apparaîtront ici."}
          </Text>
        </View>
      ) : (
        <FlatList
          data={displayed}
          keyExtractor={(item) => item.hike_id}
          contentContainerStyle={styles.list}
          renderItem={({ item, index }) => (
            <GroupRow
              item={item}
              isFirst={index === 0}
              isLast={index === displayed.length - 1}
              isOnly={displayed.length === 1}
              isDone={activeTab === "done"}
            />
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  centered: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: BG },

  searchBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.08)",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 8,
  },

  tabs: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 14,
    gap: 8,
  },
  tab: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20 },
  tabActive: { backgroundColor: "#1D9E75" },
  tabInactive: { borderWidth: 0.5, borderColor: "rgba(255,255,255,0.1)" },
  tabText: { fontSize: 12 },
  tabTextActive: { color: "white", fontWeight: "500" },
  tabTextInactive: { color: "rgba(255,255,255,0.4)" },

  list: { paddingHorizontal: 16, paddingBottom: 16 },

  groupRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 13,
    paddingHorizontal: 14,
    backgroundColor: ROW_BG,
  },
  groupRowBorder: {
    borderTopWidth: 0.5,
    borderTopColor: "rgba(255,255,255,0.05)",
  },

  statusDot: { width: 7, height: 7, borderRadius: 3.5, flexShrink: 0 },
  dotUpcoming: { backgroundColor: "#1D9E75" },
  dotDone: { backgroundColor: "rgba(255,255,255,0.15)" },

  rowLeft: { flex: 1, minWidth: 0 },
  rowTitle: { fontSize: 13, fontWeight: "500", color: "rgba(255,255,255,0.55)", marginBottom: 3 },
  rowTitleUnread: { color: "white" },

  rowMeta: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 5 },
  rowMetaText: { fontSize: 11, color: "rgba(255,255,255,0.35)" },

  rowPreview: { fontSize: 11, color: "rgba(255,255,255,0.3)" },
  rowPreviewUnread: { color: "rgba(255,255,255,0.65)", fontWeight: "500" },

  membersRow: { flexDirection: "row", alignItems: "center" },
  memberAvatar: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: ROW_BG,
    justifyContent: "center",
    alignItems: "center",
  },
  memberAvatarText: { fontSize: 7, fontWeight: "500" },

  rowRight: {
    flexDirection: "column",
    alignItems: "flex-end",
    gap: 6,
    flexShrink: 0,
  },
  rowTime: { fontSize: 10, color: "rgba(255,255,255,0.25)" },
  rowTimeUnread: { color: "#E24B4A" },
  unreadBadge: {
    backgroundColor: "#E24B4A",
    borderRadius: 9,
    paddingHorizontal: 6,
    paddingVertical: 2,
    minWidth: 18,
    alignItems: "center",
  },
  unreadBadgeText: { fontSize: 10, fontWeight: "500", color: "white" },

  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "rgba(255,255,255,0.7)",
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 13,
    color: "rgba(255,255,255,0.3)",
    textAlign: "center",
    lineHeight: 20,
  },
});
