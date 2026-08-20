import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  TextInput,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { colors, radius, shadow, spacing } from '@/src/theme';
import { makeThemedSheet } from '@/src/theme';
import { useTheme } from '@/src/theme-context';
import { TBButton } from '@/src/components/TBButton';
import { TBInput } from '@/src/components/TBInput';
import { api } from '@/src/api';

type TabKey = 'add' | 'edit' | 'mine';

const TABS: { key: TabKey; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'add', label: 'Add a Course', icon: 'add-circle-outline' },
  { key: 'edit', label: 'Suggest an Edit', icon: 'create-outline' },
  { key: 'mine', label: 'My Submissions', icon: 'time-outline' },
];

const FIELD_LABELS: Record<string, string> = {
  par: 'Par',
  address: 'Address',
  city: 'City',
  region: 'Region/State',
  country: 'Country',
  website: 'Website',
  phone: 'Phone',
  num_holes: 'Number of holes',
  architect: 'Architect',
  year_built: 'Year built',
};

export default function CourseEditRequestsScreen() {
  useTheme();
  const router = useRouter();
  const [tab, setTab] = useState<TabKey>('add');

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={styles.backBtn}
          hitSlop={8}
          testID="course-edit-requests-back"
        >
          <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>Course Edit Requests</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.tabRow} testID="course-edit-requests-tabs">
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <Pressable
              key={t.key}
              testID={`cer-tab-${t.key}`}
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                setTab(t.key);
              }}
              style={[styles.tabBtn, active && styles.tabBtnActive]}
            >
              <Ionicons name={t.icon} size={14} color={active ? '#fff' : colors.onSurface} />
              <Text style={[styles.tabText, active && styles.tabTextActive]} numberOfLines={1}>
                {t.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {tab === 'add' ? <AddCourseTab /> : tab === 'edit' ? <SuggestEditTab /> : <MineTab />}
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Add a Course
// ---------------------------------------------------------------------------
function AddCourseTab() {
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [par, setPar] = useState('72');
  const [city, setCity] = useState('');
  const [region, setRegion] = useState('');
  const [country, setCountry] = useState('');
  const [website, setWebsite] = useState('');
  const [phone, setPhone] = useState('');
  const [numHoles, setNumHoles] = useState('18');
  const [architect, setArchitect] = useState('');
  const [yearBuilt, setYearBuilt] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const reset = () => {
    setName('');
    setAddress('');
    setPar('72');
    setCity('');
    setRegion('');
    setCountry('');
    setWebsite('');
    setPhone('');
    setNumHoles('18');
    setArchitect('');
    setYearBuilt('');
  };

  const submit = async () => {
    setError(null);
    setSuccess(false);
    const trimmedName = name.trim();
    if (trimmedName.length < 3) {
      setError('Full course name is required (at least 3 characters).');
      return;
    }
    const parNum = Number(par);
    if (!Number.isFinite(parNum) || parNum < 27 || parNum > 90) {
      setError('Enter a par between 27 and 90 for 18 holes.');
      return;
    }
    let holesNum: number | undefined;
    if (numHoles.trim()) {
      holesNum = Number(numHoles);
      if (!Number.isFinite(holesNum) || holesNum < 1 || holesNum > 36) {
        setError('Number of holes should be between 1 and 36.');
        return;
      }
    }
    let yearNum: number | undefined;
    if (yearBuilt.trim()) {
      yearNum = Number(yearBuilt);
      if (!Number.isFinite(yearNum) || yearNum < 1750 || yearNum > 2100) {
        setError('Enter a valid year built.');
        return;
      }
    }
    setSaving(true);
    try {
      await api.submitCourse({
        name: trimmedName,
        par: parNum,
        address: address.trim() || undefined,
        city: city.trim() || undefined,
        region: region.trim() || undefined,
        country: country.trim() || undefined,
        website: website.trim() || undefined,
        phone: phone.trim() || undefined,
        num_holes: holesNum,
        architect: architect.trim() || undefined,
        year_built: yearNum,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setSuccess(true);
      reset();
    } catch (e: any) {
      setError(e?.message || 'Could not submit this course. Try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAwareScrollView
      contentContainerStyle={styles.formScroll}
      showsVerticalScrollIndicator={false}
      bottomOffset={40}
    >
      <Text style={styles.introText}>
        Can&apos;t find your course anywhere in TeeBox? Add it here. An admin reviews every
        submission before it becomes discoverable to other golfers — but you can start logging
        rounds at it right away.
      </Text>

      {success ? (
        <View style={styles.successBox} testID="add-course-success">
          <Ionicons name="checkmark-circle" size={18} color={colors.brandPrimary} />
          <Text style={styles.successText}>
            Submitted! We&apos;ll notify you once an admin reviews it.
          </Text>
        </View>
      ) : null}
      {error ? <Text style={styles.errText} testID="add-course-error">{error}</Text> : null}

      <TBInput
        label="Full course name *"
        value={name}
        onChangeText={setName}
        placeholder="e.g. Pebble Meadows GC"
        testID="cer-add-name"
        autoCapitalize="words"
      />
      <TBInput
        label="Address"
        value={address}
        onChangeText={setAddress}
        placeholder="Street, city, state — used to link Google Maps"
        testID="cer-add-address"
      />
      <View style={styles.row2}>
        <TBInput
          label="Par (18 holes) *"
          value={par}
          onChangeText={setPar}
          keyboardType="number-pad"
          placeholder="72"
          testID="cer-add-par"
          containerStyle={{ flex: 1 }}
        />
        <TBInput
          label="Number of holes"
          value={numHoles}
          onChangeText={setNumHoles}
          keyboardType="number-pad"
          placeholder="18"
          testID="cer-add-holes"
          containerStyle={{ flex: 1 }}
        />
      </View>
      <View style={styles.row2}>
        <TBInput
          label="City"
          value={city}
          onChangeText={setCity}
          testID="cer-add-city"
          containerStyle={{ flex: 1 }}
        />
        <TBInput
          label="Region/State"
          value={region}
          onChangeText={setRegion}
          testID="cer-add-region"
          containerStyle={{ flex: 1 }}
        />
      </View>
      <TBInput
        label="Country"
        value={country}
        onChangeText={setCountry}
        testID="cer-add-country"
      />
      <TBInput
        label="Website"
        value={website}
        onChangeText={setWebsite}
        placeholder="https://…"
        keyboardType="url"
        autoCapitalize="none"
        testID="cer-add-website"
      />
      <View style={styles.row2}>
        <TBInput
          label="Phone"
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          testID="cer-add-phone"
          containerStyle={{ flex: 1 }}
        />
        <TBInput
          label="Year built"
          value={yearBuilt}
          onChangeText={setYearBuilt}
          keyboardType="number-pad"
          testID="cer-add-year"
          containerStyle={{ flex: 1 }}
        />
      </View>
      <TBInput
        label="Architect"
        value={architect}
        onChangeText={setArchitect}
        testID="cer-add-architect"
      />

      <TBButton
        label={saving ? 'Submitting…' : 'Submit for review'}
        loading={saving}
        onPress={submit}
        testID="cer-add-submit"
        style={{ marginTop: spacing.md }}
      />
    </KeyboardAwareScrollView>
  );
}

// ---------------------------------------------------------------------------
// Suggest an Edit
// ---------------------------------------------------------------------------
function SuggestEditTab() {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [focused, setFocused] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [loadingCourse, setLoadingCourse] = useState(false);

  const [par, setPar] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [region, setRegion] = useState('');
  const [country, setCountry] = useState('');
  const [website, setWebsite] = useState('');
  const [phone, setPhone] = useState('');
  const [numHoles, setNumHoles] = useState('');
  const [architect, setArchitect] = useState('');
  const [yearBuilt, setYearBuilt] = useState('');
  const [note, setNote] = useState('');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const doSearch = useCallback(async (q: string) => {
    if (!q || q.trim().length < 2) {
      setSuggestions([]);
      return;
    }
    setSearching(true);
    try {
      const hits = await api.searchCourses(q.trim());
      setSuggestions(hits.filter((h) => h.verified));
    } catch {
      setSuggestions([]);
    } finally {
      setSearching(false);
    }
  }, []);

  const handleChangeText = (text: string) => {
    setQuery(text);
    setSelectedName(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(text), 220);
  };

  const pickCourse = async (name: string) => {
    Haptics.selectionAsync().catch(() => {});
    setQuery(name);
    setFocused(false);
    setSuggestions([]);
    setSelectedName(name);
    setError(null);
    setSuccess(false);
    setLoadingCourse(true);
    try {
      const info = await api.courseInfo(name);
      setPar(info?.par != null ? String(info.par) : '');
      setAddress(info?.address || '');
      setCity(info?.city || '');
      setRegion(info?.region || '');
      setCountry(info?.country || '');
      setWebsite(info?.website || '');
      setPhone(info?.phone || '');
      setNumHoles(info?.num_holes != null ? String(info.num_holes) : '');
      setArchitect(info?.architect || '');
      setYearBuilt(info?.year_built != null ? String(info.year_built) : '');
    } catch {
      setError('Could not load this course. Try again.');
    } finally {
      setLoadingCourse(false);
    }
  };

  const submit = async () => {
    if (!selectedName) return;
    setError(null);
    setSuccess(false);
    setSaving(true);
    try {
      await api.submitCourseEditRequest({
        course_name: selectedName,
        par: par.trim() ? Number(par) : undefined,
        address: address.trim() || undefined,
        city: city.trim() || undefined,
        region: region.trim() || undefined,
        country: country.trim() || undefined,
        website: website.trim() || undefined,
        phone: phone.trim() || undefined,
        num_holes: numHoles.trim() ? Number(numHoles) : undefined,
        architect: architect.trim() || undefined,
        year_built: yearBuilt.trim() ? Number(yearBuilt) : undefined,
        note: note.trim() || undefined,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setSuccess(true);
      setNote('');
    } catch (e: any) {
      setError(e?.message || 'Could not submit this edit. Adjust at least one field.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAwareScrollView
      contentContainerStyle={styles.formScroll}
      showsVerticalScrollIndicator={false}
      bottomOffset={40}
    >
      <Text style={styles.introText}>
        Spot something wrong on a course page — an outdated website, the wrong par, a map link
        pointing to the wrong place? Search for it below and suggest a fix. An admin reviews
        every change before it goes live.
      </Text>

      <View style={styles.wrap}>
        <Text style={styles.label}>Find a course</Text>
        <View style={[styles.inputWrap, focused && styles.inputWrapFocus, selectedName && styles.inputWrapLocked]}>
          {selectedName ? (
            <Ionicons name="checkmark-circle" size={18} color={colors.brandPrimary} />
          ) : (
            <Ionicons name="search" size={18} color={colors.muted} />
          )}
          <TextInput
            value={query}
            onChangeText={handleChangeText}
            onFocus={() => setFocused(true)}
            onBlur={() => setTimeout(() => setFocused(false), 200)}
            placeholder="Search existing courses…"
            placeholderTextColor={colors.muted}
            testID="cer-edit-search"
            autoCapitalize="words"
            autoCorrect={false}
            style={styles.inlineInput}
          />
          {query.length > 0 ? (
            <Pressable
              hitSlop={8}
              onPress={() => {
                setQuery('');
                setSuggestions([]);
                setSelectedName(null);
              }}
              testID="cer-edit-clear"
            >
              <Ionicons name="close-circle" size={18} color={colors.muted} />
            </Pressable>
          ) : null}
        </View>

        {focused && !selectedName && query.trim().length >= 2 ? (
          <View style={styles.dropdown} testID="cer-edit-dropdown">
            {searching ? (
              <View style={styles.dropdownLoading}>
                <ActivityIndicator size="small" color={colors.brandPrimary} />
                <Text style={styles.dropdownLoadingText}>Searching…</Text>
              </View>
            ) : suggestions.length > 0 ? (
              suggestions.slice(0, 8).map((c) => (
                <Pressable
                  key={c.id || c.name}
                  onPress={() => pickCourse(c.name)}
                  style={({ pressed }) => [styles.suggestion, pressed && { backgroundColor: colors.surfaceSecondary }]}
                  testID={`cer-edit-hit-${c.name}`}
                >
                  <View style={styles.suggestionIcon}>
                    <Ionicons name="golf" size={16} color={colors.brandPrimary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.suggestionTitle} numberOfLines={1}>{c.name}</Text>
                    {c.city || c.region ? (
                      <Text style={styles.suggestionSub} numberOfLines={1}>
                        {[c.city, c.region].filter(Boolean).join(', ')}
                      </Text>
                    ) : null}
                  </View>
                </Pressable>
              ))
            ) : (
              <View style={styles.dropdownEmpty}>
                <Text style={styles.dropdownEmptyText}>
                  No matching course found. Only courses already in TeeBox can get edit suggestions —
                  use &quot;Add a Course&quot; if it&apos;s missing entirely.
                </Text>
              </View>
            )}
          </View>
        ) : null}
      </View>

      {loadingCourse ? (
        <ActivityIndicator color={colors.brandPrimary} style={{ marginTop: spacing.lg }} />
      ) : null}

      {selectedName && !loadingCourse ? (
        <>
          {success ? (
            <View style={styles.successBox} testID="edit-course-success">
              <Ionicons name="checkmark-circle" size={18} color={colors.brandPrimary} />
              <Text style={styles.successText}>
                Suggestion submitted! We&apos;ll notify you once an admin reviews it.
              </Text>
            </View>
          ) : null}
          {error ? <Text style={styles.errText} testID="edit-course-error">{error}</Text> : null}

          <Text style={styles.sectionLabel}>Edit any field that&apos;s wrong or outdated</Text>

          <TBInput label="Address" value={address} onChangeText={setAddress} testID="cer-edit-address" />
          <View style={styles.row2}>
            <TBInput label="Par" value={par} onChangeText={setPar} keyboardType="number-pad" testID="cer-edit-par" containerStyle={{ flex: 1 }} />
            <TBInput label="Number of holes" value={numHoles} onChangeText={setNumHoles} keyboardType="number-pad" testID="cer-edit-holes" containerStyle={{ flex: 1 }} />
          </View>
          <View style={styles.row2}>
            <TBInput label="City" value={city} onChangeText={setCity} testID="cer-edit-city" containerStyle={{ flex: 1 }} />
            <TBInput label="Region/State" value={region} onChangeText={setRegion} testID="cer-edit-region" containerStyle={{ flex: 1 }} />
          </View>
          <TBInput label="Country" value={country} onChangeText={setCountry} testID="cer-edit-country" />
          <TBInput label="Website" value={website} onChangeText={setWebsite} keyboardType="url" autoCapitalize="none" testID="cer-edit-website" />
          <View style={styles.row2}>
            <TBInput label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" testID="cer-edit-phone" containerStyle={{ flex: 1 }} />
            <TBInput label="Year built" value={yearBuilt} onChangeText={setYearBuilt} keyboardType="number-pad" testID="cer-edit-year" containerStyle={{ flex: 1 }} />
          </View>
          <TBInput label="Architect" value={architect} onChangeText={setArchitect} testID="cer-edit-architect" />
          <TBInput
            label="What's wrong / note for the reviewer (optional)"
            value={note}
            onChangeText={setNote}
            placeholder="e.g. Map link goes to the wrong town"
            multiline
            testID="cer-edit-note"
          />

          <TBButton
            label={saving ? 'Submitting…' : 'Submit suggested edit'}
            loading={saving}
            onPress={submit}
            testID="cer-edit-submit"
            style={{ marginTop: spacing.md }}
          />
        </>
      ) : null}
    </KeyboardAwareScrollView>
  );
}

// ---------------------------------------------------------------------------
// My Submissions
// ---------------------------------------------------------------------------
type MineItem = {
  key: string;
  kind: 'add' | 'edit';
  courseName: string;
  status: 'pending' | 'approved' | 'rejected';
  reason?: string | null;
  createdAt: string;
  changes?: Record<string, any>;
  subtitle?: string;
};

function statusMeta(status: MineItem['status']) {
  if (status === 'approved') return { label: 'Approved', bg: '#D6F1DE', fg: '#1B5E33', icon: 'checkmark-circle' as const };
  if (status === 'rejected') return { label: 'Rejected', bg: '#FDE2E1', fg: '#8B1D1A', icon: 'close-circle' as const };
  return { label: 'Pending review', bg: '#FEF3C7', fg: '#8B5A00', icon: 'time' as const };
}

function MineTab() {
  const [items, setItems] = useState<MineItem[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [adds, edits] = await Promise.all([
        api.myCourseSubmissions().catch(() => []),
        api.myCourseEditRequests().catch(() => []),
      ]);
      const merged: MineItem[] = [
        ...adds.map((c) => ({
          key: `add-${c.id}`,
          kind: 'add' as const,
          courseName: c.name,
          status: c.status,
          reason: c.rejected_reason,
          createdAt: c.created_at,
          subtitle: [c.city, c.region, c.country].filter(Boolean).join(', '),
        })),
        ...edits.map((e) => ({
          key: `edit-${e.id}`,
          kind: 'edit' as const,
          courseName: e.course_name,
          status: e.status,
          reason: e.reason,
          createdAt: e.created_at,
          changes: e.proposed_changes,
        })),
      ];
      merged.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
      setItems(merged);
    } catch {
      setItems([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  if (items === null) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.brandPrimary} size="large" />
      </View>
    );
  }

  if (items.length === 0) {
    return (
      <ScrollView
        contentContainerStyle={styles.centerScroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brandPrimary} />}
      >
        <View style={styles.emptyIcon}>
          <Ionicons name="document-text-outline" size={30} color={colors.muted} />
        </View>
        <Text style={styles.emptyTitle}>No submissions yet</Text>
        <Text style={styles.emptySub}>
          Course additions and edit suggestions you submit will show up here with their review status.
        </Text>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60, gap: spacing.md }}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brandPrimary} />}
    >
      {items.map((it) => {
        const meta = statusMeta(it.status);
        const changeEntries = Object.entries(it.changes || {});
        return (
          <View key={it.key} style={styles.mineCard} testID={`cer-mine-${it.key}`}>
            <View style={styles.mineHeaderRow}>
              <View style={styles.mineIcon}>
                <Ionicons name={it.kind === 'add' ? 'add-circle' : 'create'} size={16} color={colors.brandPrimary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.mineTitle} numberOfLines={1}>{it.courseName}</Text>
                <Text style={styles.mineSubtitle}>
                  {it.kind === 'add' ? 'New course submission' : 'Suggested edit'}
                  {it.subtitle ? ` · ${it.subtitle}` : ''}
                </Text>
              </View>
              <View style={[styles.statusPill, { backgroundColor: meta.bg }]}>
                <Ionicons name={meta.icon} size={12} color={meta.fg} />
                <Text style={[styles.statusPillText, { color: meta.fg }]}>{meta.label}</Text>
              </View>
            </View>

            {changeEntries.length > 0 ? (
              <View style={styles.changesBox}>
                {changeEntries.map(([field, val]) => (
                  <Text key={field} style={styles.changeLine}>
                    <Text style={styles.changeLabel}>{FIELD_LABELS[field] || field}: </Text>
                    {String(val)}
                  </Text>
                ))}
              </View>
            ) : null}

            {it.status === 'rejected' && it.reason ? (
              <Text style={styles.reasonText}>Reason: {it.reason}</Text>
            ) : null}

            <Text style={styles.mineDate}>{new Date(it.createdAt).toLocaleDateString()}</Text>
          </View>
        );
      })}
    </ScrollView>
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
  tabRow: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 9,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceTertiary,
  },
  tabBtnActive: { backgroundColor: colors.brandPrimary },
  tabText: { fontSize: 11.5, fontWeight: '800', color: colors.onSurface },
  tabTextActive: { color: '#fff' },
  formScroll: { padding: spacing.lg, paddingBottom: 80, gap: spacing.md },
  introText: { fontSize: 13.5, color: colors.muted, lineHeight: 19, marginBottom: spacing.xs },
  sectionLabel: { fontSize: 13, fontWeight: '800', color: colors.onSurface, marginTop: spacing.sm },
  row2: { flexDirection: 'row', gap: spacing.sm },
  successBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: '#D6F1DE',
    borderWidth: 1,
    borderColor: '#9FD8B5',
  },
  successText: { flex: 1, color: '#1B5E33', fontSize: 13, fontWeight: '700' },
  errText: { color: colors.error, fontSize: 13, fontWeight: '700' },
  wrap: { gap: 6 },
  label: { fontSize: 13, fontWeight: '700', color: colors.onSurface, letterSpacing: 0.2 },
  inputWrap: {
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
  inputWrapFocus: { borderColor: colors.brandPrimary, backgroundColor: colors.surface },
  inputWrapLocked: { borderColor: colors.brandPrimary, backgroundColor: '#F0FBF3' },
  inlineInput: { flex: 1, fontSize: 15, color: colors.onSurface, paddingVertical: 0 },
  dropdown: {
    marginTop: 4,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.soft,
    overflow: 'hidden',
  },
  dropdownLoading: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: spacing.md },
  dropdownLoadingText: { fontSize: 13, color: colors.muted },
  dropdownEmpty: { padding: spacing.md },
  dropdownEmptyText: { fontSize: 12.5, color: colors.muted, lineHeight: 17 },
  suggestion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  suggestionIcon: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    backgroundColor: colors.brandTertiary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  suggestionTitle: { fontSize: 14, fontWeight: '700', color: colors.onSurface },
  suggestionSub: { fontSize: 12, color: colors.muted, marginTop: 2 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  centerScroll: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.md },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: { fontSize: 17, fontWeight: '800', color: colors.onSurface },
  emptySub: { fontSize: 13.5, color: colors.muted, textAlign: 'center', maxWidth: 280 },
  mineCard: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
    ...shadow.soft,
  },
  mineHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  mineIcon: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    backgroundColor: colors.brandTertiary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mineTitle: { fontSize: 15, fontWeight: '800', color: colors.onSurface },
  mineSubtitle: { fontSize: 11.5, color: colors.muted, marginTop: 1 },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  statusPillText: { fontSize: 11, fontWeight: '800' },
  changesBox: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.sm,
    gap: 3,
  },
  changeLine: { fontSize: 12.5, color: colors.onSurface },
  changeLabel: { fontWeight: '800' },
  reasonText: { fontSize: 12.5, color: '#8B1D1A', fontWeight: '600' },
  mineDate: { fontSize: 11, color: colors.muted, fontWeight: '600' },
}));
