import React, { useState } from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import { BannerAd, BannerAdSize } from 'react-native-google-mobile-ads';

import { AD_UNIT_IDS, ADS_SUPPORTED } from '@/src/config/adsConfig';

/**
 * Anchored adaptive banner ad. Renders nothing if ads aren't supported
 * (Expo Go/web) or if the request fails to fill — never reserves layout
 * space it can't use.
 */
export function AdBanner({ style }: { style?: ViewStyle }): React.ReactElement | null {
  const [failed, setFailed] = useState(false);

  if (!ADS_SUPPORTED || failed) return null;

  return (
    <View style={[styles.wrap, style]} testID="ad-banner">
      <BannerAd
        unitId={AD_UNIT_IDS.banner}
        size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
        onAdFailedToLoad={(e) => {
          console.warn('[AdMob] banner failed to load (non-fatal):', e);
          setFailed(true);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
