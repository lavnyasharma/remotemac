import React, { useRef } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, type TextInputInstance } from 'react-native';
import { useTheme } from '../theme/useTheme';
import { typography } from '../theme/typography';
import { radius, spacing } from '../theme/spacing';

interface CodeFieldProps {
  value: string;
  onChangeText: (text: string) => void;
  length?: number;
  editable?: boolean;
}

/**
 * A per-digit boxed code entry, replacing a single wide free-text field for the 6-digit
 * pairing code — a much more familiar pattern for one-time codes (HIG entering-data.md:
 * "be clear about the data you need"), and it mirrors the boxed treatment the Mac app's own
 * CodeDisplay already uses so the pairing flow looks like one flow across both apps.
 */
export function CodeField({ value, onChangeText, length = 6, editable = true }: CodeFieldProps) {
  const { colors } = useTheme();
  const inputRef = useRef<TextInputInstance>(null);
  const digits = value.padEnd(length, ' ').split('').slice(0, length);

  return (
    <Pressable onPress={() => inputRef.current?.focus()} accessibilityRole="none">
      <View style={styles.row}>
        {digits.map((digit, index) => {
          const isFilled = digit.trim().length > 0;
          const isCursor = editable && index === value.length;
          return (
            <View
              key={index}
              style={[
                styles.box,
                {
                  borderColor: isCursor ? colors.accent : colors.opaqueSeparator,
                  backgroundColor: colors.groupedBackgroundSecondary,
                },
              ]}
            >
              <Text style={[typography.title2, { color: colors.label }]}>{isFilled ? digit : ''}</Text>
            </View>
          );
        })}
      </View>
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={(text) => onChangeText(text.replace(/[^0-9]/g, '').slice(0, length))}
        keyboardType="number-pad"
        maxLength={length}
        editable={editable}
        style={styles.hiddenInput}
        accessibilityLabel="Pairing code"
        accessibilityHint={`${length}-digit code shown on your Mac`}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'center', gap: spacing.sm },
  box: {
    width: 44,
    height: 56,
    borderWidth: 1.5,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Positioned off-screen rather than `opacity: 0` so VoiceOver and Full Keyboard Access can
  // still reach it — it's the thing that's actually focused and receiving input.
  hiddenInput: { position: 'absolute', width: 1, height: 1, left: -9999 },
});
