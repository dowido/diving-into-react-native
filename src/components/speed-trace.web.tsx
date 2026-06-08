import React, { useMemo } from 'react';
import { View } from 'react-native';

interface CarDataFrame {
  speed: number;
  [key: string]: any;
}

interface SpeedTraceProps {
  frames: CarDataFrame[];
  currentIndex: number;
  color: string;
  width: number;
  height: number;
}

export default function SpeedTrace({ frames, currentIndex, color, width, height }: SpeedTraceProps) {
  const path = useMemo(() => {
    if (frames.length === 0) return '';
    const maxSpeed = 350;
    const step = width / (frames.length - 1);
    let d = `M 0 ${height - (frames[0].speed / maxSpeed) * height}`;
    frames.slice(1).forEach((f, i) => {
      const x = (i + 1) * step;
      const y = height - (f.speed / maxSpeed) * height;
      d += ` L ${x} ${y}`;
    });
    return d;
  }, [frames, width, height]);

  const currentX = useMemo(() => {
    if (frames.length === 0) return 0;
    const step = width / (frames.length - 1);
    return currentIndex * step;
  }, [currentIndex, frames.length, width]);

  const currentY = useMemo(() => {
    if (frames.length === 0 || !frames[currentIndex]) return 0;
    const maxSpeed = 350;
    return height - (frames[currentIndex].speed / maxSpeed) * height;
  }, [currentIndex, frames, height]);

  return (
    <View style={{ width, height }}>
      <svg width={width} height={height} style={{ display: 'block' }}>
        <path d={path} fill="none" stroke={color} strokeWidth={2} />
        {frames.length > 0 && (
          <circle cx={currentX} cy={currentY} r={4} fill="#ffffff" />
        )}
      </svg>
    </View>
  );
}
