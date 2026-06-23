import {
  Tabs,
  TabList,
  TabTrigger,
  TabSlot,
  TabTriggerSlotProps,
  TabListProps,
} from 'expo-router/ui';
import { SymbolView } from 'expo-symbols';
import { Pressable, useColorScheme, View, StyleSheet } from 'react-native';

import { ExternalLink } from './external-link';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

import { Colors, MaxContentWidth, Spacing } from '@/constants/theme';

export default function AppTabs() {
  return (
    <Tabs>
      <TabSlot style={{ height: '100%' }} />
      <TabList asChild>
        <CustomTabList>
          <TabTrigger name="home" href="/" asChild>
            <TabButton>Live Timing</TabButton>
          </TabTrigger>
          <TabTrigger name="pitwall" href="/pitwall" asChild>
            <TabButton>Pit Wall</TabButton>
          </TabTrigger>
          <TabTrigger name="standings" href="/standings" asChild>
            <TabButton>Standings</TabButton>
          </TabTrigger>
          <TabTrigger name="replay" href="/replay" asChild>
            <TabButton>Lap Times</TabButton>
          </TabTrigger>
        </CustomTabList>
      </TabList>
    </Tabs>
  );
}

export function TabButton({ children, isFocused, ...props }: TabTriggerSlotProps) {
  return (
    <Pressable {...props} style={({ pressed }) => pressed && styles.pressed}>
      <ThemedView
        type={isFocused ? 'backgroundSelected' : 'backgroundElement'}
        style={[styles.tabButtonView, isFocused && styles.tabButtonFocused]}
      >
        <ThemedText type="small" themeColor={isFocused ? 'text' : 'textSecondary'}>
          {children}
        </ThemedText>
        {isFocused && <View style={styles.activePip} />}
      </ThemedView>
    </Pressable>
  );
}

export function CustomTabList(props: TabListProps) {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'unspecified' ? 'light' : (scheme ?? 'dark')];

  return (
    <View {...props} style={styles.tabListContainer}>
      <ThemedView type="backgroundElement" style={styles.innerContainer}>
        {/* Brand */}
        <View style={styles.brandBlock}>
          <View style={styles.brandPip} />
          <ThemedText type="smallBold" style={styles.brandText}>
            Artello F1
          </ThemedText>
        </View>

        {props.children}

        <ExternalLink href="https://openf1.org" asChild>
          <Pressable style={styles.externalPressable}>
            <ThemedText type="link">OpenF1 API</ThemedText>
            <SymbolView
              tintColor={colors.text}
              name={{ ios: 'arrow.up.right.square', web: 'link' }}
              size={12}
            />
          </Pressable>
        </ExternalLink>
      </ThemedView>
    </View>
  );
}

const styles = StyleSheet.create({
  tabListContainer: {
    position: 'absolute',
    width: '100%',
    padding: Spacing.three,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    top: 0,
  },
  innerContainer: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.four,
    borderRadius: 40,
    flexDirection: 'row',
    alignItems: 'center',
    flexGrow: 1,
    gap: Spacing.two,
    maxWidth: MaxContentWidth,
  },
  brandBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginRight: 'auto' as any,
  },
  brandPip: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#E10600',
  },
  brandText: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  pressed: {
    opacity: 0.7,
  },
  tabButtonView: {
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.three,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  tabButtonFocused: {
    paddingBottom: 3,
  },
  activePip: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E10600',
    marginLeft: 2,
  },
  externalPressable: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.one,
    marginLeft: Spacing.three,
  },
});
