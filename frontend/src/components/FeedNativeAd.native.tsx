import React, { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import mobileAds, {
  MaxAdContentRating,
  NativeAd,
  NativeAdView,
  NativeAsset,
  NativeAssetType,
  NativeMediaView,
} from 'react-native-google-mobile-ads';

import { colors, radius, shadow, spacing } from '@/src/theme';
import { AD_UNIT_IDS, ADS_SUPPORTED } from '@/src/config/adsConfig';
import { usePremium } from '@/src/hooks/usePremium';

/**
 * Initializes the Google Mobile Ads SDK once per app session.
 * No-op when running inside Expo Go or on web — the native module
 * doesn't exist there and touching it can crash the JS thread.
 */
export async function initAdMob(): Promise<void> {
  if (!ADS_SUPPORTED) return;
  try {
    await mobileAds().setRequestConfiguration({
      maxAdContentRating: MaxAdContentRating.PG,
      tagForChildDirectedTreatment: false,
      tagForUnderAgeOfConsent: false,
    });
    await mobileAds().initialize();
  } catch (e) {
    console.warn('[AdMob] SDK init failed (non-fatal):', e);
  }
}

/**
 * A native (feed-style) ad card, styled to sit inline with round posts.
 * Renders nothing (returns null) if ads aren't supported (Expo Go/web) or
 * if no fill was returned for this request — never blocks the feed.
 */
export function FeedNativeAd(): React.ReactElement | null {
  const [ad, setAd] = useState<NativeAd | null>(null);
  const [failed, setFailed] = useState(false);
  const isPremium = usePremium();

  useEffect(() => {
    if (!ADS_SUPPORTED || isPremium) return;
    let current: NativeAd | undefined;
    let cancelled = false;

    NativeAd.createForAdRequest(AD_UNIT_IDS.native)
      .then((loaded) => {
        if (cancelled) {
          loaded.destroy();
          return;
        }
        current = loaded;
        setAd(loaded);
      })
      .catch((e) => {
        console.warn('[AdMob] native ad failed to load (non-fatal):', e);
        setFailed(true);
      });

    return () => {
      cancelled = true;
      current?.destroy();
    };
  }, [isPremium]);

  if (!ADS_SUPPORTED || failed || isPremium || !ad) return null;

  return (
    <NativeAdView nativeAd={ad} style={styles.card}>
      <View style={styles.headerRow}>
        {ad.icon ? (
          <Image source={{ uri: ad.icon.url }} style={styles.icon} />
        ) : (
          <View style={[styles.icon, styles.iconFallback]} />
        )}
        <View style={{ flex: 1 }}>
          <NativeAsset assetType={NativeAssetType.HEADLINE}>
            <Text style={styles.headline} numberOfLines={2}>
              {ad.headline}
            </Text>
          </NativeAsset>
          <Text style={styles.sponsored}>Sponsored</Text>
        </View>
      </View>

      <NativeMediaView style={styles.media} resizeMode="cover" />

      {ad.body ? (
        <NativeAsset assetType={NativeAssetType.BODY}>
          <Text style={styles.body} numberOfLines={2}>
            {ad.body}
          </Text>
        </NativeAsset>
      ) : null}

      {ad.callToAction ? (
        <NativeAsset assetType={NativeAssetType.CALL_TO_ACTION}>
          <View style={styles.ctaButton}>
            <Text style={styles.ctaText}>{ad.callToAction}</Text>
          </View>
        </NativeAsset>
      ) : null}
    </NativeAdView>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    ...shadow.card,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    marginRight: spacing.sm,
  },
  iconFallback: {
    backgroundColor: colors.surfaceTertiary,
  },
  headline: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.onSurface,
  },
  sponsored: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.muted,
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  media: {
    width: '100%',
    height: 180,
    borderRadius: radius.md,
    marginBottom: spacing.sm,
    backgroundColor: colors.surfaceTertiary,
  },
  body: {
    fontSize: 13,
    color: colors.onSurfaceTertiary,
    marginBottom: spacing.md,
  },
  ctaButton: {
    backgroundColor: colors.brandPrimary,
    borderRadius: radius.pill,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  ctaText: {
    color: colors.onBrandPrimary,
    fontWeight: '800',
    fontSize: 14,
  },
});
