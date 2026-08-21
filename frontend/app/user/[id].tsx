import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { colors, IMAGES, radius, shadow, spacing } from '@/src/theme';
import { makeThemedSheet } from '@/src/theme';
import { useTheme } from '@/src/theme-context';
import { api } from '@/src/api';
import { RoundCard } from '@/src/components/RoundCard';
import { TBButton } from '@/src/components/TBButton';
import { WishlistList } from '@/src/components/WishlistList';

export default function UserDetail() {
  useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [profile, setProfile] = useState<any>(null);
  const [rounds, setRounds] = useState<any[] | null>(null);
  const [wishlist, setWishlist] = useState<any[] | null>(null);
  const [messaging, setMessaging] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const [p, r, w] = await Promise.all([
        api.getUser(String(id)),
        api.getUserRounds(String(id)),
        api.getUserWishlist(String(id)),
      ]);
      setProfile(p);
      setRounds(r);
      setWishlist(w);
    } catch {}
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleFollow = async () => {
    if (!profile) return;
    setProfile({
      ...profile,
      is_following: !profile.is_following,
      follower_count: profile.is_following
        ? Math.max(0, profile.follower_count - 1)
        : profile.follower_count + 1,
    });
    try {
      await api.toggleFollow(String(id));
    } catch {}
  };

  const startMessage = async () => {
    if (!profile || messaging) return;
    setMessaging(true);
    try {
      const conv = await api.startConversation(profile.id);
      router.push({
        pathname: `/messages/${conv.id}` as any,
        params: { name: profile.display_name, avatar: profile.avatar || '', otherId: profile.id },
      });
    } catch (e: any) {
      Alert.alert('Could not start chat', e?.message || 'Try again.');
    } finally {
      setMessaging(false);
    }
  };

  const onLike = async (rid: string) => {
    if (!rounds) return;
    setRounds(
      rounds.map((r) =>
        r.id === rid
          ? {
              ...r,
              liked_by_me: !r.liked_by_me,
              like_count: r.liked_by_me ? Math.max(0, r.like_count - 1) : r.like_count + 1,
            }
          : r,
      ),
    );
    try {
      const res = await api.toggleLike(rid);
      setRounds((prev) =>
        prev
          ? prev.map((r) =>
              r.id === rid ? { ...r, liked_by_me: res.liked, like_count: res.like_count } : r,
            )
          : prev,
      );
    } catch {}
  };

  if (!profile) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.brandPrimary} size="large" />
      </View>
    );
  }

  const initials = (profile.display_name || 'G')
    .split(' ')
    .map((s: string) => s[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 60 }} testID="user-detail-screen">
      <View style={styles.cover}>
        <Image source={{ uri: IMAGES.courseThumb }} style={StyleSheet.absoluteFillObject} contentFit="cover" />
        <LinearGradient
          colors={['rgba(19,42,28,0.15)', 'rgba(19,42,28,0.8)']}
          style={StyleSheet.absoluteFillObject}
        />
        <SafeAreaView edges={['top']} style={styles.coverTop}>
          <Pressable testID="user-back" onPress={() => router.back()} style={styles.iconBtn} hitSlop={8}>
            <Ionicons name="chevron-back" size={22} color="#fff" />
          </Pressable>
        </SafeAreaView>
      </View>
      <View style={styles.avatarWrap}>
        <View style={styles.avatar}>
          {profile.avatar ? (
            <Image source={{ uri: profile.avatar }} style={{ width: '100%', height: '100%' }} />
          ) : (
            <Text style={styles.avatarText}>{initials}</Text>
          )}
        </View>
      </View>

      <View style={styles.identity}>
        <Text style={styles.name}>
          {profile.display_name}
          {profile.handicap != null ? (
            <Text style={styles.nameHc}> · {profile.handicap} HCP</Text>
          ) : null}
        </Text>
        <Text style={styles.homeCourse}>{profile.home_course || 'No home course'}</Text>
        {profile.bio ? <Text style={styles.bio}>{profile.bio}</Text> : null}
      </View>

      <View style={styles.statsRow}>
        <StatCell label="Rounds" value={String(profile.round_count || 0)} />
        <StatCell
          label="Avg"
          value={profile.avg_score != null ? String(profile.avg_score) : '—'}
        />
        <StatCell
          label="Courses"
          value={String(profile.courses_played || 0)}
          onPress={() => router.push(`/user/${profile.id}/courses-played`)}
          testID="user-stat-courses"
        />
        <StatCell
          label="Friends"
          value={String(profile.friends_count || 0)}
          onPress={() => router.push(`/user/${profile.id}/friends`)}
          testID="user-stat-friends"
        />
      </View>

      {!profile.is_me ? (
        <View style={styles.followWrap}>
          <View style={{ flex: 1 }}>
            <TBButton
              label={profile.is_following ? 'Following' : 'Follow'}
              testID="user-follow-btn"
              onPress={toggleFollow}
              variant={profile.is_following ? 'secondary' : 'primary'}
            />
          </View>
          <Pressable
            testID="user-message-btn"
            onPress={startMessage}
            style={styles.messageBtn}
            hitSlop={8}
            disabled={messaging}
          >
            {messaging ? (
              <ActivityIndicator size="small" color={colors.brandPrimary} />
            ) : (
              <>
                <Ionicons name="chatbubble-ellipses-outline" size={17} color={colors.brandPrimary} />
                <Text style={styles.messageBtnText}>Message</Text>
              </>
            )}
          </Pressable>
        </View>
      ) : null}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Wishlist ({wishlist?.length ?? 0})</Text>
        <WishlistList
          items={wishlist || []}
          emptyLabel={`${profile.display_name?.split(' ')[0] || 'They'} haven't added any wishlist courses yet.`}
          testID="user-wishlist"
        />
      </View>

      {profile.public_groups && profile.public_groups.length > 0 ? (
        <View style={styles.section} testID="user-groups">
          <Text style={styles.sectionTitle}>Groups</Text>
          <View style={{ gap: spacing.sm }}>
            {profile.public_groups.map((g: any) => (
              <Pressable
                key={g.id}
                testID={`user-group-${g.id}`}
                style={styles.groupCard}
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  router.push(`/groups/${g.id}/preview` as any);
                }}
              >
                <View style={styles.groupCardIcon}>
                  <Ionicons name="people" size={18} color={colors.brandDeep} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.groupCardTitle} numberOfLines={1}>{g.name}</Text>
                  <Text style={styles.groupCardSub} numberOfLines={1}>
                    {g.member_count} {g.member_count === 1 ? 'member' : 'members'}
                    {g.description ? ` \u00b7 ${g.description}` : ''}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.muted} />
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Rounds</Text>
        {profile.pinned_round ? (
          <View testID="user-pinned-round">
            <View style={styles.pinBadge}>
              <Ionicons name="pin" size={11} color={colors.onBrandTertiary} />
              <Text style={styles.pinBadgeText}>Pinned round</Text>
            </View>
            <RoundCard
              round={profile.pinned_round}
              onLike={() => onLike(profile.pinned_round.id)}
            />
          </View>
        ) : null}
        {rounds && rounds.filter((r) => r.id !== profile.pinned_round?.id).length > 0 ? (
          rounds
            .filter((r) => r.id !== profile.pinned_round?.id)
            .map((r) => <RoundCard key={r.id} round={r} onLike={() => onLike(r.id)} />)
        ) : profile.pinned_round ? null : (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyTitle}>No rounds yet</Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

function StatCell({
  label,
  value,
  onPress,
  testID,
}: {
  label: string;
  value: string;
  onPress?: () => void;
  testID?: string;
}) {
  const inner = (
    <>
      <Text style={styles.statVal}>{value}</Text>
      <Text style={styles.statLbl}>{label}</Text>
      {onPress ? (
        <View style={styles.statChevron}>
          <Ionicons name="chevron-forward" size={11} color={colors.muted} />
        </View>
      ) : null}
    </>
  );
  if (onPress) {
    return (
      <Pressable testID={testID} onPress={onPress} style={styles.statCell} hitSlop={4}>
        {inner}
      </Pressable>
    );
  }
  return <View style={styles.statCell}>{inner}</View>;
}

const styles = makeThemedSheet((colors: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  cover: { height: 220, backgroundColor: colors.surfaceInverse },
  coverTop: { flexDirection: 'row', paddingHorizontal: spacing.lg, alignItems: 'center' },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarWrap: { alignItems: 'center', marginTop: -50 },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: radius.pill,
    backgroundColor: colors.brandTertiary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 5,
    borderColor: colors.surface,
    overflow: 'hidden',
    ...shadow.card,
  },
  avatarText: { fontSize: 34, fontWeight: '800', color: colors.onBrandTertiary },
  identity: { alignItems: 'center', paddingHorizontal: spacing.xl, marginTop: spacing.md, gap: 4 },
  name: { fontSize: 24, fontWeight: '800', color: colors.onSurface },
  nameHc: { fontSize: 15, fontWeight: '700', color: colors.brandPrimary },
  homeCourse: { fontSize: 14, color: colors.muted, fontWeight: '600' },
  bio: { fontSize: 14, color: colors.onSurface, textAlign: 'center', marginTop: spacing.sm },
  statsRow: {
    flexDirection: 'row',
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    padding: spacing.md,
    ...shadow.soft,
  },
  statCell: { flex: 1, alignItems: 'center', position: 'relative' },
  statChevron: { position: 'absolute', bottom: -2, right: 6 },
  statVal: { fontSize: 20, fontWeight: '800', color: colors.brandPrimary },
  statLbl: {
    fontSize: 11,
    color: colors.muted,
    fontWeight: '700',
    letterSpacing: 0.4,
    marginTop: 2,
    textTransform: 'uppercase',
  },
  followWrap: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg, marginTop: spacing.lg },
  messageBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    height: 48,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.brandPrimary,
    backgroundColor: colors.surfaceSecondary,
  },
  messageBtnText: { fontSize: 14, fontWeight: '800', color: colors.brandPrimary },
  section: { marginTop: spacing.xl, paddingHorizontal: spacing.lg },
  pinBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    backgroundColor: colors.brandTertiary,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    marginBottom: spacing.sm,
  },
  pinBadgeText: { fontSize: 11, fontWeight: '800', color: colors.onBrandTertiary, letterSpacing: 0.4 },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: colors.onSurface, marginBottom: spacing.md },
  emptyBox: {
    padding: spacing.xl,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    alignItems: 'center',
  },
  emptyTitle: { fontSize: 15, fontWeight: '800', color: colors.onSurface },
  groupCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    padding: spacing.md,
    ...shadow.soft,
  },
  groupCardIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.brandTertiary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupCardTitle: { fontSize: 14.5, fontWeight: '800', color: colors.onSurface },
  groupCardSub: { fontSize: 12, color: colors.muted, marginTop: 2 },
}));
