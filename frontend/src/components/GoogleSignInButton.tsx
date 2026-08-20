import React, { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View, ActivityIndicator } from 'react-native';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing } from '@/src/theme';
import { makeThemedSheet } from '@/src/theme';
import { useTheme } from '@/src/theme-context';
import { useAuth } from '@/src/auth-context';

// Required at module scope so Chrome Custom Tabs / ASWebAuthenticationSession
// dismisses cleanly on Android when the redirect fires. Without this the
// browser tab can stay open and the deep link falls through to the OS.
WebBrowser.maybeCompleteAuthSession();

// Emergent-managed Google OAuth entry URL. Handles the entire Google consent
// flow and redirects back with #session_id=... which we swap on the backend.
const EMERGENT_AUTH_URL = 'https://auth.emergentagent.com/';

function GoogleGlyph() {
  // Compact "G" mark styled to look like Google's logo without pulling in a
  // full SVG dependency. The gradient is faked with a two-tone ring.
  return (
    <View style={styles.glyph}>
      <Ionicons name="logo-google" size={18} color="#4285F4" />
    </View>
  );
}

type Props = {
  onError?: (msg: string) => void;
  testID?: string;
  label?: string;
};

/** Session-id helper — supports both hash (#session_id=…) and query (?session_id=…) forms. */
function extractSessionId(url: string | null): string | null {
  if (!url) return null;
  const match = url.match(/[#?&]session_id=([^&]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

export function GoogleSignInButton({ onError, testID, label = 'Continue with Google' }: Props) {
  useTheme();
  const { signInWithGoogleSession } = useAuth();
  const [busy, setBusy] = useState(false);

  const handlePress = async () => {
    if (busy) return;
    setBusy(true);
    // Register the Linking listener BEFORE opening the session — on Android,
    // Chrome Custom Tabs frequently returns `dismiss` with no URL even when
    // the deep link fired, so this listener is our primary source of truth,
    // not a fallback. (per Emergent playbook)
    let listenerUrl: string | null = null;
    const sub = Linking.addEventListener('url', (e) => {
      if (e?.url && /session_id=/.test(e.url)) listenerUrl = e.url;
    });
    try {
      const redirectUrl =
        Platform.OS === 'web'
          ? // On web, we return the user to the app root — the root layout
            // detects `#session_id=` on mount.
            (typeof window !== 'undefined' ? window.location.origin + '/' : '/')
          : // Empty path → `teebox://` — the app-scheme root. Using a named
            // path like `'auth'` produces `teebox://auth` which expo-router
            // treats as a route request and 404s when no matching file
            // exists. Root path is always safe.
            Linking.createURL('');
      const authUrl = `${EMERGENT_AUTH_URL}?redirect=${encodeURIComponent(redirectUrl)}`;

      if (Platform.OS === 'web') {
        if (typeof window !== 'undefined') window.location.href = authUrl;
        return; // full navigation; nothing else to do here
      }

      const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUrl);
      // Prefer the URL from the WebBrowser result. If Android returned
      // `dismiss` with no URL, fall back to whatever the Linking listener
      // captured, then to `getInitialURL()` as last resort.
      let callbackUrl: string | null =
        (result as any)?.url || listenerUrl || null;
      if (!callbackUrl) {
        try {
          callbackUrl = await Linking.getInitialURL();
        } catch {
          callbackUrl = null;
        }
      }
      const sessionId = extractSessionId(callbackUrl);
      if (!sessionId) {
        // Truly no session anywhere — either user cancelled or the flow
        // failed. Only surface an error if the WebBrowser reported success.
        if (result?.type === 'success') {
          onError?.('Google returned no session. Please try again.');
        }
        setBusy(false);
        return;
      }
      await signInWithGoogleSession(sessionId);
      // Router will pick up the auth state change and push to /(tabs).
    } catch (e: any) {
      onError?.(e?.message || 'Google sign-in failed. Please try again.');
    } finally {
      sub.remove();
      setBusy(false);
    }
  };

  return (
    <Pressable
      testID={testID || 'google-sign-in-button'}
      onPress={handlePress}
      style={({ pressed }) => [styles.btn, pressed && { opacity: 0.85 }]}
      disabled={busy}
    >
      <View style={styles.glyphWrap}>
        {busy ? <ActivityIndicator size="small" color="#1F1F1F" /> : <GoogleGlyph />}
      </View>
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

const styles = makeThemedSheet((colors: any) => StyleSheet.create({
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    minHeight: 48,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: colors.border,
  },
  glyphWrap: { width: 20, height: 20, alignItems: 'center', justifyContent: 'center' },
  glyph: { width: 20, height: 20, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 15, fontWeight: '700', color: '#1F1F1F', letterSpacing: 0.2 },
}));
