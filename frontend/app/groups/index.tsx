import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { colors, radius, shadow, spacing } from '@/src/theme';
import { makeThemedSheet } from '@/src/theme';
import { useTheme } from '@/src/theme-context';
import { api, Group } from '@/src/api';

export default function GroupsListScreen() {
  useTheme();
  const router = useRouter();
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await api.listMyGroups();
      setGroups(data);
    } catch (e: any) {
      setError(e?.message || 'Could not load your groups.');
      setGroups([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Reload when returning from create/join/detail so the list is always fresh.
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

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={styles.backBtn}
          hitSlop={8}
          testID="groups-back"
        >
          <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>Groups & Leagues</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brandPrimary} />
        }
      >
        <View style={styles.ctaRow}>
          <Pressable
            testID="groups-create-btn"
            style={({ pressed }) => [styles.ctaCard, pressed && { opacity: 0.85 }]}
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              router.push('/groups/create' as any);
            }}
          >
            <View style={[styles.ctaIcon, { backgroundColor: colors.brandPrimary }]}>
              <Ionicons name="add" size={22} color="#fff" />
            </View>
            <Text style={styles.ctaTitle}>Create a group</Text>
            <Text style={styles.ctaSub}>Private feed & season leaderboard</Text>
          </Pressable>

          <Pressable
            testID="groups-join-btn"
            style={({ pressed }) => [styles.ctaCard, pressed && { opacity: 0.85 }]}
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              router.push('/groups/join' as any);
            }}
          >
            <View style={[styles.ctaIcon, { backgroundColor: colors.brandSecondary }]}>
              <Ionicons name="enter-outline" size={22} color="#fff" />
            </View>
            <Text style={styles.ctaTitle}>Join a group</Text>
            <Text style={styles.ctaSub}>Enter an invite code</Text>
          </Pressable>
        </View>

        {error ? (
          <Text style={styles.err} testID="groups-error">{error}</Text>
        ) : null}

        {groups === null ? (
          <View style={styles.loader}>
            <ActivityIndicator color={colors.brandPrimary} size="large" />
          </View>
        ) : groups.length === 0 ? (
          <View style={styles.empty}>
            <View style={styles.emptyIcon}>
              <Ionicons name="people-circle-outline" size={36} color={colors.muted} />
            </View>
            <Text style={styles.emptyTitle}>No groups yet</Text>
            <Text style={styles.emptySub}>
              Start a private group to share rounds with friends and track a season leaderboard, or
              join one with an invite code.
            </Text>
          </View>
        ) : (
          <View style={{ gap: spacing.md }}>
            <Text style={styles.sectionLabel}>Your groups</Text>
            {groups.map((g) => (
              <Pressable
                key={g.id}
                testID={`group-row-${g.id}`}
                style={({ pressed }) => [styles.groupRow, pressed && { opacity: 0.9 }]}
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  router.push(`/groups/${g.id}` as any);
                }}
              >
                <View style={styles.groupIcon}>
                  <Ionicons name="people" size={18} color={colors.brandDeep} />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={styles.groupTitleRow}>
                    <Text style={styles.groupTitle} numberOfLines={1}>{g.name}</Text>
                    {g.is_admin ? (
                      <View style={styles.adminPill}>
                        <Ionicons name="star" size={9} color="#8B5A00" />
                        <Text style={styles.adminPillText}>Admin</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={styles.groupSub} numberOfLines={1}>
                    {g.member_count} {g.member_count === 1 ? 'member' : 'members'}
                    {g.description ? ` · ${g.description}` : ''}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.muted} />
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = makeThemedSheet((colors: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: { width: 40, height: 40, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: '800', color: colors.onSurface, textAlign: 'center' },
  scroll: { padding: spacing.lg, paddingBottom: 100, gap: spacing.lg },
  ctaRow: { flexDirection: 'row', gap: spacing.md },
  ctaCard: {
    flex: 1,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: 6,
    ...shadow.card,
  },
  ctaIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  ctaTitle: { fontSize: 15, fontWeight: '800', color: colors.onSurface },
  ctaSub: { fontSize: 11.5, color: colors.muted, lineHeight: 15 },
  sectionLabel: { fontSize: 13, fontWeight: '800', color: colors.muted, letterSpacing: 0.4, textTransform: 'uppercase' },
  loader: { paddingVertical: spacing.xxl, alignItems: 'center' },
  empty: {
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.xl,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    ...shadow.soft,
  },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceTertiary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptyTitle: { fontSize: 17, fontWeight: '800', color: colors.onSurface },
  emptySub: { fontSize: 13.5, color: colors.muted, textAlign: 'center', lineHeight: 19, maxWidth: 300 },
  err: { color: colors.error, fontSize: 13, fontWeight: '700' },
  groupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    padding: spacing.lg,
    ...shadow.card,
  },
  groupIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.brandTertiary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  groupTitle: { fontSize: 16, fontWeight: '800', color: colors.onSurface, flexShrink: 1 },
  groupSub: { fontSize: 12.5, color: colors.muted, marginTop: 2 },
  adminPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  adminPillText: { fontSize: 9.5, fontWeight: '800', color: '#8B5A00', letterSpacing: 0.2 },
}));
