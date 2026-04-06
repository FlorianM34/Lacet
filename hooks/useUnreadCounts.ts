import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";

export interface GroupWithUnread {
  hike_id: string;
  title: string;
  date_start: string;
  status: string;
  role: string;
  creator_name: string;
  unread_count: number;
  last_message_at: string | null;
  last_message_preview: string | null;
  last_message_sender: string | null;
  current_count: number;
  max_participants: number;
  participants: Array<{ id: string; name: string }>;
}

export function useUnreadCounts(userId: string | undefined) {
  const [groups, setGroups] = useState<GroupWithUnread[]>([]);
  const [totalUnread, setTotalUnread] = useState(0);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    if (!userId) {
      setGroups([]);
      setTotalUnread(0);
      setLoading(false);
      return;
    }

    const { data: participations } = await supabase
      .from("participation")
      .select(
        "hike_id, role, hike:hike!hike_id(id, title, date_start, status, current_count, max_participants, creator_id, creator:user!creator_id(display_name))"
      )
      .eq("user_id", userId)
      .eq("status", "confirmed");

    if (!participations || participations.length === 0) {
      setGroups([]);
      setTotalUnread(0);
      setLoading(false);
      return;
    }

    const hikeIds = participations.map((p: any) => p.hike_id);

    const [readStatusResult, messagesResult, participantsResult] = await Promise.all([
      supabase
        .from("group_read_status")
        .select("hike_id, last_read_at")
        .eq("user_id", userId)
        .in("hike_id", hikeIds),
      supabase
        .from("group_message")
        .select(
          "id, hike_id, content, sent_at, sender_id, is_system, sender:user!sender_id(display_name)"
        )
        .in("hike_id", hikeIds)
        .order("sent_at", { ascending: false })
        .limit(500),
      supabase
        .from("participation")
        .select("hike_id, user_id, user:user!user_id(display_name)")
        .in("hike_id", hikeIds)
        .eq("status", "confirmed"),
    ]);

    const readStatusMap = new Map<string, string>(
      (readStatusResult.data ?? []).map((r: any) => [r.hike_id, r.last_read_at])
    );

    const participantsMap = new Map<string, Array<{ id: string; name: string }>>();
    for (const p of participantsResult.data ?? []) {
      if (!participantsMap.has(p.hike_id)) participantsMap.set(p.hike_id, []);
      const arr = participantsMap.get(p.hike_id)!;
      if (arr.length < 4) {
        arr.push({ id: p.user_id, name: (p.user as any)?.display_name ?? "" });
      }
    }

    const messagesByHike = new Map<string, any[]>();
    for (const msg of messagesResult.data ?? []) {
      if (!messagesByHike.has(msg.hike_id)) messagesByHike.set(msg.hike_id, []);
      messagesByHike.get(msg.hike_id)!.push(msg);
    }

    const groupItems: GroupWithUnread[] = participations.map((p: any) => {
      const hike = p.hike as any;
      const lastReadAt = readStatusMap.get(p.hike_id) ?? null;
      const msgs = messagesByHike.get(p.hike_id) ?? [];
      const lastMsg = msgs[0] ?? null;

      const unread_count = lastReadAt
        ? msgs.filter((m: any) => m.sent_at > lastReadAt).length
        : msgs.length;

      let last_message_preview: string | null = null;
      let last_message_sender: string | null = null;
      if (lastMsg) {
        last_message_sender =
          lastMsg.sender_id == null
            ? "Lacet"
            : (lastMsg.sender as any)?.display_name ?? "Inconnu";

        let content: string = lastMsg.content;
        try {
          const parsed = JSON.parse(content);
          if (parsed?.type === "rdv") content = "📍 Point de RDV partagé";
          else if (parsed?.type === "rating_bot") content = "⭐ La rando est terminée !";
        } catch {}
        last_message_preview = content.length > 50 ? content.slice(0, 50) + "…" : content;
      }

      return {
        hike_id: p.hike_id,
        title: hike?.title ?? "Rando",
        date_start: hike?.date_start ?? "",
        status: hike?.status ?? "open",
        role: p.role,
        creator_name: hike?.creator?.display_name ?? "Inconnu",
        unread_count,
        last_message_at: lastMsg?.sent_at ?? null,
        last_message_preview,
        last_message_sender,
        current_count: hike?.current_count ?? 0,
        max_participants: hike?.max_participants ?? 0,
        participants: participantsMap.get(p.hike_id) ?? [],
      };
    });

    groupItems.sort((a, b) => {
      if (!a.last_message_at && !b.last_message_at) return 0;
      if (!a.last_message_at) return 1;
      if (!b.last_message_at) return -1;
      return b.last_message_at.localeCompare(a.last_message_at);
    });

    const total = groupItems.reduce((sum, g) => sum + g.unread_count, 0);
    setGroups(groupItems);
    setTotalUnread(total);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`unread-counts:${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "group_message" },
        () => { refetch(); }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "group_read_status",
          filter: `user_id=eq.${userId}`,
        },
        () => { refetch(); }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, refetch]);

  return { groups, totalUnread, loading, refetch };
}
