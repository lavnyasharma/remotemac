import React, { useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, ScrollView } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { usePairingStore, type PairingStatus } from '../../state/pairingStore';
import type { RootStackParamList } from '../../types/navigation';
import { useTheme } from '../../theme/useTheme';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { Button, CodeField, Icon, IconTile, ScreenHeader, ScreenContainer } from '../../components';

type Props = NativeStackScreenProps<RootStackParamList, 'Pairing'>;

export function PairingScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const [code, setCode] = useState('');
  const [rtt, setRtt] = useState<string | null>(null);
  const pairingStatus = usePairingStore((state) => state.pairingStatus);
  const submitPairingCode = usePairingStore((state) => state.submitPairingCode);
  const testConnection = usePairingStore((state) => state.testConnection);

  const isValidCode = /^\d{6}$/.test(code);
  const isSubmitting = pairingStatus.kind === 'redeeming' || pairingStatus.kind === 'awaitingApproval';

  const handleTestConnection = async () => {
    const ms = await testConnection();
    setRtt(ms === null ? 'Could not reach the backend.' : `Round-trip time: ${Math.round(ms)}ms`);
  };

  return (
    <ScreenContainer edges={['top', 'bottom']}>
      <ScreenHeader title="Add Mac" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.hero}>
          <IconTile icon="monitor" tint={colors.accent} size={72} iconSize={32} radius={20} glow />
          <Text style={[typography.subhead, styles.subtitle, { color: colors.labelSecondary }]}>
            Enter the pairing code shown on your Mac.
          </Text>
        </View>

        <CodeField value={code} onChangeText={setCode} editable={!isSubmitting} />

        <Button
          title="Connect"
          onPress={() => submitPairingCode(code)}
          disabled={!isValidCode}
          loading={isSubmitting}
          style={styles.connectButton}
        />

        <PairingStatusView status={pairingStatus} />

        {pairingStatus.kind === 'paired' && (
          <Button title="Test Connection" variant="secondary" onPress={() => void handleTestConnection()} style={styles.testButton} />
        )}
        {rtt ? (
          <Text style={[typography.footnote, styles.rtt, { color: colors.labelSecondary }]}>{rtt}</Text>
        ) : null}
      </ScrollView>
    </ScreenContainer>
  );
}

function PairingStatusView({ status }: { status: PairingStatus }) {
  const { colors } = useTheme();

  switch (status.kind) {
    case 'redeeming':
    case 'awaitingApproval':
      return (
        <View style={styles.statusBox} accessibilityRole="text" accessibilityLabel="Waiting for your Mac to approve">
          <ActivityIndicator color={colors.labelSecondary} />
          <Text style={[typography.subhead, { color: colors.labelSecondary }]}>Waiting for your Mac to approve…</Text>
        </View>
      );
    case 'paired':
      return (
        <View style={styles.statusBox} accessibilityRole="text" accessibilityLabel="Paired successfully">
          <Icon name="checkmark" color={colors.positive} size={18} strokeWidth={2.5} />
          <Text style={[typography.bodyEmphasized, { color: colors.positive }]}>Paired successfully</Text>
        </View>
      );
    case 'rejected':
      return (
        <Text style={[typography.subhead, styles.error, { color: colors.negative }]} accessibilityRole="alert">
          Pairing was rejected{status.reason ? `: ${status.reason}` : ''}
        </Text>
      );
    case 'failed':
      return (
        <Text style={[typography.subhead, styles.error, { color: colors.negative }]} accessibilityRole="alert">
          {status.message}
        </Text>
      );
    case 'idle':
      return null;
  }
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, paddingHorizontal: spacing.xxl, paddingBottom: spacing.xxl },
  hero: { alignItems: 'center', marginBottom: spacing.xxl },
  subtitle: { textAlign: 'center', marginTop: spacing.lg },
  connectButton: { marginTop: spacing.lg },
  statusBox: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: spacing.xl, gap: spacing.sm },
  error: { marginTop: spacing.xl, textAlign: 'center' },
  testButton: { marginTop: spacing.xxl },
  rtt: { textAlign: 'center', marginTop: spacing.md },
});
