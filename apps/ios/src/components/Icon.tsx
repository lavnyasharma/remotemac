import React from 'react';
import { View, StyleSheet, type ViewStyle } from 'react-native';

export type IconName =
  | 'chevronLeft'
  | 'chevronRight'
  | 'xmark'
  | 'checkmark'
  | 'plus'
  | 'ellipsis'
  | 'monitor'
  | 'envelope'
  | 'lock'
  | 'eye'
  | 'eyeOff'
  | 'joystick'
  | 'devicePhone'
  | 'trackpad'
  | 'keyboard';

interface IconProps {
  name: IconName;
  size?: number;
  color: string;
  strokeWidth?: number;
  style?: ViewStyle;
}

/**
 * A tiny, dependency-free glyph set (no SF Symbols/vector-icon package is linked into the
 * native project) built from plain Views so every icon still adapts to the theme's colors
 * and needs no image assets. Purely decorative — the accessibility label belongs on the
 * Pressable/button that wraps the icon, so this component hides itself from VoiceOver.
 */
export function Icon({ name, size = 20, color, strokeWidth = 2, style }: IconProps) {
  const box = { width: size, height: size, alignItems: 'center', justifyContent: 'center' } as const;

  switch (name) {
    case 'chevronLeft':
      return (
        <View style={[box, style]} importantForAccessibility="no">
          <View
            style={{
              width: size * 0.4,
              height: size * 0.4,
              borderColor: color,
              borderLeftWidth: strokeWidth,
              borderBottomWidth: strokeWidth,
              transform: [{ rotate: '45deg' }],
              marginLeft: size * 0.12,
            }}
          />
        </View>
      );
    case 'chevronRight':
      return (
        <View style={[box, style]} importantForAccessibility="no">
          <View
            style={{
              width: size * 0.4,
              height: size * 0.4,
              borderColor: color,
              borderLeftWidth: strokeWidth,
              borderBottomWidth: strokeWidth,
              transform: [{ rotate: '-135deg' }],
              marginRight: size * 0.12,
            }}
          />
        </View>
      );
    case 'xmark':
      return (
        <View style={[box, style]} importantForAccessibility="no">
          <View
            style={[
              styles.absoluteBar,
              { width: size * 0.7, height: strokeWidth, backgroundColor: color, borderRadius: strokeWidth / 2, transform: [{ rotate: '45deg' }] },
            ]}
          />
          <View
            style={[
              styles.absoluteBar,
              { width: size * 0.7, height: strokeWidth, backgroundColor: color, borderRadius: strokeWidth / 2, transform: [{ rotate: '-45deg' }] },
            ]}
          />
        </View>
      );
    case 'plus':
      return (
        <View style={[box, style]} importantForAccessibility="no">
          <View style={[styles.absoluteBar, { width: size * 0.75, height: strokeWidth, backgroundColor: color, borderRadius: strokeWidth / 2 }]} />
          <View style={[styles.absoluteBar, { width: strokeWidth, height: size * 0.75, backgroundColor: color, borderRadius: strokeWidth / 2 }]} />
        </View>
      );
    case 'checkmark':
      return (
        <View style={[box, style]} importantForAccessibility="no">
          <View
            style={{
              width: size * 0.55,
              height: size * 0.3,
              borderColor: color,
              borderLeftWidth: strokeWidth,
              borderBottomWidth: strokeWidth,
              transform: [{ rotate: '-45deg' }],
              marginTop: -size * 0.08,
            }}
          />
        </View>
      );
    case 'ellipsis':
      return (
        <View style={[box, styles.row, style]} importantForAccessibility="no">
          {[0, 1, 2].map((i) => (
            <View key={i} style={{ width: size * 0.14, height: size * 0.14, borderRadius: size * 0.07, backgroundColor: color, marginHorizontal: size * 0.06 }} />
          ))}
        </View>
      );
    case 'monitor':
      return (
        <View style={[box, style]} importantForAccessibility="no">
          <View
            style={{
              width: size * 0.85,
              height: size * 0.6,
              borderWidth: strokeWidth,
              borderColor: color,
              borderRadius: size * 0.08,
            }}
          />
          <View style={{ width: size * 0.35, height: strokeWidth, backgroundColor: color, borderRadius: strokeWidth / 2, marginTop: size * 0.1 }} />
        </View>
      );
    case 'envelope':
      return (
        <View style={[box, style]} importantForAccessibility="no">
          <View style={{ width: size * 0.85, height: size * 0.6, borderWidth: strokeWidth, borderColor: color, borderRadius: size * 0.08 }} />
          <View
            style={[
              styles.absoluteBar,
              { width: size * 0.56, height: strokeWidth, backgroundColor: color, borderRadius: strokeWidth / 2, transform: [{ rotate: '28deg' }], top: size * 0.32 },
            ]}
          />
          <View
            style={[
              styles.absoluteBar,
              { width: size * 0.56, height: strokeWidth, backgroundColor: color, borderRadius: strokeWidth / 2, transform: [{ rotate: '-28deg' }], top: size * 0.32 },
            ]}
          />
        </View>
      );
    case 'lock':
      return (
        <View style={[box, style]} importantForAccessibility="no">
          <View
            style={{
              width: size * 0.42,
              height: size * 0.32,
              borderWidth: strokeWidth,
              borderColor: color,
              borderBottomWidth: 0,
              borderTopLeftRadius: size * 0.21,
              borderTopRightRadius: size * 0.21,
              marginBottom: -strokeWidth * 0.5,
            }}
          />
          <View style={{ width: size * 0.62, height: size * 0.42, backgroundColor: color, borderRadius: size * 0.08 }} />
        </View>
      );
    case 'eye':
      return (
        <View style={[box, style]} importantForAccessibility="no">
          <View
            style={{
              width: size * 0.85,
              height: size * 0.5,
              borderWidth: strokeWidth,
              borderColor: color,
              borderRadius: size * 0.4,
            }}
          />
          <View style={[styles.absoluteBar, { width: size * 0.2, height: size * 0.2, borderRadius: size * 0.1, backgroundColor: color }]} />
        </View>
      );
    case 'eyeOff':
      return (
        <View style={[box, style]} importantForAccessibility="no">
          <View
            style={{
              width: size * 0.85,
              height: size * 0.5,
              borderWidth: strokeWidth,
              borderColor: color,
              borderRadius: size * 0.4,
            }}
          />
          <View style={[styles.absoluteBar, { width: size * 0.2, height: size * 0.2, borderRadius: size * 0.1, backgroundColor: color }]} />
          <View style={[styles.absoluteBar, { width: size * 0.95, height: strokeWidth, backgroundColor: color, borderRadius: strokeWidth / 2, transform: [{ rotate: '-45deg' }] }]} />
        </View>
      );
    case 'joystick':
      return (
        <View style={[box, style]} importantForAccessibility="no">
          <View style={{ width: size * 0.85, height: size * 0.85, borderRadius: size * 0.45, borderWidth: strokeWidth, borderColor: color }} />
          <View
            style={[
              styles.absoluteBar,
              { width: size * 0.32, height: size * 0.32, borderRadius: size * 0.16, backgroundColor: color, transform: [{ translateX: -size * 0.08 }, { translateY: -size * 0.08 }] },
            ]}
          />
        </View>
      );
    case 'devicePhone':
      return (
        <View style={[box, style]} importantForAccessibility="no">
          <View style={{ width: size * 0.5, height: size * 0.88, borderWidth: strokeWidth, borderColor: color, borderRadius: size * 0.12 }} />
          <View style={[styles.absoluteBar, { width: size * 0.22, height: strokeWidth, backgroundColor: color, borderRadius: strokeWidth / 2, bottom: size * 0.14 }]} />
        </View>
      );
    case 'trackpad':
      return (
        <View style={[box, style]} importantForAccessibility="no">
          <View style={{ width: size * 0.88, height: size * 0.62, borderWidth: strokeWidth, borderColor: color, borderRadius: size * 0.1 }} />
        </View>
      );
    case 'keyboard':
      return (
        <View style={[box, style]} importantForAccessibility="no">
          <View style={{ width: size * 0.9, height: size * 0.6, borderWidth: strokeWidth, borderColor: color, borderRadius: size * 0.1 }} />
          <View style={[box, styles.row, { position: 'absolute', width: size * 0.62, justifyContent: 'space-between' }]}>
            {[0, 1, 2].map((i) => (
              <View key={i} style={{ width: size * 0.1, height: size * 0.1, borderRadius: size * 0.02, backgroundColor: color }} />
            ))}
          </View>
        </View>
      );
  }
}

const styles = StyleSheet.create({
  absoluteBar: { position: 'absolute' },
  row: { flexDirection: 'row' },
});
