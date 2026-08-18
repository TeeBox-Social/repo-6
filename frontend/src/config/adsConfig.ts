import Constants from 'expo-constants';
import { Platform } from 'react-native';

/**
 * Central AdMob configuration.
 *
 * Real (production) IDs are from TeeBox's AdMob account (Android only for
 * now — no iOS AdMob app has been registered yet). iOS falls back to
 * Google's official Test IDs until a real iOS app + ad units exist.
 *
 * IMPORTANT: react-native-google-mobile-ads is a native module. It does NOT
 * exist inside Expo Go (no custom native code there), so any ad component
 * MUST check `ADS_SUPPORTED` before touching the native SDK/UI — otherwise
 * it risks crashing the whole app for Expo Go users. Ads only actually
 * render inside a development/production build (EAS build / Publish).
 */

// Real Android ad unit IDs (TeeBox AdMob account).
const ANDROID_BANNER_UNIT_ID = 'ca-app-pub-1035050955026373/1784913397';
const ANDROID_NATIVE_UNIT_ID = 'ca-app-pub-1035050955026373/1152948499';

// Google's official public Test IDs — safe to ship, never earn/spend money.
// https://developers.google.com/admob/android/test-ads
const TEST_BANNER_UNIT_ID = 'ca-app-pub-3940256099942544/6300978111';
const TEST_NATIVE_UNIT_ID = 'ca-app-pub-3940256099942544/2247696110';

// Detect Expo Go — the native ads module is unavailable there.
const isExpoGo = Constants.appOwnership === 'expo';
const isNativePlatform = Platform.OS === 'ios' || Platform.OS === 'android';

/** True only when it is safe to load/render real AdMob native UI. */
export const ADS_SUPPORTED = isNativePlatform && !isExpoGo;

// Use test units in dev, and on iOS until real iOS AdMob IDs are added.
export const AD_UNIT_IDS = {
  banner:
    Platform.OS === 'android'
      ? (__DEV__ ? TEST_BANNER_UNIT_ID : ANDROID_BANNER_UNIT_ID)
      : TEST_BANNER_UNIT_ID,
  native:
    Platform.OS === 'android'
      ? (__DEV__ ? TEST_NATIVE_UNIT_ID : ANDROID_NATIVE_UNIT_ID)
      : TEST_NATIVE_UNIT_ID,
};
