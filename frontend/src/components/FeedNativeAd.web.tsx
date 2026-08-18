import React from 'react';

/**
 * Web build of the feed ad slot.
 *
 * react-native-google-mobile-ads is a native-only module (iOS/Android), so
 * we never import it here — this keeps the web bundle free of any native
 * ad code and avoids bundler/runtime errors on react-native-web.
 */
export function FeedNativeAd(): React.ReactElement | null {
  return null;
}

export async function initAdMob(): Promise<void> {
  // No-op on web.
}
