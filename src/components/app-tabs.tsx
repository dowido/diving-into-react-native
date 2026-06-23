import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { useColorScheme } from 'react-native';

import { Colors } from '@/constants/theme';

export default function AppTabs() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'unspecified' ? 'light' : (scheme ?? 'dark')];

  return (
    <NativeTabs
      backgroundColor={colors.background}
      indicatorColor={colors.primary}
      labelStyle={{ selected: { color: colors.text } }}
    >
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Live Timing</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf="timer"
          md="timer"
          src={require('@/assets/images/tabIcons/home.png')}
          renderingMode="template"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="pitwall">
        <NativeTabs.Trigger.Label>Pit Wall</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf="chart.line.uptrend.xyaxis"
          md="monitor"
          src={require('@/assets/images/tabIcons/explore.png')}
          renderingMode="template"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="standings">
        <NativeTabs.Trigger.Label>Standings</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf="trophy.fill"
          md="emoji_events"
          src={require('@/assets/images/tabIcons/standings.png')}
          renderingMode="template"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="replay">
        <NativeTabs.Trigger.Label>Lap Times</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf="stopwatch.fill"
          md="timer"
          src={require('@/assets/images/tabIcons/replay.png')}
          renderingMode="template"
        />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
