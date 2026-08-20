import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import * as Linking from 'expo-linking';
import { Redirect } from 'expo-router';

import { colors, spacing } from '@/src/theme';
import { makeThemedSheet } from '@/src/theme';
import { useTheme } from '@/src/theme-context';
import { useAuth } from '@/src/auth-context';

/**
 * Google OAuth callback landing route.
 *
 * The Emergent-managed Google flow redirects the user back to
 * `teebox://auth#session_id=...`. Before this file existed, expo-router
 * showed its built-in "Unmatched Route — teebox://auth" 404 because the
 * path had no matching file. Users could still finish signing in by tapping
 * "Go back" (which let the root `<Linking>` listener finally fire), but the
 * flash of the 404 was terrible UX.
 *
 * This route:
 *   1. Parses `session_id` out of the URL (hash *or* query — Emergent returns
 *      it in the hash fragment which `Linking.parse().queryParams` cannot see).
 *   2. Calls `signInWithGoogleSession()` on the auth-context (which itself is
 *      guarded against duplicate submissions by the parent `_layout.tsx`
 *      listener that also fires for the same deep link on Android).
 *   3. Redirects to `/(tabs)` as soon as the user object appears in auth
 *      state, or bounces to `/(auth)/sign-in` if the session exchange fails.
 *
 * We also serve as a defensive route for any deployed build that still uses
 * the older `Linking.createURL('auth')` redirect target — even after the
 * `GoogleSignInButton` change to use `Linking.createURL('')`, this stays as
 * a safety net so future URL scheme changes never regress into a 404.
 */
export default function AuthCallback() {
  useTheme();
  const { user, signInWithGoogleSession } = useAuth();
  const [errored, setErrored] = useState(false);
  const submittedRef = useRef(false);

  useEffect(() => {
    if (submittedRef.current) return;
    (async () => {
      try {
        const url = await Linking.getInitialURL();
        const raw = url || '';
        // Emergent returns session_id in the hash fragment — match the raw
        // string so we catch both `#session_id=` and `?session_id=` forms.
        const m = raw.match(/[#?&]session_id=([^&#]+)/);
        if (!m) {
          setErrored(true);
          return;
        }
        submittedRef.current = true;
        const sessionId = decodeURIComponent(m[1]);
        await signInWithGoogleSession(sessionId);
      } catch {
        setErrored(true);
      }
    })();
  }, [signInWithGoogleSession]);

  // Fast path: parent `_layout.tsx` Linking listener may have already
  // exchanged the same session_id and populated `user`.
  if (user) return <Redirect href="/(tabs)" />;
  if (errored) return <Redirect href="/(auth)/sign-in" />;

  return (
    <View style={styles.container} testID="auth-callback-screen">
      <ActivityIndicator size="large" color={colors.brandPrimary} />
      <Text style={styles.hint}>Signing you in…</Text>
    </View>
  );
}

const styles = makeThemedSheet((colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
  },
  hint: {
    fontSize: 14,
    color: colors.muted,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
}));
