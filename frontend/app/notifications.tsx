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
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { colors, radius, shadow, spacing } from '@/src/theme';
import { makeThemedSheet } from '@/src/theme';
import { useTheme } from '@/src/theme-context';
import { api } from '@/src/api';

type Notification = {
  id: string;
  type: string;
  title: string;
  body: string;
  read: boolean;
  created_at: string;
  course_name?: string;
  reason?: string;
  round_id?: string;
  comment_id?: string;
  actor_id?: string;
  actor_name?: string;
  achievement_key?: string;
  conversation_id?: string;
  group_id?: string;
  group_name?: string;
  invite_id?: string;
  request_id?: string;
  accepted?: boolean;
  approved?: boolean;
};

function iconForType(type: string): { icon: any; color: string } {
  switch (type) {
    case 'achievement_unlocked':
      return { icon: 'trophy', color: colors.brandPrimary };
    case 'comment_like':
      return { icon: 'heart', color: colors.brandSecondary };
    case 'post_like':
      return { icon: 'heart', color: colors.brandSecondary };
    case 'post_comment':
      return { icon: 'chatbubble', color: colors.brandPrimary };
    case 'mention':
      return { icon: 'at', color: colors.brandPrimary };
    case 'follow':
      return { icon: 'person-add', color: colors.brandPrimary };
    case 'course_rejected':
      return { icon: 'alert-circle', color: '#c0392b' };
    case 'course_verified':
      return { icon: 'checkmark-done', color: colors.brandPrimary };
    case 'course_edit_approved':
      return { icon: 'checkmark-done', color: colors.brandPrimary };
    case 'course_edit_rejected':
      return { icon: 'alert-circle', color: '#c0392b' };
    case 'lfg_interest':
      return { icon: 'hand-right', color: colors.brandPrimary };
    case 'lfg_response':
      return { icon: 'people', color: colors.brandPrimary };
    case 'direct_message':
      return { icon: 'chatbubble-ellipses', color: colors.brandPrimary };
    case 'group_invite':
      return { icon: 'people-circle', color: colors.brandPrimary };
    case 'group_invite_response':
      return { icon: 'people', color: colors.brandPrimary };
    case 'group_join_request':
      return { icon: 'person-add', color: colors.brandPrimary };
    case 'group_join_response':
      return { icon: 'checkmark-done', color: colors.brandPrimary };
    default:
      return { icon: 'notifications', color: colors.brandPrimary };
  }
}

/** Where tapping a notification should take the user, based on its type. */
function resolveNotificationTarget(n: Notification): string | null {
  switch (n.type) {
    case 'post_like':
    case 'post_comment':
    case 'comment_like':
    case 'mention':
    case 'achievement_unlocked':
    case 'lfg_interest':
    case 'lfg_response':
      // Achievements are earned by a specific round, so jump straight to it.
      return n.round_id ? `/post/${n.round_id}` : null;
    case 'follow':
      return n.actor_id ? `/user/${n.actor_id}` : null;
    case 'direct_message':
      return n.conversation_id && n.actor_id
        ? `/messages/${n.conversation_id}?name=${encodeURIComponent(n.actor_name || 'Golfer')}&otherId=${n.actor_id}`
        : null;
    case 'course_verified':
      return n.course_name ? `/course/${encodeURIComponent(n.course_name)}` : null;
    case 'course_edit_approved':
    case 'course_edit_rejected':
      // Unlike a rejected new-course submission, the course itself still
      // exists (only the suggested edit was declined) — link to it either way.
      return n.course_name ? `/course/${encodeURIComponent(n.course_name)}` : null;
    case 'group_invite_response':
      // Only navigable when the invite was accepted — a decline means the
      // viewer (the inviter) is already a member, but there's nothing new
      // to see beyond the group they already have.
      return n.accepted && n.group_id ? `/groups/${n.group_id}` : null;
    case 'group_join_response':
      // Denied requests leave the viewer a non-member — the full group
      // screen would 403, so only route through on approval.
      return n.approved && n.group_id ? `/groups/${n.group_id}` : null;
    default:
      // e.g. course_rejected, group_invite, group_join_request — the last two
      // are handled via inline Accept/Decline buttons instead of navigation.
      return null;
  }
}

export default function NotificationsScreen() {
  useTheme();
  const router = useRouter();
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionState, setActionState] = useState<Record<string, 'accepted' | 'declined' | 'approved' | 'denied'>>({});
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      const res = await api.listNotifications();
      setItems(res.notifications);
    } catch {
      // Silent — if it fails just show empty
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Mark everything as read as soon as the user opens the screen.
  useEffect(() => {
    if (items.some((n) => !n.read)) {
      api.markAllNotificationsRead().catch(() => {});
    }
  }, [items]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const onPressNotification = (n: Notification) => {
    Haptics.selectionAsync().catch(() => {});
    if (!n.read) {
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
      api.markNotificationRead(n.id).catch(() => {});
    }
    const target = resolveNotificationTarget(n);
    if (target) router.push(target as any);
  };

  const respondInvite = async (n: Notification, accept: boolean) => {
    if (!n.group_id || !n.invite_id || actionLoading) return;
    Haptics.selectionAsync().catch(() => {});
    setActionLoading(n.id);
    try {
      const res = await api.respondGroupInvite(n.group_id, n.invite_id, accept);
      setActionState((prev) => ({ ...prev, [n.id]: res.status }));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (e: any) {
      Alert.alert('Could not respond', e?.message || 'Please try again.');
    } finally {
      setActionLoading(null);
    }
  };

  const respondJoinRequest = async (n: Notification, approve: boolean) => {
    if (!n.group_id || !n.request_id || actionLoading) return;
    Haptics.selectionAsync().catch(() => {});
    setActionLoading(n.id);
    try {
      const res = await api.respondJoinRequest(n.group_id, n.request_id, approve);
      setActionState((prev) => ({ ...prev, [n.id]: res.status }));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (e: any) {
      Alert.alert('Could not respond', e?.message || 'Please try again.');
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8} testID="notif-back">
          <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>Notifications</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.brandPrimary} size="large" />
        </View>
      ) : items.length === 0 ? (
        <View style={styles.center}>
          <View style={styles.emptyIcon}>
            <Ionicons name="notifications-off-outline" size={32} color={colors.muted} />
          </View>
          <Text style={styles.emptyTitle}>You&apos;re all caught up</Text>
          <Text style={styles.emptySub}>We&apos;ll let you know if something needs your attention.</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brandPrimary} />}
        >
          {items.map((n) => {
            const meta = iconForType(n.type);
            const target = resolveNotificationTarget(n);
            const resolved = actionState[n.id];
            const showInviteActions = n.type === 'group_invite' && !resolved;
            const showJoinActions = n.type === 'group_join_request' && !resolved;
            const busy = actionLoading === n.id;
            return (
              <Pressable
                key={n.id}
                testID={`notif-row-${n.id}`}
                onPress={() => onPressNotification(n)}
                disabled={!target}
                style={[styles.card, !n.read && styles.cardUnread]}
              >
                <View style={styles.iconWrap}>
                  <Ionicons name={meta.icon} size={22} color={meta.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>{n.title}</Text>
                  <Text style={styles.cardBody}>{n.body}</Text>
                  <Text style={styles.cardTime}>{new Date(n.created_at).toLocaleDateString()}</Text>

                  {showInviteActions ? (
                    <View style={styles.actionRow}>
                      <Pressable
                        testID={`notif-accept-${n.id}`}
                        onPress={(e) => {
                          e?.stopPropagation?.();
                          respondInvite(n, true);
                        }}
                        disabled={busy}
                        style={[styles.actionBtnPrimary, busy && { opacity: 0.6 }]}
                      >
                        {busy ? (
                          <ActivityIndicator size="small" color="#fff" />
                        ) : (
                          <Text style={styles.actionBtnPrimaryText}>Accept</Text>
                        )}
                      </Pressable>
                      <Pressable
                        testID={`notif-decline-${n.id}`}
                        onPress={(e) => {
                          e?.stopPropagation?.();
                          respondInvite(n, false);
                        }}
                        disabled={busy}
                        style={[styles.actionBtnSecondary, busy && { opacity: 0.6 }]}
                      >
                        <Text style={styles.actionBtnSecondaryText}>Decline</Text>
                      </Pressable>
                    </View>
                  ) : null}

                  {showJoinActions ? (
                    <View style={styles.actionRow}>
                      <Pressable
                        testID={`notif-approve-${n.id}`}
                        onPress={(e) => {
                          e?.stopPropagation?.();
                          respondJoinRequest(n, true);
                        }}
                        disabled={busy}
                        style={[styles.actionBtnPrimary, busy && { opacity: 0.6 }]}
                      >
                        {busy ? (
                          <ActivityIndicator size="small" color="#fff" />
                        ) : (
                          <Text style={styles.actionBtnPrimaryText}>Approve</Text>
                        )}
                      </Pressable>
                      <Pressable
                        testID={`notif-deny-${n.id}`}
                        onPress={(e) => {
                          e?.stopPropagation?.();
                          respondJoinRequest(n, false);
                        }}
                        disabled={busy}
                        style={[styles.actionBtnSecondary, busy && { opacity: 0.6 }]}
                      >
                        <Text style={styles.actionBtnSecondaryText}>Deny</Text>
                      </Pressable>
                    </View>
                  ) : null}

                  {resolved ? (
                    <View style={styles.resolvedPill}>
                      <Ionicons
                        name={resolved === 'accepted' || resolved === 'approved' ? 'checkmark-circle' : 'close-circle'}
                        size={13}
                        color={resolved === 'accepted' || resolved === 'approved' ? colors.brandPrimary : colors.muted}
                      />
                      <Text style={styles.resolvedText}>
                        {resolved === 'accepted' ? 'Joined the group'
                          : resolved === 'declined' ? 'Invite declined'
                          : resolved === 'approved' ? 'Request approved'
                          : 'Request denied'}
                      </Text>
                    </View>
                  ) : null}
                </View>
                {!n.read ? <View style={styles.unreadDot} /> : null}
                {target ? (
                  <Ionicons name="chevron-forward" size={16} color={colors.muted} style={{ marginLeft: 2, alignSelf: 'center' }} />
                ) : null}
              </Pressable>
            );
          })}
        </ScrollView>
      )}
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
  headerTitle: { flex: 1, fontSize: 18, fontWeight: '800', color: colors.onSurface, textAlign: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.md },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: colors.onSurface },
  emptySub: { fontSize: 14, color: colors.muted, textAlign: 'center', maxWidth: 260 },
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceSecondary,
    marginBottom: spacing.sm,
    ...shadow.soft,
  },
  cardUnread: { backgroundColor: colors.brandTertiary },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: { fontSize: 14, fontWeight: '800', color: colors.onSurface },
  cardBody: { fontSize: 13, color: colors.onSurface, marginTop: 2, lineHeight: 18 },
  cardTime: { fontSize: 11, color: colors.muted, marginTop: 6, fontWeight: '600' },
  unreadDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.brandPrimary,
    marginTop: 6,
  },
  actionRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  actionBtnPrimary: {
    minHeight: 34,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.brandPrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnPrimaryText: { color: '#fff', fontWeight: '800', fontSize: 12.5 },
  actionBtnSecondary: {
    minHeight: 34,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnSecondaryText: { color: colors.onSurface, fontWeight: '800', fontSize: 12.5 },
  resolvedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: spacing.sm,
    alignSelf: 'flex-start',
  },
  resolvedText: { fontSize: 12, fontWeight: '700', color: colors.muted },
}));
