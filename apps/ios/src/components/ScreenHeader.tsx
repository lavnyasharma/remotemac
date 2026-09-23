import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useTheme } from '../theme/useTheme';
import { typography } from '../theme/typography';
import { spacing } from '../theme/spacing';
import { Icon } from './Icon';

interface ScreenHeaderProps {
  title: string;
  onBack: () => void;
  trailing?: React.ReactNode;
}

/**
 * A custom back-navigation header, not the native one — every screen draws its own so the
 * whole app gets one consistent, flat look instead of relying on the OS's own bar-button
 * chrome (which on current iOS wraps custom bar-button views in a floating pill by default).
 */
export function ScreenHeader({ title, onBack, trailing }: ScreenHeaderProps) {
  const { colors } = useTheme();
  return (
    <View style={styles.header}>
      <Pressable
        onPress={onBack}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Back"
        style={[styles.backButton, { backgroundColor: colors.surfaceSecondary }]}
      >
        <Icon name="chevronLeft" color={colors.label} size={16} strokeWidth={2.4} />
      </Pressable>
      <Text style={[typography.headline, styles.title, { color: colors.label }]} numberOfLines={1}>
        {title}
      </Text>
      {trailing ?? <View style={styles.backButton} />}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  backButton: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1 },
});
