import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Platform, StyleSheet, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius } from '@/src/theme';

import { makeThemedSheet } from '@/src/theme';
import { useTheme } from '@/src/theme-context';
import { emitFeedRefresh } from '@/src/utils/feedBus';
export default function TabsLayout() {
  useTheme();
  const insets = useSafeAreaInsets();
  // Base bar height (icons + labels + top padding); add the OS's bottom safe
  // inset so 3-button nav Android phones and iPhone home-indicators never
  // overlap the tab buttons.
  const baseBarHeight = 60;
  const dynamicTabBarStyle = {
    height: baseBarHeight + insets.bottom,
    paddingBottom: insets.bottom,
  };
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brandPrimary,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '700', marginBottom: 4 },
        tabBarStyle: [styles.tabBar, dynamicTabBarStyle],
        tabBarBackground: () =>
          Platform.OS === 'ios' ? (
            <BlurView intensity={70} tint="light" style={StyleSheet.absoluteFill} />
          ) : (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(255,255,255,0.96)' }]} />
          ),
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Feed',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'home' : 'home-outline'} size={22} color={color} />
          ),
          tabBarButtonTestID: 'tab-feed',
        }}
        listeners={({ navigation }) => ({
          tabPress: () => {
            // Only scroll-to-top + refresh when the Feed tab is tapped while
            // already focused on it — a fresh tap that navigates *to* the
            // tab should just land normally.
            if (navigation.isFocused()) {
              emitFeedRefresh();
            }
          },
        })}
      />
      <Tabs.Screen
        name="discover"
        options={{
          title: 'Discover',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'compass' : 'compass-outline'} size={24} color={color} />
          ),
          tabBarButtonTestID: 'tab-discover',
        }}
      />
      <Tabs.Screen
        name="log"
        options={{
          title: 'Log',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'add-circle' : 'add-circle-outline'} size={26} color={color} />
          ),
          tabBarButtonTestID: 'tab-log',
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: 'More',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'menu' : 'menu-outline'} size={24} color={color} />
          ),
          tabBarButtonTestID: 'tab-more',
        }}
      />
      {/* Profile is reachable from the feed avatar and the More menu, but is no
          longer a tab itself — hide it from the tab bar while keeping the route. */}
      <Tabs.Screen name="profile" options={{ href: null }} />
    </Tabs>
  );
}

const styles = makeThemedSheet((colors: any) => StyleSheet.create({
  tabBar: Platform.select({
    web: {
      position: 'absolute',
      borderTopWidth: 0,
      paddingTop: 6,
      backgroundColor: 'transparent',
      borderTopColor: 'transparent',
      boxShadow: '0px -4px 10px rgba(11, 58, 32, 0.06)',
    },
    default: {
      position: 'absolute',
      borderTopWidth: 0,
      paddingTop: 6,
      backgroundColor: 'transparent',
      borderTopColor: 'transparent',
      elevation: 0,
      shadowColor: '#0B3A20',
      shadowOffset: { width: 0, height: -4 },
      shadowOpacity: 0.06,
      shadowRadius: 10,
    },
  }) as any,
  logIcon: Platform.select({
    web: {
      width: 44,
      height: 44,
      borderRadius: radius.pill,
      backgroundColor: colors.brandPrimary,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: -6,
      boxShadow: '0px 6px 10px rgba(11, 58, 32, 0.22)',
    },
    default: {
      width: 44,
      height: 44,
      borderRadius: radius.pill,
      backgroundColor: colors.brandPrimary,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: -6,
      shadowColor: '#0B3A20',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.22,
      shadowRadius: 10,
      elevation: 8,
    },
  }) as any,
  logIconActive: { backgroundColor: colors.brandDeep },
}));
