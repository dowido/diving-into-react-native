/**
 * AnimatedSplashOverlay — Native (Skia)
 *
 * Renders a Skia canvas on a pitch-black (#0F0F11) background.
 * A GP circuit centerline (Monaco-inspired bezier spline) draws itself
 * from 0 → 1 using an animated Path `start/end` value over ~1.2s.
 *
 * On completion → M3 Container Transform:
 *   - Canvas scales 1.0 → 1.06, opacity 1 → 0 over 400ms
 *   - Emphasized easing: Easing.bezier(0.2, 0, 0, 1)
 */

import { Canvas, Path } from '@shopify/react-native-skia';
import { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

// ─── Monaco-inspired circuit spline ──────────────────────────────────────────
// Hardcoded SVG path for splash reliability (no network needed)

const CIRCUIT_SVG =
  'M 30 130 L 50 130 C 90 130 110 110 110 90 C 110 70 90 55 70 55 ' +
  'C 50 55 38 65 38 80 C 38 95 50 100 65 100 L 190 100 ' +
  'C 220 100 240 85 240 65 C 240 45 220 30 195 30 L 120 30 ' +
  'C 100 30 85 42 85 58';

// ─── Component ────────────────────────────────────────────────────────────────

export function AnimatedSplashOverlay() {
  const [visible, setVisible] = useState(true);

  // Animated stroke end value (0 → 1 draws the path)
  const strokeEnd = useSharedValue(0);

  // Container Transform exit
  const containerOpacity = useSharedValue(1);
  const containerScale   = useSharedValue(1);

  const dismiss = () => setVisible(false);

  useEffect(() => {
    // Phase 1: Draw the circuit line over 1.2s
    strokeEnd.value = withTiming(1, {
      duration: 1200,
      easing: Easing.bezier(0.4, 0, 0.2, 1),
    });

    // Phase 2: M3 Container Transform exit at 1.4s
    containerScale.value = withDelay(
      1400,
      withTiming(1.06, {
        duration: 400,
        easing: Easing.bezier(0.2, 0, 0, 1),
      })
    );
    containerOpacity.value = withDelay(
      1400,
      withTiming(0, {
        duration: 400,
        easing: Easing.bezier(0.2, 0, 0, 1),
      }, (finished) => {
        if (finished) runOnJS(dismiss)();
      })
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const containerStyle = useAnimatedStyle(() => ({
    opacity:   containerOpacity.value,
    transform: [{ scale: containerScale.value }],
  }));

  if (!visible) return null;

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.overlay, containerStyle]}>
      {/* Skia circuit draw */}
      <Canvas style={styles.canvas}>
        {/* Glow layer */}
        <Path
          path={CIRCUIT_SVG}
          style="stroke"
          strokeWidth={12}
          color="#FF444411"
          strokeCap="round"
          strokeJoin="round"
          start={0}
          end={strokeEnd}
        />
        {/* Main stroke */}
        <Path
          path={CIRCUIT_SVG}
          style="stroke"
          strokeWidth={3}
          color="#E10600"
          strokeCap="round"
          strokeJoin="round"
          start={0}
          end={strokeEnd}
        />
      </Canvas>

      {/* Brand wordmark */}
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
  },
  canvas: {
    width: 300,
    height: 160,
  },
  brand: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 6,
    textAlign: 'center',
  },
  sub: {
    color: '#94a3b8',
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 3,
    textAlign: 'center',
  },
});
