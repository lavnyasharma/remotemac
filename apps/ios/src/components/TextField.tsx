import React, { useState, forwardRef } from 'react';
import { View, TextInput, Pressable, StyleSheet, type TextInputProps, type TextInputInstance } from 'react-native';
import { useTheme } from '../theme/useTheme';
import { typography } from '../theme/typography';
import { radius, spacing, minHitTarget } from '../theme/spacing';
import { Icon, type IconName } from './Icon';

interface TextFieldProps extends TextInputProps {
  /** Still required for VoiceOver even though it's no longer shown as a floating label —
   *  the leading icon carries the visual meaning instead (HIG text-fields.md). */
  label: string;
  icon?: IconName;
}

/**
 * A bordered field with a leading icon and a visible focus state. Secure fields get a
 * show/hide toggle instead of leaving people unable to check what they typed.
 */
export const TextField = forwardRef<TextInputInstance, TextFieldProps>(function TextFieldInner(
  { label, icon, style, secureTextEntry, ...inputProps },
  ref,
) {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const isSecure = secureTextEntry && !revealed;

  return (
    <View
      style={[
        styles.wrap,
        { backgroundColor: colors.surfaceSecondary, borderColor: focused ? colors.accent : colors.separator },
      ]}
    >
      {icon ? <Icon name={icon} color={colors.labelTertiary} size={18} strokeWidth={2} style={styles.leadingIcon} /> : null}
      <TextInput
        ref={ref}
        style={[typography.body, styles.input, { color: colors.label }, style]}
        placeholderTextColor={colors.placeholderText}
        secureTextEntry={isSecure}
        onFocus={(e) => {
          setFocused(true);
          inputProps.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          inputProps.onBlur?.(e);
        }}
        accessibilityLabel={label}
        {...inputProps}
      />
      {secureTextEntry ? (
        <Pressable
          onPress={() => setRevealed((prev) => !prev)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={revealed ? 'Hide password' : 'Show password'}
        >
          <Icon name={revealed ? 'eyeOff' : 'eye'} color={colors.labelTertiary} size={19} strokeWidth={2} />
        </Pressable>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    minHeight: minHitTarget + 4,
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  leadingIcon: { marginRight: -spacing.xs },
  input: { flex: 1, paddingVertical: spacing.sm },
});
