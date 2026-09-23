import React from 'react';
import { View, Text, Switch, StyleSheet } from 'react-native';
import { useTheme } from '../theme/useTheme';
import { typography } from '../theme/typography';
import { radius, spacing } from '../theme/spacing';
import { IconTile } from './IconTile';
import type { IconName } from './Icon';

interface SectionProps {
  title?: string;
  children: React.ReactNode;
}

/** A grouped-table section, the pattern iOS Settings itself uses (HIG lists-and-tables.md). */
export function Section({ title, children }: SectionProps) {
  const { colors } = useTheme();
  return (
    <View style={styles.section}>
      {title ? (
        <Text style={[typography.footnote, styles.title, { color: colors.labelSecondary }]}>
          {title.toUpperCase()}
        </Text>
      ) : null}
      <View style={[styles.body, { backgroundColor: colors.surface, borderColor: colors.separator }]}>{children}</View>
    </View>
  );
}

interface RowIconProps {
  icon?: IconName;
  tint?: string;
}

interface ListRowProps extends RowIconProps {
  label: string;
  value?: string;
  last?: boolean;
}

export function ListRow({ label, value, last, icon, tint }: ListRowProps) {
  const { colors } = useTheme();
  return (
    <View style={[styles.row, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.separator }]}>
      {icon ? <IconTile icon={icon} tint={tint ?? colors.accent} size={32} iconSize={16} radius={9} /> : null}
      <Text style={[typography.body, styles.rowLabel, { color: colors.label }]}>{label}</Text>
      {value ? (
        <Text style={[typography.body, { color: colors.labelSecondary }]} numberOfLines={1}>
          {value}
        </Text>
      ) : null}
    </View>
  );
}

interface SwitchRowProps extends RowIconProps {
  label: string;
  description?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  last?: boolean;
}

/** A settings row that's itself the control (HIG toggles.md) — no separate label press target. */
export function SwitchRow({ label, description, value, onValueChange, last, icon, tint }: SwitchRowProps) {
  const { colors } = useTheme();
  return (
    <View style={[styles.row, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.separator }]}>
      {icon ? <IconTile icon={icon} tint={tint ?? colors.accent} size={32} iconSize={16} radius={9} /> : null}
      <View style={styles.switchLabel}>
        <Text style={[typography.body, { color: colors.label }]}>{label}</Text>
        {description ? (
          <Text style={[typography.footnote, styles.switchDescription, { color: colors.labelSecondary }]}>
            {description}
          </Text>
        ) : null}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ true: colors.accent, false: colors.fill }}
        accessibilityLabel={label}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: spacing.xl },
  title: { marginBottom: spacing.xs, marginLeft: spacing.lg, letterSpacing: 0.5 },
  body: { borderRadius: radius.lg, borderWidth: 1, overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.md,
  },
  rowLabel: { flex: 1 },
  switchLabel: { flex: 1 },
  switchDescription: { marginTop: 2 },
});
