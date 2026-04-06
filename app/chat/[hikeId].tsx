import { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from "react";
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
  Modal,
  Platform,
  AppState,
} from "react-native";
import { Calendar } from "react-native-calendars";
import { useLocalSearchParams, router, useNavigation } from "expo-router";
import { supabase, markAsRead } from "../../lib/supabase";
import { useSessionContext } from "../../hooks/SessionContext";
import { useUnreadContext } from "../../hooks/UnreadContext";
import MessageBubble from "../../components/MessageBubble";
import RdvModal from "../../components/RdvModal";
import RatingModal from "../../components/RatingModal";
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
  birth_date?: string | null;
  rating_count?: number;
}

export default function ChatScreen() {
  const { hikeId } = useLocalSearchParams<{ hikeId: string }>();
  const { session } = useSessionContext();
  const userId = session?.user?.id;
  const { refetch: refetchUnread } = useUnreadContext();
  const navigation = useNavigation();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [hike, setHike] = useState<Hike | null>(null);
  const [creatorId, setCreatorId] = useState<string | null>(null);
  const [inputText, setInputText] = useState("");
  const [loading, setLoading] = useState(true);
  const [showRdv, setShowRdv] = useState(false);
  const [showSetDate, setShowSetDate] = useState(false);
  const [showPlusMenu, setShowPlusMenu] = useState(false);
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [hasRated, setHasRated] = useState(false);

  const flatListRef = useRef<FlatList>(null);
  const membersMapRef = useRef<Map<string, string>>(new Map());

  useLayoutEffect(() => {
    navigation.setOptions({
      title: hike?.title ?? "",
      headerStyle: { backgroundColor: "#0f1f14" },
      headerTintColor: "white",
      headerTitleStyle: { color: "white", fontSize: 16, fontWeight: "500" },
      headerShadowVisible: false,
    });
  }, [hike?.title, navigation]);

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

  // ── Check if user has already rated ──
  useEffect(() => {
    if (!hikeId || !userId) return;
    (async () => {
      const { count } = await supabase
        .from("rating")
        .select("id", { count: "exact", head: true })
        .eq("hike_id", hikeId)
        .eq("rater_id", userId);
      setHasRated((count ?? 0) > 0);
    })();
  }, [hikeId, userId]);

  // ── Load members ──
  useEffect(() => {
    if (!hikeId) return;

    (async () => {
      const { data } = await supabase
        .from("participation")
        .select("user_id, role, user:user!user_id(id, display_name, birth_date, rating_count)")
        .eq("hike_id", hikeId)
        .eq("status", "confirmed");

      if (data) {
        const m = data.map((p: any) => ({
          id: p.user_id,
          display_name: (p.user as any)?.display_name ?? "Inconnu",
          role: p.role,
          birth_date: (p.user as any)?.birth_date ?? null,
          rating_count: (p.user as any)?.rating_count ?? 0,
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
        isSystem: m.is_system ?? false,
      }));

      setMessages(msgs);
      setLoading(false);
      markAsRead(hikeId).then(() => refetchUnread());
    })();
  }, [hikeId]);

  // ── Mark as read when app comes to foreground ──
  useEffect(() => {
    if (!hikeId) return;
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") markAsRead(hikeId).then(() => refetchUnread());
    });
    return () => sub.remove();
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
                sender_name: membersMapRef.current.get(newMsg.sender_id) ?? "Inconnu",
                isSystem: newMsg.is_system ?? false,
              },
            ];
          });
          markAsRead(hikeId!).then(() => refetchUnread());
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

  const hikeDatePassed = (() => {
    if (!hike) return false;
    if (hike.date_flexible && !hike.date_start) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const hikeDay = new Date(hike.date_start + "T00:00:00");
    return hikeDay <= today;
  })();

  const canComplete =
    isActor &&
    hike != null &&
    (hike.status === "open" || hike.status === "full") &&
    !hike.rating_triggered_at &&
    hikeDatePassed;

  const ratableMembers = members.filter((m) => m.id !== userId);

  // Show rating footer when hike is completed, user hasn't rated yet,
  // and there's no rating_bot message already in the chat (avoid duplicate)
  const hasRatingBotMessage = messages.some((m) => {
    if (!m.isSystem || m.sender_id != null) return false;
    try { return JSON.parse(m.content)?.type === "rating_bot"; } catch { return false; }
  });
  const showRatingFooter =
    hike?.status === "completed" &&
    !hasRated &&
    !hasRatingBotMessage &&
    ratableMembers.length > 0;

  const handlePlusMenu = () => setShowPlusMenu((v) => !v);

  const handleConfirmDate = async (dateStr: string) => {
    setShowSetDate(false);
    if (!hikeId) return;

    const { error } = await supabase
      .from("hike")
      .update({ date_start: dateStr, date_flexible: false })
      .eq("id", hikeId);

    if (error) {
      Alert.alert("Erreur", "Impossible de modifier la date.");
      return;
    }

    setHike((h) => h ? { ...h, date_start: dateStr, date_flexible: false } : h);

    const d = new Date(dateStr + "T00:00:00");
    const days = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
    const months = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
    const formatted = `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;

    await supabase.from("group_message").insert({
      hike_id: hikeId,
      sender_id: userId,
      content: JSON.stringify({ type: "date_set", formatted }),
      is_system: true,
    });
  };

  const handleCompleteHike = () => {
    Alert.alert(
      "Terminer la rando",
      "Confirmer la fin de la randonnée ? Les participants recevront une invitation à se noter.",
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Terminer",
          style: "destructive",
          onPress: async () => {
            const now = new Date().toISOString();
            const { error } = await supabase
              .from("hike")
              .update({ status: "completed", rating_triggered_at: now })
              .eq("id", hikeId);
            if (!error) {
              setHike((h) => h ? { ...h, status: "completed", rating_triggered_at: now } : h);
            }
            else {
              console.log(error)
            }
          },
        },
      ]
    );
  };

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
        {canComplete && (
          <TouchableOpacity style={styles.completeBtn} onPress={handleCompleteHike}>
            <Text style={styles.completeBtnText}>Terminer</Text>
          </TouchableOpacity>
        )}
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

          if (item.isSystem) {
            let parsed: any = null;
            try { parsed = JSON.parse(item.content); } catch {}

            if (parsed?.type === "date_set") {
              return (
                <View style={styles.dateSetCard}>
                  <Text style={styles.dateSetIcon}>📅</Text>
                  <Text style={styles.dateSetText}>
                    Date fixée : <Text style={styles.dateSetBold}>{parsed.formatted}</Text>
                  </Text>
                </View>
              );
            }
          }

          if (item.isSystem && item.sender_id == null) {
            let parsed: any = null;
            try { parsed = JSON.parse(item.content); } catch {}

            if (parsed?.type === "rating_bot") {
              return (
                <View style={styles.ratingCard}>
                  <View style={styles.ratingCardHeader}>
                    <View style={styles.ratingCardIcon}>
                      <Text style={styles.ratingCardIconText}>★</Text>
                    </View>
                    <View>
                      <Text style={styles.ratingCardTitle}>La rando est terminée !</Text>
                      <Text style={styles.ratingCardSub}>Lacet · message automatique</Text>
                    </View>
                  </View>
                  <View style={styles.ratingCardBody}>
                    <Text style={styles.ratingCardText}>{parsed.message}</Text>
                    <View style={styles.ratingAvatarsRow}>
                      {ratableMembers.slice(0, 5).map((m) => {
                        const color = getAvatarColor(m.id);
                        return (
                          <View key={m.id} style={[styles.ratingAvatar, { backgroundColor: color.bg }]}>
                            <Text style={[styles.ratingAvatarText, { color: color.text }]}>
                              {getInitials(m.display_name)}
                            </Text>
                          </View>
                        );
                      })}
                    </View>
                    <TouchableOpacity
                      style={[styles.ratingBtn, hasRated && styles.ratingBtnDone]}
                      onPress={() => !hasRated && setShowRatingModal(true)}
                      disabled={hasRated}
                    >
                      <Text style={styles.ratingBtnText}>
                        {hasRated ? "Notes envoyées ✓" : "Noter mes compagnons"}
                      </Text>
                    </TouchableOpacity>
                  </View>
                  <Text style={styles.ratingDisclaimer}>
                    Les notes sont révélées quand tout le groupe a répondu
                  </Text>
                </View>
              );
            }

            return (
              <View style={styles.systemCard}>
                <View style={styles.systemCardHeader}>
                  <View style={styles.systemCardIcon}>
                    <Text style={styles.systemCardIconText}>🏆</Text>
                  </View>
                  <View>
                    <Text style={styles.systemCardTitle}>Notes disponibles</Text>
                    <Text style={styles.systemCardSub}>Lacet · message automatique</Text>
                  </View>
                </View>
                <Text style={styles.systemCardText}>{item.content}</Text>
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
        ListFooterComponent={showRatingFooter ? (
          <View style={styles.ratingCard}>
            <View style={styles.ratingCardHeader}>
              <View style={styles.ratingCardIcon}>
                <Text style={styles.ratingCardIconText}>★</Text>
              </View>
              <View>
                <Text style={styles.ratingCardTitle}>La rando est terminée !</Text>
                <Text style={styles.ratingCardSub}>Lacet · message automatique</Text>
              </View>
            </View>
            <View style={styles.ratingCardBody}>
              <Text style={styles.ratingCardText}>
                Vous avez randonné ensemble. Prenez 30 secondes pour noter vos compagnons — ça aide tout le monde à mieux se connaître.
              </Text>
              <View style={styles.ratingAvatarsRow}>
                {ratableMembers.slice(0, 5).map((m) => {
                  const color = getAvatarColor(m.id);
                  return (
                    <View key={m.id} style={[styles.ratingAvatar, { backgroundColor: color.bg }]}>
                      <Text style={[styles.ratingAvatarText, { color: color.text }]}>
                        {getInitials(m.display_name)}
                      </Text>
                    </View>
                  );
                })}
              </View>
              <TouchableOpacity style={styles.ratingBtn} onPress={() => setShowRatingModal(true)}>
                <Text style={styles.ratingBtnText}>Noter mes compagnons</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.ratingDisclaimer}>
              Les notes sont révélées quand tout le groupe a répondu
            </Text>
          </View>
        ) : null}
      />

      {/* Plus menu bubble */}
      {showPlusMenu && (
        <>
          <TouchableOpacity
            style={StyleSheet.absoluteFillObject}
            activeOpacity={1}
            onPress={() => setShowPlusMenu(false)}
          />
          <View style={styles.plusMenu}>
            <TouchableOpacity
              style={styles.plusMenuItem}
              onPress={() => { setShowPlusMenu(false); setShowRdv(true); }}
            >
              <Text style={styles.plusMenuEmoji}>📍</Text>
              <Text style={styles.plusMenuLabel}>Point de RDV</Text>
            </TouchableOpacity>
            {hike?.date_flexible && (
              <>
                <View style={styles.plusMenuDivider} />
                <TouchableOpacity
                  style={styles.plusMenuItem}
                  onPress={() => { setShowPlusMenu(false); setShowSetDate(true); }}
                >
                  <Text style={styles.plusMenuEmoji}>📅</Text>
                  <Text style={styles.plusMenuLabel}>Fixer la date</Text>
                </TouchableOpacity>
              </>
            )}
            <View style={styles.plusMenuArrow} />
          </View>
        </>
      )}

      {/* Input bar */}
      <View style={styles.inputBar}>
        {isActor && (
          <TouchableOpacity
            style={[styles.attachBtn, showPlusMenu && styles.attachBtnActive]}
            onPress={handlePlusMenu}
          >
            <Text style={[styles.attachIcon, showPlusMenu && styles.attachIconActive]}>+</Text>
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

      {/* Rating modal */}
      <RatingModal
        visible={showRatingModal}
        hikeId={hikeId!}
        raterId={userId!}
        members={ratableMembers}
        onClose={() => setShowRatingModal(false)}
        onDone={() => setHasRated(true)}
      />

      {/* Set date modal */}
      <Modal visible={showSetDate} transparent animationType="slide">
        <View style={styles.dateModalOverlay}>
          <View style={styles.dateModalSheet}>
            <View style={styles.dateModalHandle} />
            <View style={styles.dateModalHeader}>
              <Text style={styles.dateModalTitle}>Fixer la date</Text>
              <TouchableOpacity onPress={() => setShowSetDate(false)}>
                <Text style={styles.dateModalCancel}>Annuler</Text>
              </TouchableOpacity>
            </View>
            <Calendar
              minDate={new Date().toISOString().split("T")[0]}
              markedDates={
                hike?.date_start && !hike.date_flexible
                  ? { [hike.date_start]: { selected: true, selectedColor: "#1D9E75" } }
                  : {}
              }
              onDayPress={(day: { dateString: string }) => handleConfirmDate(day.dateString)}
              firstDay={1}
              theme={{
                calendarBackground: "#162a1c",
                selectedDayBackgroundColor: "#1D9E75",
                selectedDayTextColor: "#fff",
                todayTextColor: "#1D9E75",
                arrowColor: "#1D9E75",
                monthTextColor: "white",
                textDayFontSize: 14,
                textMonthFontSize: 15,
                textMonthFontWeight: "600",
                textDayHeaderFontSize: 11,
                dayTextColor: "rgba(255,255,255,0.8)",
                textDisabledColor: "rgba(255,255,255,0.2)",
                textSectionTitleColor: "rgba(255,255,255,0.4)",
              }}
            />
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f1f14" },
  centered: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#0f1f14" },

  // Banner
  bannerWrapper: { marginHorizontal: 14, marginTop: 10 },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "rgba(29,158,117,0.1)",
    borderWidth: 0.5,
    borderColor: "rgba(29,158,117,0.25)",
    borderRadius: 10,
    padding: 10,
  },
  cancelledNotice: {
    backgroundColor: "rgba(226,75,74,0.08)",
    borderWidth: 0.5,
    borderTopWidth: 0,
    borderColor: "rgba(226,75,74,0.2)",
    borderBottomLeftRadius: 10,
    borderBottomRightRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  cancelledNoticeText: { fontSize: 12, color: "rgba(226,75,74,0.85)" },
  bannerIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: "rgba(29,158,117,0.2)",
    justifyContent: "center",
    alignItems: "center",
  },
  bannerIconText: { fontSize: 14 },
  bannerContent: { flex: 1 },
  bannerTitle: { fontSize: 12, fontWeight: "500", color: "rgba(255,255,255,0.8)" },
  bannerSub: { fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 1 },
  bannerChevron: { fontSize: 18, color: "rgba(29,158,117,0.7)" },

  // Members
  membersRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  memberAvatar: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: "#0f1f14",
    justifyContent: "center",
    alignItems: "center",
    marginLeft: -6,
  },
  memberAvatarText: { fontSize: 10, fontWeight: "500" },
  membersLabel: { fontSize: 11, color: "rgba(255,255,255,0.3)", marginLeft: 10, flex: 1 },
  completeBtn: {
    backgroundColor: "#1D9E75",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  completeBtnText: { fontSize: 11, fontWeight: "500", color: "#fff" },

  // Messages
  messagesList: { padding: 14, paddingBottom: 8 },
  dateSepRow: { alignItems: "center", marginVertical: 8 },
  dateSepText: { fontSize: 10, color: "rgba(255,255,255,0.25)" },

  // Revelation system card (notes révélées)
  systemCard: {
    borderWidth: 1,
    borderColor: "rgba(239,159,39,0.3)",
    borderRadius: 14,
    overflow: "hidden",
    marginVertical: 8,
  },
  systemCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(239,159,39,0.1)",
    padding: 10,
  },
  systemCardIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(239,159,39,0.2)",
    justifyContent: "center",
    alignItems: "center",
  },
  systemCardIconText: { fontSize: 13 },
  systemCardTitle: { fontSize: 12, fontWeight: "500", color: "#EF9F27" },
  systemCardSub: { fontSize: 10, color: "rgba(239,159,39,0.55)", marginTop: 1 },
  systemCardText: {
    fontSize: 12,
    color: "rgba(255,255,255,0.55)",
    lineHeight: 17,
    padding: 12,
  },

  // Rating bot card
  ratingCard: {
    borderWidth: 1,
    borderColor: "rgba(29,158,117,0.3)",
    borderRadius: 14,
    overflow: "hidden",
    marginTop: 8,
    marginBottom: 4,
  },
  ratingCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(29,158,117,0.1)",
    padding: 10,
  },
  ratingCardIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(29,158,117,0.25)",
    justifyContent: "center",
    alignItems: "center",
  },
  ratingCardIconText: { fontSize: 13, color: "#1D9E75" },
  ratingCardTitle: { fontSize: 12, fontWeight: "500", color: "rgba(255,255,255,0.85)" },
  ratingCardSub: { fontSize: 10, color: "rgba(255,255,255,0.35)", marginTop: 1 },
  ratingCardBody: { padding: 12 },
  ratingCardText: { fontSize: 12, color: "rgba(255,255,255,0.55)", lineHeight: 17, marginBottom: 10 },
  ratingAvatarsRow: { flexDirection: "row", gap: 4, marginBottom: 10 },
  ratingAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
  },
  ratingAvatarText: { fontSize: 10, fontWeight: "500" },
  ratingBtn: {
    backgroundColor: "#1D9E75",
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
  },
  ratingBtnText: { fontSize: 12, fontWeight: "500", color: "#fff" },
  ratingBtnDone: { backgroundColor: "rgba(29,158,117,0.25)" },
  ratingDisclaimer: {
    fontSize: 10,
    color: "rgba(255,255,255,0.25)",
    paddingHorizontal: 12,
    paddingBottom: 10,
  },

  // Input bar
  inputBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: 0.5,
    borderTopColor: "rgba(255,255,255,0.08)",
    backgroundColor: "#0a1510",
  },
  attachBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#162a1c",
    alignItems: "center",
    justifyContent: "center",
  },
  attachBtnActive: { backgroundColor: "#1D9E75" },
  attachIcon: { fontSize: 20, color: "rgba(255,255,255,0.45)", fontWeight: "300", lineHeight: 24 },
  attachIconActive: { color: "#fff" },

  // Plus menu bubble
  plusMenu: {
    position: "absolute",
    bottom: 62,
    left: 14,
    backgroundColor: "#162a1c",
    borderRadius: 14,
    paddingVertical: 4,
    minWidth: 180,
    borderWidth: 0.5,
    borderColor: "rgba(255,255,255,0.1)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
    zIndex: 10,
  },
  plusMenuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  plusMenuEmoji: { fontSize: 16 },
  plusMenuLabel: { fontSize: 14, color: "rgba(255,255,255,0.8)", fontWeight: "400" },
  plusMenuDivider: { height: 0.5, backgroundColor: "rgba(255,255,255,0.08)", marginHorizontal: 14 },
  plusMenuArrow: {
    position: "absolute",
    bottom: -5,
    left: 14,
    width: 10,
    height: 10,
    backgroundColor: "#162a1c",
    transform: [{ rotate: "45deg" }],
    shadowColor: "#000",
    shadowOffset: { width: 2, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
  },
  msgInput: {
    flex: 1,
    backgroundColor: "#162a1c",
    borderWidth: 0.5,
    borderColor: "rgba(255,255,255,0.1)",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    fontSize: 13,
    color: "white",
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

  // Date set message
  dateSetCard: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "center",
    gap: 6,
    backgroundColor: "rgba(33,150,243,0.08)",
    borderWidth: 0.5,
    borderColor: "rgba(33,150,243,0.25)",
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginVertical: 6,
  },
  dateSetIcon: { fontSize: 13 },
  dateSetText: { fontSize: 12, color: "rgba(100,181,246,0.9)" },
  dateSetBold: { fontWeight: "600" },

  // Set date modal
  dateModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  dateModalSheet: {
    backgroundColor: "#162a1c",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 18,
    paddingBottom: 36,
    paddingTop: 12,
  },
  dateModalHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignSelf: "center",
    marginBottom: 16,
  },
  dateModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  dateModalTitle: { fontSize: 15, fontWeight: "600", color: "white" },
  dateModalCancel: { fontSize: 14, color: "#1D9E75" },
});
