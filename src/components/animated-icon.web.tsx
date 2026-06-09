/**
 * AnimatedSplashOverlay — Web fallback
 *
 * Uses CSS stroke-dashoffset animation to simulate the Skia
 * path-drawing effect without any native dependencies.
 *
 * The circuit path is identical to the native version (Monaco-inspired).
 */

import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

const CIRCUIT_PATH = 'M 30 130 L 50 130 C 90 130, 110 110, 110 90 C 110 70, 90 55, 70 55 C 50 55, 38 65, 38 80 C 38 95, 50 100, 65 100 L 190 100 C 220 100, 240 85, 240 65 C 240 45, 220 30, 195 30 L 120 30 C 100 30, 85 42, 85 58';

// Approximate path length for stroke-dasharray
const PATH_LENGTH = 780;

export function AnimatedSplashOverlay() {
  const [visible, setVisible] = useState(true);
  const [dashOffset, setDashOffset] = useState(PATH_LENGTH);

  const containerOpacity = useSharedValue(1);
  const containerScale   = useSharedValue(1);

  useEffect(() => {
    // Animate stroke draw via CSS after a single frame
    const rafId = requestAnimationFrame(() => {
      setDashOffset(0);
    });

    // M3 Container Transform exit at 1.4s
    containerScale.value = withDelay(
      1400,
      withTiming(1.06, { duration: 400, easing: Easing.bezier(0.2, 0, 0, 1) })
    );
    containerOpacity.value = withDelay(
      1400,
      withTiming(0, { duration: 400, easing: Easing.bezier(0.2, 0, 0, 1) })
    );

    const timer = setTimeout(() => setVisible(false), 1900);

    return () => {
      cancelAnimationFrame(rafId);
      clearTimeout(timer);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const containerStyle = useAnimatedStyle(() => ({
    opacity:   containerOpacity.value,
    transform: [{ scale: containerScale.value }],
  }));

  if (!visible) return null;

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.overlay, containerStyle]}>
      <View style={styles.canvasWrapper}>
        {/* @ts-ignore — web-only SVG JSX */}
        <svg
          width="300"
          height="160"
          viewBox="0 0 270 160"
          style={{ display: 'block' }}
        >
          {/* Glow layer */}
          {/* @ts-ignore */}
          <path
            d={CIRCUIT_PATH}
            fill="none"
            stroke="#FF444455"
            strokeWidth="12"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={PATH_LENGTH}
            strokeDashoffset={dashOffset}
            style={{
              transition: `stroke-dashoffset 1.2s cubic-bezier(0.4, 0, 0.2, 1)`,
              filter: 'blur(6px)',
            }}
          />
          {/* Main stroke */}
          {/* @ts-ignore */}
          <path
            d={CIRCUIT_PATH}
            fill="none"
            stroke="#E10600"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={PATH_LENGTH}
            strokeDashoffset={dashOffset}
            style={{
              transition: `stroke-dashoffset 1.2s cubic-bezier(0.4, 0, 0.2, 1)`,
            }}
          />
        </svg>
      </View>

      <Animated.Text style={styles.brand}>ARTELLO F1</Animated.Text>
      <Animated.Text style={styles.sub}>PITWALL · TELEMETRY · TIMING</Animated.Text>
    </Animated.View>
  );
}

export function AnimatedIcon() {
  return null;
}

const styles = StyleSheet.create({
  overlay: {
    backgroundColor: '#0F0F11',
    zIndex: 1000,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
  } as any,
  canvasWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  brand: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 6,
    textAlign: 'center',
  } as any,
  sub: {
    color: '#94a3b8',
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 3,
    textAlign: 'center',
  } as any,
});
