import { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import { supabase } from "../../lib/supabase";
import { useSessionContext } from "../../hooks/SessionContext";
import { getAvatarColor, getInitials } from "../../lib/chat";

interface GroupItem {
  hike_id: string;
  title: string;
  date_start: string;
  current_count: number;
  max_participants: number;
  role: string;
  creator_name: string;
}

export default function GroupsScreen() {
  const { session } = useSessionContext();
  const userId = session?.user?.id;
  const [groups, setGroups] = useState<GroupItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchGroups = useCallback(async () => {
    if (!userId) return;

    const { data } = await supabase
      .from("participation")
      .select("hike_id, role, hike:hike!hike_id(id, title, date_start, current_count, max_participants, creator_id, creator:user!creator_id(display_name))")
      .eq("user_id", userId)
      .eq("status", "confirmed")
      .order("joined_at", { ascending: false });

    if (data) {
      const items: GroupItem[] = data.map((p: any) => ({
        hike_id: p.hike_id,
        title: (p.hike as any)?.title ?? "Rando",
        date_start: (p.hike as any)?.date_start ?? "",
        current_count: (p.hike as any)?.current_count ?? 0,
        max_participants: (p.hike as any)?.max_participants ?? 0,
        role: p.role,
        creator_name: (p.hike as any)?.creator?.display_name ?? "Inconnu",
      }));
      setGroups(items);
    }
    setLoading(false);
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      fetchGroups();
    }, [fetchGroups])
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

  return (
    <View style={styles.container}>
      <FlatList
        data={groups}
        keyExtractor={(item) => item.hike_id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => {
          const color = getAvatarColor(item.hike_id);
          const d = new Date(item.date_start);
          const months = ["jan.", "fév.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
          const dateLabel = `${d.getDate()} ${months[d.getMonth()]}`;

          return (
            <TouchableOpacity
              style={styles.groupItem}
              onPress={() =>
                router.push({
                  pathname: "/chat/[hikeId]",
                  params: { hikeId: item.hike_id },
                })
              }
            >
              <View style={[styles.groupAvatar, { backgroundColor: color.bg }]}>
                <Text style={[styles.groupAvatarText, { color: color.text }]}>
                  {getInitials(item.title)}
                </Text>
              </View>
              <View style={styles.groupInfo}>
                <Text style={styles.groupName} numberOfLines={1}>
                  {item.title}
                </Text>
                <Text style={styles.groupMeta}>
                  {dateLabel} · {item.current_count}/{item.max_participants} participants
                  {item.role === "actor" ? " · Organisateur" : ""}
                </Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  centered: { flex: 1, justifyContent: "center", alignItems: "center", padding: 32 },
  list: { paddingTop: 8 },

  groupItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 0.5,
    borderBottomColor: "#e0e0e0",
    gap: 12,
  },
  groupAvatar: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  groupAvatarText: { fontSize: 14, fontWeight: "600" },
  groupInfo: { flex: 1 },
  groupName: { fontSize: 15, fontWeight: "500", color: "#1a1a1a" },
  groupMeta: { fontSize: 12, color: "#999", marginTop: 2 },
  chevron: { fontSize: 20, color: "#ccc" },

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
