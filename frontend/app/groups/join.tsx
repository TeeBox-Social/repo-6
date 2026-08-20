import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { colors, radius, shadow, spacing } from '@/src/theme';
import { makeThemedSheet } from '@/src/theme';
import { useTheme } from '@/src/theme-context';
import { TBButton } from '@/src/components/TBButton';
import { TBInput } from '@/src/components/TBInput';
import { api } from '@/src/api';

export default function JoinGroupScreen() {
  useTheme();
  const router = useRouter();
  const [code, setCode] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    const clean = code.trim().toUpperCase();
    if (clean.length < 4) {
      setError('Invite code must be at least 4 characters.');
      return;
    }
    setSaving(true);
    try {
      const g = await api.joinGroupByCode(clean);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      router.replace(`/groups/${g.id}` as any);
    } catch (e: any) {
      setError(e?.message || 'Could not join this group.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8} testID="group-join-back">
          <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>Join a group</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAwareScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        bottomOffset={40}
      >
        <View style={styles.hero}>
          <View style={styles.heroIcon}>
            <Ionicons name="enter-outline" size={30} color={colors.brandPrimary} />
          </View>
          <Text style={styles.heroTitle}>Have an invite code?</Text>
          <Text style={styles.heroSub}>
            Enter the 8-character code your friend shared with you.
          </Text>
        </View>

        {error ? <Text style={styles.err} testID="group-join-error">{error}</Text> : null}

        <TBInput
          label="Invite code"
          value={code}
          onChangeText={(t) => setCode(t.toUpperCase())}
          placeholder="e.g. K7BX2QMP"
          testID="group-join-code"
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={20}
        />

        <TBButton
          label={saving ? 'Joining…' : 'Join group'}
          loading={saving}
          onPress={submit}
          testID="group-join-submit"
          style={{ marginTop: spacing.md }}
        />
      </KeyboardAwareScrollView>
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
  scroll: { padding: spacing.lg, paddingBottom: 80, gap: spacing.md },
  hero: {
    alignItems: 'center',
    gap: 6,
    padding: spacing.lg,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    ...shadow.soft,
  },
  heroIcon: {
    width: 64,
    height: 64,
    borderRadius: radius.pill,
    backgroundColor: colors.brandTertiary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  heroTitle: { fontSize: 17, fontWeight: '800', color: colors.onSurface },
  heroSub: { fontSize: 13, color: colors.muted, textAlign: 'center', lineHeight: 18 },
  err: { color: colors.error, fontSize: 13, fontWeight: '700' },
}));
