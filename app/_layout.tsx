import { useEffect } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import { SessionProvider, useSessionContext } from "../hooks/SessionContext";
import { UnreadProvider } from "../hooks/UnreadContext";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import {
  registerForPushNotifications,
  setupNotificationListeners,
} from "../lib/notifications";

function RootNavigator() {
  const { session, profile, loading } = useSessionContext();
  const segments = useSegments();
  const router = useRouter();

  // Auth redirection
  useEffect(() => {
    if (loading) return;

    const inAuthGroup = segments[0] === "(auth)";

    if (!session) {
      if (!inAuthGroup) {
        router.replace("/(auth)/phone");
      }
    } else if (!profile) {
      if ((segments as string[])[1] !== "onboarding") {
        router.replace("/(auth)/onboarding");
      }
    } else {
      if (inAuthGroup) {
        router.replace("/(tabs)");
      }
    }
  }, [session, profile, loading, segments]);

  // Register push token when user is authenticated with a profile
  useEffect(() => {
    if (!session?.user?.id || !profile) return;
    registerForPushNotifications(session.user.id);
  }, [session?.user?.id, profile]);

  // Listen for notification taps
  useEffect(() => {
    const cleanup = setupNotificationListeners();
    return cleanup;
  }, []);

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#2E7D32" />
      </View>
    );
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        headerBackTitle: "Retour",
        headerStyle: { backgroundColor: "#0f1f14" },
        headerTintColor: "white",
        headerTitleStyle: { color: "white", fontWeight: "500" },
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="(auth)" />
      <Stack.Screen
        name="hike/[id]"
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="chat/[hikeId]"
        options={{ headerShown: true, title: "Chat" }}
      />
      <Stack.Screen
        name="profile/edit"
        options={{ headerShown: true, title: "Modifier mon profil" }}
      />
      <Stack.Screen
        name="profile/[userId]"
        options={{ headerShown: true, title: "Profil" }}
      />
      <Stack.Screen
        name="settings"
        options={{ headerShown: true, title: "Paramètres" }}
      />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SessionProvider>
      <UnreadProvider>
        <RootNavigator />
      </UnreadProvider>
    </SessionProvider>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#0f1f14" },
});
