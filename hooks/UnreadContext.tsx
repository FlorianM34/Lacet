import { createContext, useContext, ReactNode } from "react";
import { useUnreadCounts, GroupWithUnread } from "./useUnreadCounts";
import { useSessionContext } from "./SessionContext";

interface UnreadContextValue {
  groups: GroupWithUnread[];
  totalUnread: number;
  loading: boolean;
  refetch: () => Promise<void>;
}

const UnreadContext = createContext<UnreadContextValue>({
  groups: [],
  totalUnread: 0,
  loading: false,
  refetch: async () => {},
});

export function UnreadProvider({ children }: { children: ReactNode }) {
  const { session } = useSessionContext();
  const value = useUnreadCounts(session?.user?.id);
  return <UnreadContext.Provider value={value}>{children}</UnreadContext.Provider>;
}

export function useUnreadContext() {
  return useContext(UnreadContext);
}
