import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useUnreadContext } from "../../hooks/UnreadContext";

type IoniconsName = React.ComponentProps<typeof Ionicons>["name"];

function tabIcon(focused: boolean, icon: IoniconsName, iconOutline: IoniconsName) {
  return <Ionicons name={focused ? icon : iconOutline} size={24} color={focused ? "#1D9E75" : "#9A9A9A"} />;
}

export default function TabsLayout() {
  const { totalUnread } = useUnreadContext();

  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        tabBarActiveTintColor: "#1D9E75",
        tabBarInactiveTintColor: "#9A9A9A",
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Explorer",
          tabBarIcon: ({ focused }) => tabIcon(focused, "compass", "compass-outline"),
        }}
      />
      <Tabs.Screen
        name="groups"
        options={{
          title: "Groupes",
          tabBarIcon: ({ focused }) => tabIcon(focused, "people", "people-outline"),
          tabBarBadge: totalUnread > 0 ? (totalUnread > 9 ? "9+" : totalUnread) : undefined,
          tabBarBadgeStyle: { backgroundColor: "#E53935", fontSize: 10, minWidth: 16, height: 16 },
        }}
      />
      <Tabs.Screen
        name="create"
        options={{
          title: "Créer",
          tabBarIcon: ({ focused }) => tabIcon(focused, "add-circle", "add-circle-outline"),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profil",
          tabBarIcon: ({ focused }) => tabIcon(focused, "person", "person-outline"),
        }}
      />
    </Tabs>
  );
}
