import React, { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius } from '@/src/theme';
import { makeThemedSheet } from '@/src/theme';
import { useTheme } from '@/src/theme-context';
import { api } from '@/src/api';

/**
 * Chat-bubble button with an unread badge that navigates to the direct
 * message inbox. Mirrors NotificationBell's focus-driven polling so the
 * unread count stays accurate across Feed / Discover / Log / Profile.
 */
export function DMButton({ color = colors.onSurface, testID }: { color?: string; testID?: string }) {
  useTheme();
  const router = useRouter();
  const [unread, setUnread] = useState(0);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      api
        .unreadMessageCount()
        .then((res) => {
          if (active) setUnread(res?.unread_conversations || 0);
        })
        .catch(() => {});
      return () => {
        active = false;
      };
    }, []),
  );

  return (
    <Pressable
      testID={testID || 'header-messages'}
      onPress={() => router.push('/messages')}
      style={styles.dmBtn}
      hitSlop={8}
    >
      <Ionicons name="chatbubble-ellipses-outline" size={21} color={color} />
      {unread > 0 ? (
        <View style={styles.dmBadge}>
          <Text style={styles.dmBadgeText}>{unread > 9 ? '9+' : String(unread)}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = makeThemedSheet((colors: any) => StyleSheet.create({
  dmBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  dmBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    minWidth: 16,
    height: 16,
    borderRadius: radius.pill,
    backgroundColor: colors.error,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  dmBadgeText: { fontSize: 10, fontWeight: '800', color: '#fff' },
}));
