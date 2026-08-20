import React, { useCallback } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing } from '@/src/theme';
import { makeThemedSheet } from '@/src/theme';
import { useTheme } from '@/src/theme-context';
import { api } from '@/src/api';
import { useAuth } from '@/src/auth-context';
import { ChatThread } from '@/src/components/ChatThread';

export default function DirectMessageScreen() {
  useTheme();
  const router = useRouter();
  const { user } = useAuth();
  const { id, name, avatar, otherId } = useLocalSearchParams<{
    id: string;
    name?: string;
    avatar?: string;
    otherId?: string;
  }>();
  const conversationId = String(id);

  const fetchMessages = useCallback(
    (before?: string) => api.getMessages(conversationId, before),
    [conversationId],
  );
  const sendMessage = useCallback((text: string) => api.sendMessage(conversationId, text), [conversationId]);
  const markRead = useCallback(() => {
    api.markConversationRead(conversationId).catch(() => {});
  }, [conversationId]);

  const initials = (name || 'Golfer')
    .split(' ')
    .map((s: string) => s[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8} testID="dm-back">
          <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
        </Pressable>
        <Pressable
          style={styles.headerIdentity}
          onPress={() => otherId && router.push(`/user/${otherId}` as any)}
          disabled={!otherId}
        >
          {avatar ? (
            <Image source={{ uri: avatar }} style={styles.headerAvatar} />
          ) : (
            <View style={styles.headerAvatarFallback}>
              <Text style={styles.headerAvatarInitials}>{initials}</Text>
            </View>
          )}
          <Text style={styles.headerTitle} numberOfLines={1}>
            {name || 'Golfer'}
          </Text>
        </Pressable>
        <View style={{ width: 40 }} />
      </View>

      {user ? (
        <ChatThread
          currentUserId={user.id}
          threadType="dm"
          fetchMessages={fetchMessages}
          sendMessage={sendMessage}
          markRead={markRead}
          showSenderNames={false}
          emptyTitle="Say hello 👋"
          emptySub={`Send ${name || 'them'} a message to plan your next tee time.`}
          placeholder="Message…"
        />
      ) : null}
    </SafeAreaView>
  );
}

const styles = makeThemedSheet((c: any) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.surface },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    backBtn: { width: 40, height: 40, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
    headerIdentity: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, justifyContent: 'center' },
    headerAvatar: { width: 30, height: 30, borderRadius: radius.pill },
    headerAvatarFallback: {
      width: 30,
      height: 30,
      borderRadius: radius.pill,
      backgroundColor: c.brandTertiary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerAvatarInitials: { fontSize: 12, fontWeight: '800', color: c.brandDeep },
    headerTitle: { fontSize: 16, fontWeight: '800', color: c.onSurface, flexShrink: 1 },
  }),
);
