import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  TextInput,
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
import { api } from '@/src/api';

export default function AddMembersScreen() {
  useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const groupId = String(id);

  const [query, setQuery] = useState('');
  const [candidates, setCandidates] = useState<any[] | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const [added, setAdded] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (q: string) => {
    try {
      const data = await api.groupAddCandidates(groupId, q);
      setCandidates(data);
    } catch (e: any) {
      setError(e?.message || 'Could not load candidates.');
      setCandidates([]);
    }
  }, [groupId]);

  useEffect(() => {
    load('');
  }, [load]);

  const handleQuery = (t: string) => {
    setQuery(t);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => load(t), 220);
  };

  const addOne = async (userId: string, name: string) => {
    setAdding(userId);
    setError(null);
    try {
      await api.addGroupMember(groupId, userId);
      setAdded((prev) => ({ ...prev, [userId]: true }));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (e: any) {
      Alert.alert('Could not invite', e?.message || `Failed to invite ${name}.`);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    } finally {
      setAdding(null);
    }
  };

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8} testID="add-members-back">
          <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>Invite members</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.searchWrap}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color={colors.muted} />
          <TextInput
            value={query}
            onChangeText={handleQuery}
            placeholder="Search your connections…"
            placeholderTextColor={colors.muted}
            style={styles.searchInput}
            autoCapitalize="none"
            autoCorrect={false}
            testID="add-members-search"
          />
          {query.length > 0 ? (
            <Pressable onPress={() => handleQuery('')} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={colors.muted} />
            </Pressable>
          ) : null}
        </View>
        <Text style={styles.hint}>
          Only people you follow or who follow you can be invited directly. They&apos;ll get a
          notification to accept or decline.
        </Text>
      </View>

      {error ? <Text style={styles.err} testID="add-members-error">{error}</Text> : null}

      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm, paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {candidates === null ? (
          <ActivityIndicator color={colors.brandPrimary} style={{ marginTop: spacing.xl }} />
        ) : candidates.length === 0 ? (
          <View style={styles.empty}>
            <View style={styles.emptyIcon}>
              <Ionicons name="people-outline" size={30} color={colors.muted} />
            </View>
            <Text style={styles.emptyTitle}>Nobody to invite</Text>
            <Text style={styles.emptySub}>
              Follow other TeeBox golfers first — you can only invite people from your
              connections. Anyone with the invite code can still join on their own.
            </Text>
          </View>
        ) : (
          candidates.map((c) => {
            const isAdded = added[c.id];
            return (
              <View key={c.id} style={styles.row} testID={`candidate-${c.id}`}>
                {c.avatar ? (
                  <Image source={{ uri: c.avatar }} style={styles.avatar} />
                ) : (
                  <View style={styles.avatarFallback}>
                    <Text style={styles.avatarInitials}>
                      {(c.display_name || 'G').split(' ').map((s: string) => s[0]).slice(0, 2).join('').toUpperCase()}
                    </Text>
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.name} numberOfLines={1}>{c.display_name}</Text>
                  {c.home_course ? (
                    <Text style={styles.sub} numberOfLines={1}>{c.home_course}</Text>
                  ) : null}
                </View>
                {isAdded ? (
                  <View style={styles.addedPill}>
                    <Ionicons name="paper-plane" size={12} color="#1B5E33" />
                    <Text style={styles.addedText}>Invite sent</Text>
                  </View>
                ) : (
                  <Pressable
                    testID={`candidate-add-${c.id}`}
                    onPress={() => addOne(c.id, c.display_name)}
                    disabled={adding === c.id}
                    style={({ pressed }) => [styles.addBtn, pressed && { opacity: 0.85 }, adding === c.id && { opacity: 0.6 }]}
                  >
                    {adding === c.id ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <>
                        <Ionicons name="paper-plane-outline" size={14} color="#fff" />
                        <Text style={styles.addBtnText}>Invite</Text>
                      </>
                    )}
                  </Pressable>
                )}
              </View>
            );
          })
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
  searchWrap: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, gap: 6 },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    height: 46,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  searchInput: { flex: 1, fontSize: 15, color: colors.onSurface, paddingVertical: 0 },
  hint: { fontSize: 11.5, color: colors.muted },
  err: { color: colors.error, fontSize: 13, fontWeight: '700', paddingHorizontal: spacing.lg, marginTop: 8 },
  empty: {
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.xl,
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    ...shadow.soft,
  },
  avatar: { width: 40, height: 40, borderRadius: radius.pill },
  avatarFallback: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.brandTertiary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: { fontSize: 13, fontWeight: '800', color: colors.brandDeep },
  name: { fontSize: 15, fontWeight: '800', color: colors.onSurface },
  sub: { fontSize: 12, color: colors.muted, marginTop: 2 },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.brandPrimary,
  },
  addBtnText: { color: '#fff', fontWeight: '800', fontSize: 12.5 },
  addedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: '#D6F1DE',
  },
  addedText: { color: '#1B5E33', fontWeight: '800', fontSize: 12 },
}));
