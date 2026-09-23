import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { typography } from '../theme/typography';
import { radius, spacing } from '../theme/spacing';

interface SegmentedControlProps<T extends string> {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  /** Colors are passed explicitly rather than read from useTheme so this can drive the
   *  always-dark Screen Mode surface without pretending it follows the system appearance. */
  colors: { fill: string; accent: string; label: string; labelOnAccent: string };
}

/** Formalizes the ad hoc Move/Drag/Scroll button row into a reusable, generic control. */
export function SegmentedControl<T extends string>({ options, value, onChange, colors }: SegmentedControlProps<T>) {
  return (
    <View
      style={[styles.row, { backgroundColor: colors.fill }]}
      accessibilityRole="tablist"
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            style={[styles.segment, selected && { backgroundColor: colors.accent }]}
          >
            <Text style={[typography.footnote, styles.label, { color: selected ? colors.labelOnAccent : colors.label }]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', borderRadius: radius.lg, padding: 4, gap: 4 },
  segment: {
    flex: 1,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  label: { fontWeight: '600' },
});
