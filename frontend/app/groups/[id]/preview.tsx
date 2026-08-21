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
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { colors, radius, shadow, spacing } from '@/src/theme';
import { makeThemedSheet } from '@/src/theme';
import { useTheme } from '@/src/theme-context';
import { api, GroupPreview } from '@/src/api';
import { TBButton } from '@/src/components/TBButton';

function initialsOf(name?: string) {
  return (name || 'G')
    .split(' ')
    .map((s) => s[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export default function GroupPreviewScreen() {
  useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const groupId = String(id);

  const [preview, setPreview] = useState<GroupPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [requesting, setRequesting] = useState(false);
  const [requested, setRequested] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await api.groupPreview(groupId);
      setPreview(data);
      setRequested(!!data.pending_request_id);
    } catch (e: any) {
      setError(e?.message || 'Could not load this group.');
    }
  }, [groupId]);

  useEffect(() => {
    load();
  }, [load]);

  const requestJoin = async () => {
    if (!preview || requesting) return;
    setRequesting(true);
    Haptics.selectionAsync().catch(() => {});
    try {
      await api.requestJoinGroup(groupId);
      setRequested(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (e: any) {
      Alert.alert('Could not request to join', e?.message || 'Please try again.');
    } finally {
      setRequesting(false);
    }
  };

  if (!preview) {
    return (
      <SafeAreaView edges={['top']} style={styles.container}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8} testID="group-preview-back">
            <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
          </Pressable>
          <Text style={styles.headerTitle}>Group</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.loader}>
          {error ? (
            <Text style={styles.err} testID="group-preview-error">{error}</Text>
          ) : (
            <ActivityIndicator color={colors.brandPrimary} size="large" />
          )}
        </View>
      </SafeAreaView>
    );
  }

  const isFull = preview.member_count >= preview.max_members;

  return (
    <SafeAreaView edges={['top']} style={styles.container} testID="group-preview-screen">
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8} testID="group-preview-back">
          <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>{preview.name}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg, paddingBottom: 60 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <View style={styles.heroIcon}>
            <Ionicons name="people" size={26} color="#fff" />
          </View>
          <Text style={styles.heroTitle}>{preview.name}</Text>
          {preview.description ? <Text style={styles.heroSub}>{preview.description}</Text> : null}
          <Text style={styles.heroMeta}>
            {preview.member_count}/{preview.max_members} members
          </Text>
        </View>

        {preview.admins.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              {preview.admins.length > 1 ? 'Admins' : 'Admin'}
            </Text>
            {preview.admins.map((a) => (
              <Pressable
                key={a.id}
                testID={`preview-admin-${a.id}`}
                style={styles.personRow}
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  router.push(`/user/${a.id}` as any);
                }}
              >
                {a.avatar ? (
                  <Image source={{ uri: a.avatar }} style={styles.personAvatar} />
                ) : (
                  <View style={styles.personAvatarFallback}>
                    <Text style={styles.personInitials}>{initialsOf(a.display_name)}</Text>
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.personName} numberOfLines={1}>{a.display_name}</Text>
                  {a.home_course ? (
                    <Text style={styles.personSub} numberOfLines={1}>{a.home_course}</Text>
                  ) : null}
                </View>
              </Pressable>
            ))}
          </View>
        ) : null}

        {!preview.is_member ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Mutual friends</Text>
            {preview.mutual_members.length === 0 ? (
              <Text style={styles.emptySub}>No mutual friends are in this group yet.</Text>
            ) : (
              preview.mutual_members.map((m) => (
                <Pressable
                  key={m.id}
                  testID={`preview-mutual-${m.id}`}
                  style={styles.personRow}
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    router.push(`/user/${m.id}` as any);
                  }}
                >
                  {m.avatar ? (
                    <Image source={{ uri: m.avatar }} style={styles.personAvatar} />
                  ) : (
                    <View style={styles.personAvatarFallback}>
                      <Text style={styles.personInitials}>{initialsOf(m.display_name)}</Text>
                    </View>
                  )}
                  <Text style={styles.personName} numberOfLines={1}>{m.display_name}</Text>
                </Pressable>
              ))
            )}
          </View>
        ) : null}

        {preview.is_member ? (
          <TBButton
            label="Open group"
            testID="group-preview-open"
            onPress={() => router.replace(`/groups/${groupId}` as any)}
          />
        ) : requested ? (
          <View style={styles.pendingBox} testID="group-preview-pending">
            <Ionicons name="time-outline" size={18} color={colors.brandPrimary} />
            <Text style={styles.pendingText}>
              Your request to join is pending admin approval.
            </Text>
          </View>
        ) : isFull ? (
          <View style={styles.pendingBox}>
            <Ionicons name="alert-circle-outline" size={18} color={colors.muted} />
            <Text style={styles.pendingText}>This group is full right now.</Text>
          </View>
        ) : (
          <TBButton
            label={requesting ? 'Requesting…' : 'Request to join'}
            testID="group-preview-request"
            loading={requesting}
            onPress={requestJoin}
          />
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
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  err: { color: colors.error, fontSize: 13, fontWeight: '700', textAlign: 'center' },
  hero: { alignItems: 'center', gap: 6, paddingVertical: spacing.md },
  heroIcon: {
    width: 60,
    height: 60,
    borderRadius: radius.pill,
    backgroundColor: colors.brandPrimary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
    ...shadow.card,
  },
  heroTitle: { fontSize: 20, fontWeight: '800', color: colors.onSurface, textAlign: 'center' },
  heroSub: { fontSize: 13.5, color: colors.muted, textAlign: 'center', lineHeight: 18, maxWidth: 300 },
  heroMeta: { fontSize: 12, color: colors.muted, fontWeight: '700', marginTop: 2 },
  section: { gap: spacing.sm },
  sectionTitle: { fontSize: 13, fontWeight: '800', color: colors.muted, letterSpacing: 0.4, textTransform: 'uppercase' },
  personRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    padding: spacing.md,
    ...shadow.soft,
  },
  personAvatar: { width: 40, height: 40, borderRadius: radius.pill },
  personAvatarFallback: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.brandTertiary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  personInitials: { fontSize: 13, fontWeight: '800', color: colors.brandDeep },
  personName: { fontSize: 14.5, fontWeight: '800', color: colors.onSurface },
  personSub: { fontSize: 12, color: colors.muted, marginTop: 2 },
  emptySub: { fontSize: 13, color: colors.muted },
  pendingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.brandTertiary,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  pendingText: { flex: 1, fontSize: 13, fontWeight: '700', color: colors.onBrandTertiary, lineHeight: 18 },
}));
