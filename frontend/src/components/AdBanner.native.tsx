import React, { useState } from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import { BannerAd, BannerAdSize } from 'react-native-google-mobile-ads';

import { AD_UNIT_IDS, ADS_SUPPORTED } from '@/src/config/adsConfig';
import { usePremium } from '@/src/hooks/usePremium';

/**
 * Anchored adaptive banner ad. Renders nothing if ads aren't supported
 * (Expo Go/web), if the request fails to fill, or if the current user is
 * a premium subscriber — never reserves layout space it can't use.
 */
export function AdBanner({ style }: { style?: ViewStyle }): React.ReactElement | null {
  const [failed, setFailed] = useState(false);
  const isPremium = usePremium();

  if (!ADS_SUPPORTED || failed || isPremium) return null;

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
