import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { colors, radius, spacing } from '@/src/theme';
import { makeThemedSheet } from '@/src/theme';
import { useTheme } from '@/src/theme-context';
import { TBButton } from '@/src/components/TBButton';
import { TBInput } from '@/src/components/TBInput';
import { api } from '@/src/api';

type Policy = 'admin' | 'any';

export default function CreateGroupScreen() {
  useTheme();
  const router = useRouter();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [policy, setPolicy] = useState<Policy>('admin');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    const trimmedName = name.trim();
    if (trimmedName.length < 2) {
      setError('Group name must be at least 2 characters.');
      return;
    }
    setSaving(true);
    try {
      const g = await api.createGroup({
        name: trimmedName,
        description: description.trim() || undefined,
        member_add_policy: policy,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      router.replace(`/groups/${g.id}` as any);
    } catch (e: any) {
      setError(e?.message || 'Could not create the group.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    } finally {
      setSaving(false);
    }
  };

  const PolicyChoice = ({ value, title, subtitle, icon }: { value: Policy; title: string; subtitle: string; icon: keyof typeof Ionicons.glyphMap }) => {
    const active = policy === value;
    return (
      <Pressable
        testID={`policy-${value}`}
        style={[styles.policyRow, active && styles.policyRowActive]}
        onPress={() => {
          Haptics.selectionAsync().catch(() => {});
          setPolicy(value);
        }}
      >
        <View style={[styles.policyIcon, active && { backgroundColor: colors.brandPrimary }]}>
          <Ionicons name={icon} size={16} color={active ? '#fff' : colors.brandDeep} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.policyTitle}>{title}</Text>
          <Text style={styles.policySub}>{subtitle}</Text>
        </View>
        <Ionicons
          name={active ? 'radio-button-on' : 'radio-button-off'}
          size={22}
          color={active ? colors.brandPrimary : colors.muted}
        />
      </Pressable>
    );
  };

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8} testID="group-create-back">
          <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>New group</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAwareScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        bottomOffset={40}
      >
        <Text style={styles.intro}>
          Groups are private — only members see the shared feed and season leaderboard. You&apos;ll
          get a unique invite code to share with friends.
        </Text>

        {error ? <Text style={styles.err} testID="group-create-error">{error}</Text> : null}

        <TBInput
          label="Group name *"
          value={name}
          onChangeText={setName}
          placeholder="e.g. Weekend Warriors"
          testID="group-create-name"
          maxLength={60}
        />
        <TBInput
          label="Description (optional)"
          value={description}
          onChangeText={setDescription}
          placeholder="A one-line tagline for your crew"
          testID="group-create-description"
          maxLength={240}
          multiline
        />

        <Text style={styles.sectionLabel}>Who can add members?</Text>
        <View style={{ gap: spacing.sm }}>
          <PolicyChoice
            value="admin"
            title="Only me (admin)"
            subtitle="Members can join with the invite code, but only you can add people directly."
            icon="shield-checkmark"
          />
          <PolicyChoice
            value="any"
            title="Any member"
            subtitle="Any current member can invite others directly. Great for open crews."
            icon="people"
          />
        </View>

        <View style={styles.capNote}>
          <Ionicons name="information-circle" size={16} color={colors.muted} />
          <Text style={styles.capNoteText}>Groups are capped at 50 members.</Text>
        </View>

        <TBButton
          label={saving ? 'Creating…' : 'Create group'}
          loading={saving}
          onPress={submit}
          testID="group-create-submit"
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
  intro: { fontSize: 13.5, color: colors.muted, lineHeight: 19 },
  sectionLabel: { fontSize: 13, fontWeight: '800', color: colors.onSurface, marginTop: spacing.sm },
  policyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  policyRowActive: { borderColor: colors.brandPrimary, backgroundColor: colors.brandTertiary },
  policyIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  policyTitle: { fontSize: 15, fontWeight: '800', color: colors.onSurface },
  policySub: { fontSize: 12, color: colors.muted, marginTop: 2, lineHeight: 16 },
  capNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.sm,
  },
  capNoteText: { fontSize: 12.5, color: colors.muted },
  err: { color: colors.error, fontSize: 13, fontWeight: '700' },
}));
