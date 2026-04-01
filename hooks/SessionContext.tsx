import React, { createContext, useContext } from "react";
import { useSession } from "./useSession";
import type { Session } from "@supabase/supabase-js";
import type { User } from "../types";

interface SessionContextValue {
  session: Session | null;
  profile: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue>({
  session: null,
  profile: null,
  loading: true,
  signOut: async () => {},
  refreshProfile: async () => {},
});

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const value = useSession();
  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

export function useSessionContext() {
  return useContext(SessionContext);
}
