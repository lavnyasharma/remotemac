import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Icon, type IconName } from './Icon';
import { glowShadow } from '../theme/colors';

interface IconTileProps {
  icon: IconName;
  tint: string;
  iconColor?: string;
  size?: number;
  iconSize?: number;
  radius?: number;
  glow?: boolean;
}

/**
 * The rounded, colored icon tile used throughout — as the hero mark on Login and empty states,
 * and (smaller, one hue per category) on device rows and Settings rows, the way iOS's own
 * Settings app uses color to make a list scannable at a glance.
 */
export function IconTile({ icon, tint, iconColor = '#FFFFFF', size = 44, iconSize, radius, glow }: IconTileProps) {
  return (
    <View
      style={[
        styles.tile,
        {
          width: size,
          height: size,
          borderRadius: radius ?? size * 0.28,
          backgroundColor: tint,
        },
        glow && glowShadow(tint),
      ]}
    >
      <Icon name={icon} color={iconColor} size={iconSize ?? size * 0.5} strokeWidth={Math.max(2, size * 0.045)} />
    </View>
  );
}

const styles = StyleSheet.create({
  tile: { alignItems: 'center', justifyContent: 'center' },
});
