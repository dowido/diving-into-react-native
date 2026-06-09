import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import { useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import AppTabs from '@/components/app-tabs';
import { NoInternetScreen } from '@/components/no-internet-screen';
import { useOfflineState } from '@/constants/ui-utils';

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const isOffline = useOfflineState();

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <AnimatedSplashOverlay />
        <AppTabs />
        {isOffline && <NoInternetScreen />}
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
