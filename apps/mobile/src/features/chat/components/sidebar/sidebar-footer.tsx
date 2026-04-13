import { useRouter } from "expo-router";
import { ActivityIndicator, Image, Pressable, View } from "react-native";
import {
  AppIcon,
  Calendar03Icon,
  Flowchart01Icon,
  Logout01Icon,
  Notification01Icon,
  Settings02Icon,
  Wrench01Icon,
} from "@/components/icons";
import { Text } from "@/components/ui/text";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { useResponsive } from "@/lib/responsive";

const DIVIDER_COLOR = "#27272a";
const MUTED_COLOR = "#52525b";
const AVATAR_BG = "#18181b";
const AVATAR_ACCENT = "#00bbff";

export function SidebarFooter() {
  const { user, isLoading, signOut } = useAuth();
  const router = useRouter();
  const { spacing, fontSize, iconSize } = useResponsive();

  const getInitials = (name?: string) => {
    if (!name) return "U";
    const parts = name.trim().split(" ");
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
    }
    return name[0].toUpperCase();
  };

  const navItems = [
    {
      icon: Settings02Icon,
      label: "Settings",
      onPress: () => router.push("/(app)/settings"),
    },
    {
      icon: Wrench01Icon,
      label: "Integrations",
      onPress: () => router.push("/(app)/(tabs)/integrations"),
    },
    {
      icon: Flowchart01Icon,
      label: "Workflows",
      onPress: () => router.push("/(app)/(tabs)/workflows"),
    },
    {
      icon: Notification01Icon,
      label: "Notifications",
      onPress: () => router.push("/(app)/(tabs)/notifications"),
    },
    {
      icon: Calendar03Icon,
      label: "Calendar",
      onPress: () => router.push("/(app)/calendar"),
    },
  ];

  const profilePicture = user?.picture;

  if (isLoading) {
    return (
      <>
        <View style={{ height: 1, backgroundColor: DIVIDER_COLOR }} />
        <View style={{ paddingVertical: spacing.sm }}>
          <View
            style={{
              paddingVertical: spacing.lg,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <ActivityIndicator size="small" color={AVATAR_ACCENT} />
          </View>
        </View>
      </>
    );
  }

  return (
    <>
      <View style={{ height: 1, backgroundColor: DIVIDER_COLOR }} />
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          paddingHorizontal: spacing.md,
          paddingTop: spacing.sm + 2,
          paddingBottom: spacing.xs,
          gap: 2,
        }}
      >
        {navItems.map((item) => (
          <Pressable
            key={item.label}
            onPress={item.onPress}
            style={({ pressed }) => ({
              flexDirection: "row",
              alignItems: "center",
              paddingHorizontal: spacing.sm,
              paddingVertical: spacing.xs + 2,
              borderRadius: 6,
              gap: 4,
              opacity: pressed ? 0.6 : 1,
            })}
          >
            <AppIcon
              icon={item.icon}
              size={iconSize.sm - 2}
              color={MUTED_COLOR}
            />
            <Text
              style={{
                fontSize: fontSize.xs - 1,
                color: MUTED_COLOR,
              }}
            >
              {item.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <Pressable
        onPress={() => router.push("/(app)/settings")}
        style={({ pressed }) => ({
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.sm,
          gap: spacing.sm + 2,
          opacity: pressed ? 0.6 : 1,
        })}
      >
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: AVATAR_BG,
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
          }}
        >
          {profilePicture ? (
            <Image
              source={{ uri: profilePicture }}
              style={{ width: 36, height: 36 }}
            />
          ) : (
            <Text style={{ color: AVATAR_ACCENT, fontWeight: "600" }}>
              {getInitials(user?.name)}
            </Text>
          )}
        </View>
        <View style={{ flex: 1 }}>
          <Text
            style={{ fontSize: fontSize.sm, fontWeight: "600" }}
            numberOfLines={1}
          >
            {user?.name || "User"}
          </Text>
          <Text
            style={{
              fontSize: fontSize.xs - 1,
              color: MUTED_COLOR,
              textTransform: "uppercase",
              fontWeight: "600",
              letterSpacing: 1,
            }}
          >
            GAIA Free
          </Text>
        </View>
        <Pressable
          onPress={signOut}
          hitSlop={8}
          style={({ pressed }) => ({
            padding: spacing.xs + 2,
            opacity: pressed ? 0.5 : 1,
          })}
        >
          <AppIcon icon={Logout01Icon} size={iconSize.sm} color="#ef4444" />
        </Pressable>
      </Pressable>
    </>
  );
}
