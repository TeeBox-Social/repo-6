import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Share,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Stack, useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import { colors, radius, shadow, spacing } from '@/src/theme';
import { makeThemedSheet } from '@/src/theme';
import { useTheme } from '@/src/theme-context';
import { api, Group } from '@/src/api';
import { RoundCard } from '@/src/components/RoundCard';
import { useAuth } from '@/src/auth-context';

type TabKey = 'feed' | 'leaderboard' | 'members';

const TABS: { key: TabKey; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'feed', label: 'Feed', icon: 'newspaper-outline' },
  { key: 'leaderboard', label: 'Leaderboard', icon: 'trophy-outline' },
  { key: 'members', label: 'Members', icon: 'people-outline' },
];

export default function GroupDetailScreen() {
  useTheme();
  const router = useRouter();
  const { user } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const groupId = String(id);

  const [group, setGroup] = useState<Group | null>(null);
  const [tab, setTab] = useState<TabKey>('feed');
  const [feed, setFeed] = useState<any[] | null>(null);
  const [leaderboard, setLeaderboard] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadGroup = useCallback(async () => {
    try {
      const g = await api.getGroup(groupId);
      setGroup(g);
    } catch (e: any) {
      setError(e?.message || 'Could not load this group.');
    }
  }, [groupId]);

  const loadTab = useCallback(async (key: TabKey) => {
    try {
      if (key === 'feed') {
        const data = await api.groupFeed(groupId);
        setFeed(data);
      } else if (key === 'leaderboard') {
        const data = await api.groupLeaderboard(groupId);
        setLeaderboard(data);
      }
    } catch (e: any) {
      setError(e?.message || 'Failed to load.');
    }
  }, [groupId]);

  useEffect(() => {
    loadGroup();
    loadTab('feed');
  }, [loadGroup, loadTab]);

  useFocusEffect(
    useCallback(() => {
      loadGroup();
    }, [loadGroup]),
  );

  const onSwitchTab = (key: TabKey) => {
    Haptics.selectionAsync().catch(() => {});
    setTab(key);
    if (key === 'feed' && feed === null) loadTab('feed');
    if (key === 'leaderboard' && leaderboard === null) loadTab('leaderboard');
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadGroup(), loadTab(tab)]);
    setRefreshing(false);
  };

  const shareInvite = async () => {
    if (!group) return;
    const message = `Join "${group.name}" on TeeBox — use invite code ${group.invite_code}`;
    try {
      if (Platform.OS === 'web') {
        await Clipboard.setStringAsync(group.invite_code);
        Alert.alert('Invite code copied', `Share this code with friends: ${group.invite_code}`);
      } else {
        await Share.share({ message });
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch {
      // user cancelled — fine.
    }
  };

  const copyInvite = async () => {
    if (!group) return;
    await Clipboard.setStringAsync(group.invite_code);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    Alert.alert('Copied', `Invite code ${group.invite_code} copied to clipboard.`);
  };

  const confirmLeave = () => {
    if (!group) return;
    Alert.alert(
      'Leave group?',
      `You'll stop seeing the shared feed for "${group.name}".`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.leaveGroup(group.id);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
              router.replace('/groups' as any);
            } catch (e: any) {
              Alert.alert('Could not leave', e?.message || 'Try again.');
            }
          },
        },
      ],
    );
  };

  const confirmDelete = () => {
    if (!group) return;
    Alert.alert(
      'Delete group?',
      `Permanently delete "${group.name}" for everyone. This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.deleteGroup(group.id);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
              router.replace('/groups' as any);
            } catch (e: any) {
              Alert.alert('Could not delete', e?.message || 'Try again.');
            }
          },
        },
      ],
    );
  };

  const removeMember = (memberId: string, name: string) => {
    Alert.alert(
      'Remove member?',
      `Remove ${name} from "${group?.name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.removeGroupMember(groupId, memberId);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
              loadGroup();
            } catch (e: any) {
              Alert.alert('Could not remove', e?.message || 'Try again.');
            }
          },
        },
      ],
    );
  };

  if (!group) {
    return (
      <SafeAreaView edges={['top']} style={styles.container}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
            <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
          </Pressable>
          <Text style={styles.headerTitle}>Group</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.loader}>
          {error ? (
            <Text style={styles.err}>{error}</Text>
          ) : (
            <ActivityIndicator color={colors.brandPrimary} size="large" />
          )}
        </View>
      </SafeAreaView>
    );
  }

  const canAddMembers = group.is_admin || group.member_add_policy === 'any';

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8} testID="group-detail-back">
          <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>{group.name}</Text>
        <Pressable
          onPress={group.is_admin ? confirmDelete : confirmLeave}
          style={styles.backBtn}
          hitSlop={8}
          testID="group-detail-menu"
        >
          <Ionicons
            name={group.is_admin ? 'trash-outline' : 'exit-outline'}
            size={20}
            color={colors.error}
          />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brandPrimary} />}
        stickyHeaderIndices={[1]}
      >
        {/* Hero + invite */}
        <View style={styles.hero}>
          <View style={styles.heroTop}>
            <View style={styles.heroIcon}>
              <Ionicons name="people" size={22} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.heroTitle} numberOfLines={2}>{group.name}</Text>
              {group.description ? (
                <Text style={styles.heroSub} numberOfLines={3}>{group.description}</Text>
              ) : null}
              <Text style={styles.heroMeta}>
                {group.member_count}/{group.max_members} members · {group.is_admin ? 'You are admin' : group.member_add_policy === 'any' ? 'Any member can invite' : 'Admin invites only'}
              </Text>
            </View>
          </View>

          <View style={styles.inviteBox}>
            <View style={{ flex: 1 }}>
              <Text style={styles.inviteLabel}>Invite code</Text>
              <Text style={styles.inviteCode} selectable>{group.invite_code}</Text>
            </View>
            <Pressable onPress={copyInvite} style={styles.iconBtn} testID="group-copy-invite" hitSlop={8}>
              <Ionicons name="copy-outline" size={18} color={colors.brandDeep} />
            </Pressable>
            <Pressable onPress={shareInvite} style={[styles.iconBtn, styles.iconBtnPrimary]} testID="group-share-invite" hitSlop={8}>
              <Ionicons name="share-social-outline" size={18} color="#fff" />
            </Pressable>
          </View>
        </View>

        {/* Sticky tab bar */}
        <View style={styles.tabWrap}>
          <View style={styles.tabRow}>
            {TABS.map((t) => {
              const active = tab === t.key;
              return (
                <Pressable
                  key={t.key}
                  testID={`group-tab-${t.key}`}
                  onPress={() => onSwitchTab(t.key)}
                  style={[styles.tabBtn, active && styles.tabBtnActive]}
                >
                  <Ionicons name={t.icon} size={14} color={active ? '#fff' : colors.onSurface} />
                  <Text style={[styles.tabText, active && styles.tabTextActive]}>{t.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Tab content */}
        {tab === 'feed' ? (
          <View style={styles.tabBody}>
            {feed === null ? (
              <ActivityIndicator color={colors.brandPrimary} style={{ marginTop: spacing.xl }} />
            ) : feed.length === 0 ? (
              <View style={styles.empty}>
                <View style={styles.emptyIcon}>
                  <Ionicons name="newspaper-outline" size={32} color={colors.muted} />
                </View>
                <Text style={styles.emptyTitle}>No posts yet</Text>
                <Text style={styles.emptySub}>
                  Rounds and posts from group members will show up here. Log a round to kick things off.
                </Text>
              </View>
            ) : (
              <View style={{ gap: spacing.md, paddingHorizontal: spacing.lg }}>
                {feed.map((r) => (
                  <RoundCard
                    key={r.id}
                    round={r}
                    onLike={() => loadTab('feed')}
                    onDeleted={() => loadTab('feed')}
                  />
                ))}
              </View>
            )}
          </View>
        ) : tab === 'leaderboard' ? (
          <View style={styles.tabBody}>
            {leaderboard === null ? (
              <ActivityIndicator color={colors.brandPrimary} style={{ marginTop: spacing.xl }} />
            ) : (
              <>
                <View style={styles.seasonHeader}>
                  <Ionicons name="calendar-outline" size={14} color={colors.muted} />
                  <Text style={styles.seasonText}>Season · {leaderboard.season}</Text>
                </View>
                {leaderboard.entries.length === 0 ? (
                  <View style={styles.empty}>
                    <Text style={styles.emptyTitle}>No scores yet</Text>
                    <Text style={styles.emptySub}>Log an 18- or 9-hole round with a score to appear on the leaderboard.</Text>
                  </View>
                ) : (
                  <View style={{ paddingHorizontal: spacing.lg, gap: spacing.sm }}>
                    {leaderboard.entries.map((e: any) => (
                      <View key={e.id} style={styles.lbRow} testID={`lb-row-${e.id}`}>
                        <View style={[styles.rankBadge, rankStyle(e.rank)]}>
                          <Text style={[styles.rankText, rankStyle(e.rank).text]}>
                            {e.rank ? `#${e.rank}` : '—'}
                          </Text>
                        </View>
                        {e.avatar ? (
                          <Image source={{ uri: e.avatar }} style={styles.lbAvatar} />
                        ) : (
                          <View style={styles.lbAvatarFallback}>
                            <Text style={styles.lbAvatarInitials}>
                              {(e.display_name || 'G').split(' ').map((s: string) => s[0]).slice(0, 2).join('').toUpperCase()}
                            </Text>
                          </View>
                        )}
                        <View style={{ flex: 1 }}>
                          <Text style={styles.lbName} numberOfLines={1}>{e.display_name}</Text>
                          <Text style={styles.lbSub}>
                            {e.round_count > 0
                              ? `${e.round_count} ${e.round_count === 1 ? 'round' : 'rounds'} · best ${e.best_score}`
                              : 'No rounds this season'}
                          </Text>
                        </View>
                        <View style={styles.lbScoreBox}>
                          <Text style={styles.lbScore}>{e.avg_score != null ? e.avg_score : '—'}</Text>
                          <Text style={styles.lbScoreLabel}>avg</Text>
                        </View>
                      </View>
                    ))}
                  </View>
                )}
              </>
            )}
          </View>
        ) : (
          <View style={styles.tabBody}>
            {canAddMembers ? (
              <Pressable
                testID="group-add-members"
                style={({ pressed }) => [styles.addMembersBtn, pressed && { opacity: 0.85 }]}
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  router.push(`/groups/${groupId}/add-members` as any);
                }}
              >
                <View style={styles.addMembersIcon}>
                  <Ionicons name="person-add" size={16} color="#fff" />
                </View>
                <Text style={styles.addMembersText}>Add members</Text>
                <Ionicons name="chevron-forward" size={18} color={colors.muted} />
              </Pressable>
            ) : null}
            <View style={{ paddingHorizontal: spacing.lg, gap: spacing.sm, marginTop: spacing.md }}>
              {group.members.map((m) => {
                const isAdmin = m.id === group.admin_id;
                const isMe = user?.id === m.id;
                return (
                  <View key={m.id} style={styles.memberRow} testID={`member-row-${m.id}`}>
                    <Pressable
                      style={styles.memberInfo}
                      onPress={() => {
                        Haptics.selectionAsync().catch(() => {});
                        router.push(`/user/${m.id}` as any);
                      }}
                    >
                      {m.avatar ? (
                        <Image source={{ uri: m.avatar }} style={styles.memberAvatar} />
                      ) : (
                        <View style={styles.memberAvatarFallback}>
                          <Text style={styles.memberInitials}>
                            {(m.display_name || 'G').split(' ').map((s: string) => s[0]).slice(0, 2).join('').toUpperCase()}
                          </Text>
                        </View>
                      )}
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Text style={styles.memberName} numberOfLines={1}>
                            {m.display_name}{isMe ? ' (you)' : ''}
                          </Text>
                          {isAdmin ? (
                            <View style={styles.adminPill}>
                              <Ionicons name="star" size={9} color="#8B5A00" />
                              <Text style={styles.adminPillText}>Admin</Text>
                            </View>
                          ) : null}
                        </View>
                        {m.home_course ? (
                          <Text style={styles.memberSub} numberOfLines={1}>{m.home_course}</Text>
                        ) : null}
                      </View>
                    </Pressable>
                    {group.is_admin && !isAdmin ? (
                      <Pressable
                        onPress={() => removeMember(m.id, m.display_name)}
                        hitSlop={8}
                        style={styles.iconBtn}
                        testID={`member-remove-${m.id}`}
                      >
                        <Ionicons name="close-circle-outline" size={20} color={colors.error} />
                      </Pressable>
                    ) : null}
                  </View>
                );
              })}
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function rankStyle(rank: number | null) {
  if (rank === 1) return { backgroundColor: '#FEF3C7', text: { color: '#8B5A00' } } as any;
  if (rank === 2) return { backgroundColor: '#E5E7EB', text: { color: '#374151' } } as any;
  if (rank === 3) return { backgroundColor: '#FDE2CE', text: { color: '#7A3A0F' } } as any;
  return { backgroundColor: colors.surfaceTertiary, text: { color: colors.muted } } as any;
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
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  err: { color: colors.error, fontSize: 13, fontWeight: '700', textAlign: 'center' },
  hero: { padding: spacing.lg, gap: spacing.md },
  heroTop: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  heroIcon: {
    width: 52,
    height: 52,
    borderRadius: radius.pill,
    backgroundColor: colors.brandPrimary,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.card,
  },
  heroTitle: { fontSize: 22, fontWeight: '800', color: colors.onSurface },
  heroSub: { fontSize: 13.5, color: colors.muted, marginTop: 4, lineHeight: 18 },
  heroMeta: { fontSize: 12, color: colors.muted, marginTop: 6, fontWeight: '600' },
  inviteBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    ...shadow.soft,
  },
  inviteLabel: { fontSize: 11, color: colors.muted, fontWeight: '700', letterSpacing: 0.4, textTransform: 'uppercase' },
  inviteCode: { fontSize: 20, fontWeight: '800', color: colors.brandDeep, letterSpacing: 2, marginTop: 2 },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceTertiary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnPrimary: { backgroundColor: colors.brandPrimary },
  tabWrap: {
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tabRow: {
    flexDirection: 'row',
    gap: 6,
    backgroundColor: colors.surfaceTertiary,
    borderRadius: radius.pill,
    padding: 4,
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 8,
    borderRadius: radius.pill,
  },
  tabBtnActive: { backgroundColor: colors.brandPrimary },
  tabText: { fontSize: 12, fontWeight: '800', color: colors.onSurface },
  tabTextActive: { color: '#fff' },
  tabBody: { paddingTop: spacing.md },
  empty: {
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.xl,
    marginHorizontal: spacing.lg,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    ...shadow.soft,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceTertiary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: colors.onSurface },
  emptySub: { fontSize: 13, color: colors.muted, textAlign: 'center', lineHeight: 18, maxWidth: 300 },
  seasonHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  seasonText: { fontSize: 12, color: colors.muted, fontWeight: '700', letterSpacing: 0.3 },
  lbRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    ...shadow.soft,
  },
  rankBadge: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankText: { fontSize: 13, fontWeight: '800' },
  lbAvatar: { width: 40, height: 40, borderRadius: radius.pill },
  lbAvatarFallback: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.brandTertiary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lbAvatarInitials: { fontSize: 13, fontWeight: '800', color: colors.brandDeep },
  lbName: { fontSize: 15, fontWeight: '800', color: colors.onSurface },
  lbSub: { fontSize: 12, color: colors.muted, marginTop: 2 },
  lbScoreBox: { alignItems: 'center' },
  lbScore: { fontSize: 20, fontWeight: '800', color: colors.brandDeep },
  lbScoreLabel: { fontSize: 10, color: colors.muted, fontWeight: '700', letterSpacing: 0.4, textTransform: 'uppercase' },
  addMembersBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginHorizontal: spacing.lg,
    padding: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.brandPrimary,
  },
  addMembersIcon: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    backgroundColor: colors.brandPrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addMembersText: { flex: 1, fontSize: 14, fontWeight: '800', color: colors.onSurface },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    ...shadow.soft,
  },
  memberInfo: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  memberAvatar: { width: 40, height: 40, borderRadius: radius.pill },
  memberAvatarFallback: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.brandTertiary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberInitials: { fontSize: 13, fontWeight: '800', color: colors.brandDeep },
  memberName: { fontSize: 14.5, fontWeight: '800', color: colors.onSurface, flexShrink: 1 },
  memberSub: { fontSize: 12, color: colors.muted, marginTop: 2 },
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
