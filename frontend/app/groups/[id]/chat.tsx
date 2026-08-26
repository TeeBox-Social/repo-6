import React, { useCallback } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing } from '@/src/theme';
import { makeThemedSheet } from '@/src/theme';
import { useTheme } from '@/src/theme-context';
import { api } from '@/src/api';
import { useAuth } from '@/src/auth-context';
import { ChatThread } from '@/src/components/ChatThread';

export default function GroupChatScreen() {
  useTheme();
  const router = useRouter();
  const { user } = useAuth();
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const groupId = String(id);

  const fetchMessages = useCallback((before?: string) => api.groupChatMessages(groupId, before), [groupId]);
  const sendMessage = useCallback((text: string) => api.sendGroupChatMessage(groupId, text), [groupId]);
  const reactToMessage = useCallback(
    (messageId: string, emoji: string) => api.reactGroupChatMessage(groupId, messageId, emoji),
    [groupId],
  );
  const markRead = useCallback(() => {
    api.markGroupChatRead(groupId).catch(() => {});
  }, [groupId]);

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8} testID="group-chat-back">
          <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {name || 'Group chat'}
          </Text>
          <Text style={styles.headerSub}>Group chat</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      {user ? (
        <ChatThread
          currentUserId={user.id}
          threadType="group"
          fetchMessages={fetchMessages}
          sendMessage={sendMessage}
          reactToMessage={reactToMessage}
          markRead={markRead}
          showSenderNames
          emptyTitle="No messages yet"
          emptySub="Break the ice — plan your next round or talk trash about last week's scores."
          placeholder="Message the group…"
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
    headerTitle: { fontSize: 16, fontWeight: '800', color: c.onSurface, textAlign: 'center' },
    headerSub: { fontSize: 11, color: c.muted, fontWeight: '600', textAlign: 'center', marginTop: 1 },
  }),
);
