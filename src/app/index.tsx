import { Image } from 'expo-image';
import { SymbolView } from 'expo-symbols';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AnimatedIcon } from '@/components/animated-icon';
import { ISSTracker } from '@/components/iss-tracker';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Collapsible } from '@/components/ui/collapsible';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

// Curated NASA Astronomy image fallback in case API key is rate-limited or offline
const DEFAULT_APOD = {
  title: 'The Pillars of Creation',
  url: 'https://images-assets.nasa.gov/image/PIA15985/PIA15985~orig.jpg',
  explanation: 'Underneath a stellar nursery in the Eagle Nebula, majestic columns of cold gas and dust stand tall. Known as the Pillars of Creation, they are bathed in the blistering ultraviolet light of a cluster of young, hot stars. This image was captured by the Hubble Space Telescope.',
  copyright: 'NASA, ESA, STScI'
};

export default function HomeScreen() {
  const safeAreaInsets = useSafeAreaInsets();
  const theme = useTheme();

  // Insets config for scrolling
  const insets = {
    ...safeAreaInsets,
    bottom: safeAreaInsets.bottom + BottomTabInset + Spacing.three,
  };

  const contentPlatformStyle = Platform.select({
    android: {
      paddingTop: insets.top,
      paddingLeft: insets.left,
      paddingRight: insets.right,
      paddingBottom: insets.bottom,
    },
    ios: {
      paddingTop: insets.top,
      paddingLeft: insets.left,
      paddingRight: insets.right,
      paddingBottom: insets.bottom,
    },
    web: {
      paddingTop: Spacing.five,
      paddingBottom: Spacing.four,
    },
  });

  // Countdown timer for next space launch
  const [countdown, setCountdown] = useState({ hours: 4, minutes: 12, seconds: 30 });
  // APOD state
  const [apod, setApod] = useState(DEFAULT_APOD);
  const [loadingApod, setLoadingApod] = useState(true);
  const [liked, setLiked] = useState(false);
  const [likesCount, setLikesCount] = useState(124);

  // 1. Launch Countdown Effect
  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev.seconds > 0) {
          return { ...prev, seconds: prev.seconds - 1 };
        } else if (prev.minutes > 0) {
          return { ...prev, minutes: prev.minutes - 1, seconds: 59 };
        } else if (prev.hours > 0) {
          return { hours: prev.hours - 1, minutes: 59, seconds: 59 };
        } else {
          // Reset countdown to a new mock launch
          return { hours: 8, minutes: 45, seconds: 0 };
        }
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // 2. Fetch NASA APOD
  useEffect(() => {
    let active = true;
    const fetchApod = async () => {
      try {
        const response = await fetch(
          'https://api.nasa.gov/planetary/apod?api_key=DEMO_KEY'
        );
        if (!response.ok) throw new Error('Failed to fetch APOD');
        const data = await response.json();
        if (active && data.media_type === 'image' && data.url) {
          setApod({
            title: data.title || DEFAULT_APOD.title,
            url: data.url,
            explanation: data.explanation || DEFAULT_APOD.explanation,
            copyright: data.copyright || 'Public Domain'
          });
        }
      } catch (err) {
        console.log('APOD Fetch Error, using preset:', err);
      } finally {
        if (active) setLoadingApod(false);
      }
    };

    fetchApod();
    return () => {
      active = false;
    };
  }, []);

  const handleLike = () => {
    setLiked(!liked);
    setLikesCount((prev) => (liked ? prev - 1 : prev + 1));
  };

  const formatNumber = (num: number) => num.toString().padStart(2, '0');

  return (
    <ScrollView
      style={[styles.scrollView, { backgroundColor: theme.background }]}
      contentInset={insets}
      contentContainerStyle={[styles.contentContainer, contentPlatformStyle]}>
      <ThemedView style={styles.container}>
        
        {/* HERO SECTION */}
        <ThemedView style={styles.heroSection}>
          <AnimatedIcon />
          <View style={styles.heroTitleContainer}>
            <ThemedText type="subtitle" style={styles.heroTitle} themeColor="text">
              COSMIC DASHBOARD
            </ThemedText>
            <ThemedText style={styles.heroSubtitle} themeColor="textSecondary">
              Live Space Telemetry & Exploration Feed
            </ThemedText>
          </View>
        </ThemedView>

        {/* QUICK STATS GRID */}
        <View style={styles.statsGrid}>
          {/* Card 1: Next Launch */}
          <ThemedView type="backgroundElement" style={styles.statCard}>
            <ThemedText type="code" style={styles.statLabel} themeColor="textSecondary">
              NEXT LAUNCH (MOCK)
            </ThemedText>
            <ThemedText type="code" style={[styles.statBigValue, { color: theme.solarAmber }]}>
              {formatNumber(countdown.hours)}h {formatNumber(countdown.minutes)}m {formatNumber(countdown.seconds)}s
            </ThemedText>
            <ThemedText type="code" style={styles.statSublabel} themeColor="textSecondary">
              Falcon 9 • Starlink-104
            </ThemedText>
          </ThemedView>

          {/* Card 2: Humans in Space */}
          <ThemedView type="backgroundElement" style={styles.statCard}>
            <ThemedText type="code" style={styles.statLabel} themeColor="textSecondary">
              HUMANS IN SPACE
            </ThemedText>
            <ThemedText type="subtitle" style={styles.statBigValue} themeColor="text">
              12
            </ThemedText>
            <ThemedText type="code" style={styles.statSublabel} themeColor="textSecondary">
              7 on ISS • 5 on Tiangong
            </ThemedText>
          </ThemedView>

          {/* Card 3: Active Satellites */}
          <ThemedView type="backgroundElement" style={styles.statCard}>
            <ThemedText type="code" style={styles.statLabel} themeColor="textSecondary">
              ACTIVE SATELLITES
            </ThemedText>
            <ThemedText type="subtitle" style={styles.statBigValue} themeColor="text">
              9,842
            </ThemedText>
            <ThemedText type="code" style={styles.statSublabel} themeColor="neonTeal">
              +14 launched today
            </ThemedText>
          </ThemedView>
        </View>

        {/* ISS RADAR COMPONENT */}
        <ISSTracker />

        {/* APOD SECTION */}
        <ThemedView style={[styles.sectionCard, { backgroundColor: theme.cardBackground, borderColor: theme.backgroundElement }]}>
          <View style={styles.sectionHeader}>
            <SymbolView
              name={{ ios: 'photo.on.rectangle.angled', android: 'image', web: 'image' }}
              size={14}
              tintColor={theme.solarAmber}
            />
            <ThemedText type="smallBold" style={styles.sectionTitle} themeColor="text">
              ASTRONOMY IMAGE OF THE DAY
            </ThemedText>
          </View>

          {loadingApod ? (
            <View style={styles.apodLoading}>
              <ActivityIndicator size="small" color={theme.cosmicIndigo} />
              <ThemedText type="code" style={styles.loadingText} themeColor="textSecondary">
                Fetching NASA Feed...
              </ThemedText>
            </View>
          ) : (
            <View style={styles.apodContent}>
              <Image
                source={{ uri: apod.url }}
                style={styles.apodImage}
                contentFit="cover"
                transition={300}
              />
              <View style={styles.apodDescriptionRow}>
                <View style={{ flex: 1 }}>
                  <ThemedText type="default" style={styles.apodTitle} themeColor="text">
                    {apod.title}
                  </ThemedText>
                  {apod.copyright && (
                    <ThemedText type="code" style={styles.apodCopyright} themeColor="textSecondary">
                      © {apod.copyright}
                    </ThemedText>
                  )}
                </View>
                
                {/* LIKE ACTION */}
                <Pressable onPress={handleLike} style={styles.likeButton}>
                  <SymbolView
                    name={liked ? { ios: 'heart.fill', android: 'favorite', web: 'favorite' } : { ios: 'heart', android: 'favorite_border', web: 'favorite_border' }}
                    size={16}
                    tintColor={liked ? '#f43f5e' : theme.textSecondary}
                  />
                  <ThemedText type="code" style={[styles.likeText, liked && { color: '#f43f5e' }]} themeColor="textSecondary">
                    {likesCount}
                  </ThemedText>
                </Pressable>
              </View>

              <Collapsible title="Read Image Explanation">
                <ThemedText type="small" style={styles.apodExplanation} themeColor="textSecondary">
                  {apod.explanation}
                </ThemedText>
              </Collapsible>
            </View>
          )}
        </ThemedView>

      </ThemedView>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  container: {
    maxWidth: MaxContentWidth,
    flexGrow: 1,
    paddingHorizontal: Spacing.four,
    gap: Spacing.four,
    alignItems: 'stretch',
  },
  heroSection: {
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.four,
  },
  heroTitleContainer: {
    alignItems: 'center',
    gap: Spacing.one,
  },
  heroTitle: {
    textAlign: 'center',
    fontWeight: 'bold',
    letterSpacing: 1.5,
  },
  heroSubtitle: {
    textAlign: 'center',
    fontSize: 14,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: Spacing.two,
    flexWrap: 'wrap',
  },
  statCard: {
    flex: 1,
    minWidth: 150,
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.four,
    gap: Spacing.two,
  },
  statLabel: {
    fontSize: 9,
    letterSpacing: 0.5,
  },
  statBigValue: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  statSublabel: {
    fontSize: 10,
  },
  sectionCard: {
    borderRadius: Spacing.three,
    borderWidth: 1,
    padding: Spacing.three,
    gap: Spacing.three,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  sectionTitle: {
    fontSize: 12,
    letterSpacing: 1,
  },
  apodLoading: {
    height: 180,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  loadingText: {
    fontSize: 11,
  },
  apodContent: {
    gap: Spacing.three,
  },
  apodImage: {
    width: '100%',
    height: 220,
    borderRadius: Spacing.two,
  },
  apodDescriptionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: Spacing.two,
  },
  apodTitle: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  apodCopyright: {
    fontSize: 10,
    marginTop: 2,
  },
  likeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.two,
    borderRadius: Spacing.two,
    borderWidth: 1,
    borderColor: 'rgba(128,128,128,0.15)',
  },
  likeText: {
    fontSize: 11,
    fontWeight: 'bold',
  },
  apodExplanation: {
    fontSize: 13,
    lineHeight: 18,
  },
});
