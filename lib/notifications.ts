import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { router } from "expo-router";
import { supabase } from "./supabase";

// Configure how notifications appear when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function registerForPushNotifications(userId: string): Promise<string | null> {
  if (!Device.isDevice) {
    console.log("Push notifications require a physical device.");
    return null;
  }

  // Check/request permission
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== "granted") {
    console.log("Push notification permission denied.");
    return null;
  }

  // Android channel
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "default",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
    });
  }

  // Get Expo Push Token
  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  const tokenData = await Notifications.getExpoPushTokenAsync({
    projectId,
  });
  const token = tokenData.data;

  // Save token to user profile
  await supabase
    .from("user")
    .update({ expo_push_token: token })
    .eq("id", userId);

  return token;
}

// Handle notification tap — navigate to the right screen
export function setupNotificationListeners() {
  // When user taps a notification
  const subscription = Notifications.addNotificationResponseReceivedListener(
    (response) => {
      const data = response.notification.request.content.data;

      if (data?.type === "new_message" && data?.hike_id) {
        router.push({
          pathname: "/chat/[hikeId]",
          params: { hikeId: data.hike_id as string },
        });
      } else if (data?.type === "new_match" && data?.hike_id) {
        router.push({
          pathname: "/chat/[hikeId]",
          params: { hikeId: data.hike_id as string },
        });
      } else if (data?.type === "group_full" && data?.hike_id) {
        router.push({
          pathname: "/chat/[hikeId]",
          params: { hikeId: data.hike_id as string },
        });
      } else if (data?.type === "reminder" && data?.hike_id) {
        router.push({
          pathname: "/hike/[id]",
          params: { id: data.hike_id as string },
        });
      } else if (data?.type === "rating" && data?.hike_id) {
        router.push({
          pathname: "/hike/[id]",
          params: { id: data.hike_id as string },
        });
      }
    }
  );

  return () => subscription.remove();
}
