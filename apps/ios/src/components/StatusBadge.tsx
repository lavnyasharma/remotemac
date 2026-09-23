import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../theme/useTheme';
import { typography } from '../theme/typography';
import { spacing } from '../theme/spacing';

export type StatusTone = 'positive' | 'negative' | 'neutral' | 'progress';

interface StatusBadgeProps {
  label: string;
  tone: StatusTone;
}

/**
 * The dot-plus-label status indicator every screen re-implemented slightly differently
 * (Devices, Screen Mode had one; Pairing had none at all). One component driven by the
 * same tone vocabulary as pairingStore's status unions keeps "connected" looking identical
 * everywhere it appears. Color alone never carries the meaning — the label text does that
 * (HIG accessibility.md: "convey information with more than color alone").
 */
export function StatusBadge({ label, tone }: StatusBadgeProps) {
  const { colors } = useTheme();

  const dotColor = {
    positive: colors.positive,
    negative: colors.negative,
    neutral: colors.labelTertiary,
    progress: colors.warning,
  }[tone];

  return (
    <View style={styles.row} accessibilityRole="text" accessibilityLabel={label}>
      <View style={[styles.dot, { backgroundColor: dotColor }]} />
      <Text style={[typography.footnote, { color: colors.labelSecondary }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: spacing.xs },
});
