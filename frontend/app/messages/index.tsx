import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Stack, useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { colors, makeThemedSheet, radius, shadow, spacing } from '@/src/theme';
import { useTheme } from '@/src/theme-context';
import { api, Conversation } from '@/src/api';

function timeAgo(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso).getTime();
  const diffMin = Math.max(0, Math.round((Date.now() - d) / 60000));
  if (diffMin < 1) return 'now';
  if (diffMin < 60) return `${diffMin}m`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function MessagesListScreen() {
  useTheme();
  const router = useRouter();
  const [items, setItems] = useState<Conversation[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api.listConversations();
      setItems(data);
      setError(null);
    } catch (e: any) {
      setError(e?.message || 'Could not load messages.');
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const openConversation = (c: Conversation) => {
    Haptics.selectionAsync().catch(() => {});
    router.push({
      pathname: `/messages/${c.id}` as any,
      params: {
        name: c.other_user?.display_name || 'Golfer',
        avatar: c.other_user?.avatar || '',
        otherId: c.other_user?.id || '',
      },
    });
  };

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8} testID="messages-back">
          <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>Messages</Text>
        <View style={{ width: 40 }} />
      </View>

      {items === null ? (
        <View style={styles.center}>
          {error ? <Text style={styles.err}>{error}</Text> : <ActivityIndicator color={colors.brandPrimary} size="large" />}
        </View>
      ) : items.length === 0 ? (
        <View style={styles.center}>
          <View style={styles.emptyIcon}>
            <Ionicons name="chatbubbles-outline" size={32} color={colors.muted} />
          </View>
          <Text style={styles.emptyTitle}>No conversations yet</Text>
          <Text style={styles.emptySub}>
            Visit a golfer&apos;s profile and tap Message to start chatting.
          </Text>
        </View>
      ) : (
        <FlatList
          testID="conversations-list"
          data={items}
          keyExtractor={(c) => c.id}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brandPrimary} />}
          renderItem={({ item }) => {
            const other = item.other_user;
            const initials = (other?.display_name || 'G')
              .split(' ')
              .map((s: string) => s[0])
              .slice(0, 2)
              .join('')
              .toUpperCase();
            return (
              <Pressable
                testID={`conversation-row-${item.id}`}
                style={styles.row}
                onPress={() => openConversation(item)}
              >
                {other?.avatar ? (
                  <Image source={{ uri: other.avatar }} style={styles.avatar} />
                ) : (
                  <View style={styles.avatarFallback}>
                    <Text style={styles.avatarInitials}>{initials}</Text>
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.name} numberOfLines={1}>
                    {other?.display_name || 'Golfer'}
                  </Text>
                  <Text style={[styles.preview, item.unread && styles.previewUnread]} numberOfLines={1}>
                    {item.last_message_text || 'Say hello 👋'}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 6 }}>
                  <Text style={styles.time}>{timeAgo(item.last_message_at)}</Text>
                  {item.unread ? <View style={styles.unreadDot} /> : null}
                </View>
              </Pressable>
            );
          }}
        />
      )}
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
    headerTitle: { flex: 1, fontSize: 18, fontWeight: '800', color: c.onSurface, textAlign: 'center' },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.sm },
    err: { color: c.error, fontSize: 13, fontWeight: '700', textAlign: 'center' },
    emptyIcon: {
      width: 72,
      height: 72,
      borderRadius: radius.pill,
      backgroundColor: c.surfaceSecondary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emptyTitle: { fontSize: 18, fontWeight: '800', color: c.onSurface },
    emptySub: { fontSize: 14, color: c.muted, textAlign: 'center', maxWidth: 280 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      padding: spacing.md,
      backgroundColor: c.surfaceSecondary,
      borderRadius: radius.lg,
      marginBottom: spacing.sm,
      ...shadow.soft,
    },
    avatar: { width: 48, height: 48, borderRadius: radius.pill },
    avatarFallback: {
      width: 48,
      height: 48,
      borderRadius: radius.pill,
      backgroundColor: c.brandTertiary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarInitials: { fontSize: 15, fontWeight: '800', color: c.brandDeep },
    name: { fontSize: 15, fontWeight: '800', color: c.onSurface },
    preview: { fontSize: 13, color: c.muted, marginTop: 2 },
    previewUnread: { color: c.onSurface, fontWeight: '700' },
    time: { fontSize: 11, color: c.muted, fontWeight: '600' },
    unreadDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: c.brandPrimary },
  }),
);
