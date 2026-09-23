import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { Icon, type IconName } from './Icon';
import { minHitTarget } from '../theme/spacing';

interface IconButtonProps {
  icon: IconName;
  onPress: () => void;
  color: string;
  accessibilityLabel: string;
  size?: number;
}

/** An icon-only control that still meets the 44x44pt minimum hit target (accessibility.md). */
export function IconButton({ icon, onPress, color, accessibilityLabel, size = 20 }: IconButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [styles.hit, pressed && styles.pressed]}
    >
      <Icon name={icon} color={color} size={size} strokeWidth={2} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hit: { minWidth: minHitTarget, minHeight: minHitTarget, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.5 },
});
