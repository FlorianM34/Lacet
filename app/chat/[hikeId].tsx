import { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { supabase } from "../../lib/supabase";
import { useSessionContext } from "../../hooks/SessionContext";
import MessageBubble from "../../components/MessageBubble";
import RdvModal from "../../components/RdvModal";
import {
  getAvatarColor,
  getInitials,
  formatDateSeparator,
  createRdvContent,
} from "../../lib/chat";
import type { Hike, User } from "../../types";

interface ChatMessage {
  id: string;
  hike_id: string;
  sender_id: string;
  content: string;
  sent_at: string;
  sender_name?: string;
  isSystem?: boolean;
}

interface Member {
  id: string;
  display_name: string;
  role: string;
}

export default function ChatScreen() {
  const { hikeId } = useLocalSearchParams<{ hikeId: string }>();
  const { session } = useSessionContext();
  const userId = session?.user?.id;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [hike, setHike] = useState<Hike | null>(null);
  const [creatorId, setCreatorId] = useState<string | null>(null);
  const [inputText, setInputText] = useState("");
  const [loading, setLoading] = useState(true);
  const [showRdv, setShowRdv] = useState(false);

  const flatListRef = useRef<FlatList>(null);
  const membersMapRef = useRef<Map<string, string>>(new Map());

  // ── Load hike info ──
  useEffect(() => {
    if (!hikeId) return;

    (async () => {
      const { data } = await supabase
        .from("hike")
        .select("*")
        .eq("id", hikeId)
        .single();
      if (data) {
        setHike(data as Hike);
        setCreatorId(data.creator_id);
      }
    })();
  }, [hikeId]);

  // ── Load members ──
  useEffect(() => {
    if (!hikeId) return;

    (async () => {
      const { data } = await supabase
        .from("participation")
        .select("user_id, role, user:user!user_id(id, display_name)")
        .eq("hike_id", hikeId)
        .eq("status", "confirmed");

      if (data) {
        const m = data.map((p: any) => ({
          id: p.user_id,
          display_name: (p.user as any)?.display_name ?? "Inconnu",
          role: p.role,
        }));
        setMembers(m);
        const map = new Map<string, string>();
        m.forEach((member: Member) => map.set(member.id, member.display_name));
        membersMapRef.current = map;
      }
    })();
  }, [hikeId]);

  // ── Load existing messages ──
  useEffect(() => {
    if (!hikeId) return;

    (async () => {
      const { data, error } = await supabase
        .from("group_message")
        .select("*, sender:user!sender_id(display_name)")
        .eq("hike_id", hikeId)
        .order("sent_at", { ascending: true });

      if (error) {
        Alert.alert("Erreur", "Impossible de charger les messages.");
        setLoading(false);
        return;
      }

      const msgs: ChatMessage[] = (data ?? []).map((m: any) => ({
        id: m.id,
        hike_id: m.hike_id,
        sender_id: m.sender_id,
        content: m.content,
        sent_at: m.sent_at,
        sender_name: (m.sender as any)?.display_name ?? "Inconnu",
      }));

      setMessages(msgs);
      setLoading(false);
    })();
  }, [hikeId]);

  // ── Realtime subscription ──
  useEffect(() => {
    if (!hikeId) return;

    const channel = supabase
      .channel(`group-chat:${hikeId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "group_message",
          filter: `hike_id=eq.${hikeId}`,
        },
        (payload) => {
          const newMsg = payload.new as any;
          // Skip if we already have this message (optimistic update)
          setMessages((prev) => {
            if (prev.some((m) => m.id === newMsg.id)) return prev;
            return [
              ...prev,
              {
                id: newMsg.id,
                hike_id: newMsg.hike_id,
                sender_id: newMsg.sender_id,
                content: newMsg.content,
                sent_at: newMsg.sent_at,
                sender_name:
                  membersMapRef.current.get(newMsg.sender_id) ?? "Inconnu",
              },
            ];
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [hikeId]);

  // ── Send message ──
  const handleSend = useCallback(async () => {
    const text = inputText.trim();
    if (!text || !userId || !hikeId) return;

    setInputText("");
    await sendMessage(text);
  }, [inputText, userId, hikeId]);

  const sendMessage = async (content: string) => {
    if (!userId || !hikeId) return;

    const tempId = `temp-${Date.now()}`;
    const now = new Date().toISOString();

    // Optimistic update
    setMessages((prev) => [
      ...prev,
      {
        id: tempId,
        hike_id: hikeId,
        sender_id: userId,
        content,
        sent_at: now,
        sender_name: "Toi",
      },
    ]);

    const { data, error } = await supabase
      .from("group_message")
      .insert({
        hike_id: hikeId,
        sender_id: userId,
        content,
      })
      .select("id")
      .single();

    if (error) {
      // Remove optimistic message on failure
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      Alert.alert("Erreur", "Impossible d'envoyer le message.");
      return;
    }

    // Replace temp id with real id
    if (data) {
      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? { ...m, id: data.id } : m))
      );
    }
  };

  // ── Send RDV card ──
  const handleSendRdv = (location: string, datetime: string) => {
    sendMessage(createRdvContent(location, datetime));
  };

  // ── Build display data with date separators ──
  const buildDisplayItems = (): (ChatMessage & { showDateSep?: string })[] => {
    const items: (ChatMessage & { showDateSep?: string })[] = [];
    let lastDate = "";

    for (const msg of messages) {
      const msgDate = new Date(msg.sent_at).toDateString();
      if (msgDate !== lastDate) {
        items.push({
          ...msg,
          id: `sep-${msg.id}`,
          showDateSep: formatDateSeparator(msg.sent_at),
          isSystem: true,
          content: formatDateSeparator(msg.sent_at),
        });
        lastDate = msgDate;
      }
      items.push(msg);
    }
    return items;
  };

  const displayItems = buildDisplayItems();

  const isActor = creatorId === userId;
  const placesLeft = hike ? hike.max_participants - hike.current_count : 0;

  const levelLabels: Record<string, string> = {
    easy: "Facile",
    intermediate: "Intermédiaire",
    hard: "Difficile",
    expert: "Expert",
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#1D9E75" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={90}
    >
      {/* Hike banner */}
      {hike && (
        <View style={styles.bannerWrapper}>
          <TouchableOpacity
            style={styles.banner}
            onPress={() => router.push({ pathname: "/hike/[id]", params: { id: hike.id } })}
          >
            <View style={styles.bannerIcon}>
              <Text style={styles.bannerIconText}>🏔️</Text>
            </View>
            <View style={styles.bannerContent}>
              <Text style={styles.bannerTitle} numberOfLines={1}>
                Voir l'itinéraire
              </Text>
              <Text style={styles.bannerSub}>
                {hike.distance_km} km · {hike.elevation_m} m · {levelLabels[hike.level] ?? hike.level}
              </Text>
            </View>
            <Text style={styles.bannerChevron}>›</Text>
          </TouchableOpacity>
          {hike.status === "cancelled" && (
            <View style={styles.cancelledNotice}>
              <Text style={styles.cancelledNoticeText}>
                ⚠️  Cette randonnée a été annulée par l'organisateur.
              </Text>
            </View>
          )}
        </View>
      )}

      {/* Members row */}
      <View style={styles.membersRow}>
        {members.slice(0, 6).map((m) => {
          const color = getAvatarColor(m.id);
          return (
            <TouchableOpacity
              key={m.id}
              style={[styles.memberAvatar, { backgroundColor: color.bg }]}
              onPress={() => router.push({ pathname: "/profile/[userId]", params: { userId: m.id } })}
            >
              <Text style={[styles.memberAvatarText, { color: color.text }]}>
                {getInitials(m.display_name)}
              </Text>
            </TouchableOpacity>
          );
        })}
        <Text style={styles.membersLabel}>
          {members.length} membres
          {placesLeft <= 0 ? " · Groupe complet" : ` · ${placesLeft} place${placesLeft > 1 ? "s" : ""} restante${placesLeft > 1 ? "s" : ""}`}
        </Text>
      </View>

      {/* Messages */}
      <FlatList
        ref={flatListRef}
        data={displayItems}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.messagesList}
        onContentSizeChange={() =>
          flatListRef.current?.scrollToEnd({ animated: false })
        }
        renderItem={({ item }) => {
          if (item.showDateSep) {
            return (
              <View style={styles.dateSepRow}>
                <Text style={styles.dateSepText}>{item.showDateSep}</Text>
              </View>
            );
          }

          return (
            <MessageBubble
              content={item.content}
              senderName={item.sender_name ?? "Inconnu"}
              senderId={item.sender_id}
              sentAt={item.sent_at}
              isMine={item.sender_id === userId}
              isSystem={item.isSystem}
            />
          );
        }}
      />

      {/* Input bar */}
      <View style={styles.inputBar}>
        {isActor && (
          <TouchableOpacity
            style={styles.attachBtn}
            onPress={() => setShowRdv(true)}
          >
            <Text style={styles.attachIcon}>+</Text>
          </TouchableOpacity>
        )}
        <TextInput
          style={styles.msgInput}
          value={inputText}
          onChangeText={setInputText}
          placeholder="Message…"
          placeholderTextColor="#999"
          returnKeyType="send"
          onSubmitEditing={handleSend}
        />
        <TouchableOpacity style={styles.sendBtn} onPress={handleSend}>
          <Text style={styles.sendIcon}>➤</Text>
        </TouchableOpacity>
      </View>

      {/* RDV modal */}
      <RdvModal
        visible={showRdv}
        onSend={handleSendRdv}
        onClose={() => setShowRdv(false)}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },

  // Banner
  bannerWrapper: { marginHorizontal: 14, marginTop: 10 },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#E1F5EE",
    borderWidth: 0.5,
    borderColor: "#9FE1CB",
    borderRadius: 10,
    borderBottomLeftRadius: 10,
    borderBottomRightRadius: 10,
    padding: 10,
  },
  cancelledNotice: {
    backgroundColor: "#FFF5F5",
    borderWidth: 0.5,
    borderTopWidth: 0,
    borderColor: "#F4A8A8",
    borderBottomLeftRadius: 10,
    borderBottomRightRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  cancelledNoticeText: { fontSize: 12, color: "#A32D2D" },
  bannerIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: "#1D9E75",
    justifyContent: "center",
    alignItems: "center",
  },
  bannerIconText: { fontSize: 14 },
  bannerContent: { flex: 1 },
  bannerTitle: { fontSize: 12, fontWeight: "500", color: "#085041" },
  bannerSub: { fontSize: 11, color: "#0F6E56", marginTop: 1 },
  bannerChevron: { fontSize: 18, color: "#1D9E75" },

  // Members
  membersRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: "#e0e0e0",
  },
  memberAvatar: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: "#fff",
    justifyContent: "center",
    alignItems: "center",
    marginLeft: -6,
  },
  memberAvatarText: { fontSize: 10, fontWeight: "500" },
  membersLabel: { fontSize: 11, color: "#999", marginLeft: 10 },

  // Messages
  messagesList: { padding: 14, paddingBottom: 8 },
  dateSepRow: { alignItems: "center", marginVertical: 8 },
  dateSepText: { fontSize: 10, color: "#999" },

  // Input bar
  inputBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: 0.5,
    borderTopColor: "#e0e0e0",
  },
  attachBtn: { padding: 4 },
  attachIcon: { fontSize: 22, color: "#999", fontWeight: "300" },
  msgInput: {
    flex: 1,
    backgroundColor: "#f5f5f5",
    borderWidth: 0.5,
    borderColor: "#e0e0e0",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    fontSize: 13,
    color: "#1a1a1a",
  },
  sendBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#1D9E75",
    justifyContent: "center",
    alignItems: "center",
  },
  sendIcon: { fontSize: 14, color: "#fff" },
});
