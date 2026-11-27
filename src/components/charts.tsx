import React, { useMemo, useState } from 'react';
import { LayoutChangeEvent, View } from 'react-native';
import Svg, { Circle, Defs, G, Line, LinearGradient, Path, Stop } from 'react-native-svg';
import { SeriesPoint } from '../lib/calc';
import { useTheme } from './theme';

export interface LineChartProps {
  data: SeriesPoint[];
  height?: number;
  color?: string;
  /** Called with the scrubbed point, or null when the finger lifts. */
  onScrub?: (p: SeriesPoint | null) => void;
}

/** Smooth area line chart with touch scrubbing. */
export function LineChart({ data, height = 180, color, onScrub }: LineChartProps) {
  const t = useTheme();
  const stroke = color ?? t.brand;
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState<number | null>(null);
  const pad = 8;

  const pts = useMemo(() => {
    // a single point still draws as a flat line
    const series = data.length === 1 ? [{ ...data[0], t: data[0].t - 86400000 }, data[0]] : data;
    if (series.length < 2 || width === 0) return [];
    const t0 = series[0].t;
    const t1 = series[series.length - 1].t;
    let min = Math.min(...series.map((p) => p.value));
    let max = Math.max(...series.map((p) => p.value));
    if (min === max) {
      min -= Math.abs(min) * 0.1 || 1;
      max += Math.abs(max) * 0.1 || 1;
    }
    return series.map((p) => ({
      x: pad + ((p.t - t0) / (t1 - t0 || 1)) * (width - pad * 2),
      y: pad + (1 - (p.value - min) / (max - min)) * (height - pad * 2),
      p,
    }));
  }, [data, width, height]);

  const line = useMemo(() => {
    if (!pts.length) return '';
    let d = `M${pts[0].x},${pts[0].y}`;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      const mx = (a.x + b.x) / 2;
      d += ` C${mx},${a.y} ${mx},${b.y} ${b.x},${b.y}`;
    }
    return d;
  }, [pts]);

  const area = pts.length ? `${line} L${pts[pts.length - 1].x},${height} L${pts[0].x},${height} Z` : '';

  const handle = (x: number) => {
    if (!pts.length) return;
    let best = 0;
    for (let i = 1; i < pts.length; i++) if (Math.abs(pts[i].x - x) < Math.abs(pts[best].x - x)) best = i;
    setActive(best);
    onScrub?.(pts[best].p);
  };
  const end = () => {
    setActive(null);
    onScrub?.(null);
  };

  const a = active != null ? pts[active] : null;

  return (
    <View
      style={{ height }}
      onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderTerminationRequest={() => false}
      onResponderGrant={(e) => handle(e.nativeEvent.locationX)}
      onResponderMove={(e) => handle(e.nativeEvent.locationX)}
      onResponderRelease={end}
      onResponderTerminate={end}
    >
      {width > 0 && pts.length > 0 ? (
        <Svg width={width} height={height}>
          <Defs>
            <LinearGradient id="fill" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={stroke} stopOpacity={0.28} />
              <Stop offset="1" stopColor={stroke} stopOpacity={0} />
            </LinearGradient>
          </Defs>
          <Path d={area} fill="url(#fill)" />
          <Path d={line} stroke={stroke} strokeWidth={2.5} fill="none" strokeLinecap="round" />
          {a ? (
            <G>
              <Line x1={a.x} x2={a.x} y1={0} y2={height} stroke={t.textMuted} strokeDasharray="4 4" strokeWidth={1} />
              <Circle cx={a.x} cy={a.y} r={5} fill={stroke} stroke={t.card} strokeWidth={2} />
            </G>
          ) : (
            <Circle cx={pts[pts.length - 1].x} cy={pts[pts.length - 1].y} r={4} fill={stroke} />
          )}
        </Svg>
      ) : null}
    </View>
  );
}

export interface DonutSlice {
  value: number;
  color: string;
}

export function Donut({ slices, size = 160, thickness = 22, children }: { slices: DonutSlice[]; size?: number; thickness?: number; children?: React.ReactNode }) {
  const t = useTheme();
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const total = slices.reduce((s, x) => s + Math.max(0, x.value), 0);
  let offset = 0;
  const gap = slices.length > 1 ? 2 : 0;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
        <G>
          <Circle cx={size / 2} cy={size / 2} r={r} stroke={t.cardAlt} strokeWidth={thickness} fill="none" />
          {total > 0 &&
            slices.map((s, i) => {
              const len = (Math.max(0, s.value) / total) * c;
              const el = (
                <Circle
                  key={i}
                  cx={size / 2}
                  cy={size / 2}
                  r={r}
                  stroke={s.color}
                  strokeWidth={thickness}
                  fill="none"
                  strokeDasharray={`${Math.max(0, len - gap)} ${c}`}
                  strokeDashoffset={-offset}
                />
              );
              offset += len;
              return el;
            })}
        </G>
      </Svg>
      {children}
    </View>
  );
}
