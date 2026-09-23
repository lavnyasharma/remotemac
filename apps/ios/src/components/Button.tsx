import React from 'react';
import { Pressable, Text, ActivityIndicator, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../theme/useTheme';
import { typography } from '../theme/typography';
import { minHitTarget, spacing } from '../theme/spacing';
import { glowShadow } from '../theme/colors';

export type ButtonVariant = 'primary' | 'secondary' | 'destructive' | 'plain';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
}

/**
 * The app's one button implementation (HIG buttons.md: "always include a press state",
 * 44x44pt minimum hit region) — every screen used to hand-roll its own Pressable styling,
 * which is how the app ended up with two different accent blues for the same role.
 */
export function Button({ title, onPress, variant = 'primary', disabled, loading, style, accessibilityHint }: ButtonProps) {
  const { colors } = useTheme();
  const isDisabled = disabled || loading;

  const variantStyle: StyleProp<ViewStyle> = (() => {
    switch (variant) {
      case 'primary':
        return [{ backgroundColor: colors.accent }, !isDisabled && glowShadow(colors.accent)];
      case 'destructive':
        return { backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: 'rgba(255,69,58,0.35)' };
      case 'secondary':
        return { backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.separator };
      case 'plain':
        return { backgroundColor: 'transparent' };
    }
  })();

  const textColor = (() => {
    switch (variant) {
      case 'primary':
        return colors.accentContrast;
      case 'destructive':
        return colors.negative;
      case 'secondary':
      case 'plain':
        return colors.accent;
    }
  })();

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      accessibilityHint={accessibilityHint}
      style={({ pressed }) => [
        styles.base,
        variant === 'plain' && styles.plainBase,
        variantStyle,
        pressed && !isDisabled && styles.pressed,
        isDisabled && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={textColor} />
      ) : (
        <Text style={[typography.headline, { color: textColor }]}>{title}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: minHitTarget + 6,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  plainBase: {
    minHeight: undefined,
    paddingVertical: spacing.sm,
  },
  pressed: {
    opacity: 0.7,
  },
  disabled: {
    opacity: 0.4,
  },
});
