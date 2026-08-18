import React from 'react';
import { ViewStyle } from 'react-native';

/**
 * Web build of the banner ad slot — always a no-op. AdMob's native module
 * doesn't exist on react-native-web; a real web ad product (e.g. AdSense)
 * would be wired in separately if/when needed.
 */
export function AdBanner(_props: { style?: ViewStyle }): React.ReactElement | null {
  return null;
}
