import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuthStore } from '../../state/authStore';
import { useDeviceStore } from '../../state/deviceStore';
import { usePairingStore } from '../../state/pairingStore';
import { useScreenPreferencesStore } from '../../state/screenPreferencesStore';
import type { RootStackParamList } from '../../types/navigation';
import { useTheme } from '../../theme/useTheme';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { Button, Card, Section, ListRow, SwitchRow, ScreenHeader, ScreenContainer } from '../../components';
import { glowShadow } from '../../theme/colors';

const APP_VERSION = '0.0.1';

type Props = NativeStackScreenProps<RootStackParamList, 'Settings'>;

export function SettingsScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const user = useAuthStore((state) => state.user);
  const signOut = useAuthStore((state) => state.signOut);
  const thisDeviceName = useDeviceStore((state) => state.thisDeviceName);
  const disconnect = usePairingStore((state) => state.disconnect);
  const showJoystick = useScreenPreferencesStore((state) => state.showJoystick);
  const setShowJoystick = useScreenPreferencesStore((state) => state.setShowJoystick);
  const showTrackpad = useScreenPreferencesStore((state) => state.showTrackpad);
  const setShowTrackpad = useScreenPreferencesStore((state) => state.setShowTrackpad);

  const handleSignOut = async () => {
    disconnect();
    await signOut();
  };

  const initial = (user?.email ?? '?').charAt(0).toUpperCase();

  return (
    <ScreenContainer edges={['top', 'bottom']}>
      <ScreenHeader title="Settings" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.content}>
        <Card style={styles.accountCard}>
          <View
            style={[styles.avatar, { backgroundColor: colors.accentSoft, borderColor: colors.accent }, glowShadow(colors.accent)]}
          >
            <Text style={[typography.title3, { color: colors.accent }]}>{initial}</Text>
          </View>
          <View style={styles.accountInfo}>
            <Text style={[typography.headline, { color: colors.label }]} numberOfLines={1}>
              {user?.email ?? 'Signed in'}
            </Text>
            <Text style={[typography.footnote, { color: colors.labelSecondary }]}>Personal Account</Text>
          </View>
        </Card>

        <Section title="This iPhone">
          <ListRow icon="devicePhone" tint={colors.tileTeal} label="Name" value={thisDeviceName ?? 'Registering…'} last />
        </Section>

        <Section title="Screen Mode">
          <SwitchRow
            icon="trackpad"
            tint={colors.tileIndigo}
            label="Trackpad"
            description="Drag anywhere below the screen to move the cursor like a trackpad. Turn off to control the cursor by touching directly on the mirrored screen instead — pinch to zoom still works anywhere."
            value={showTrackpad}
            onValueChange={setShowTrackpad}
          />
          <SwitchRow
            icon="joystick"
            tint={colors.tileIndigo}
            label="Cursor Joystick"
            description="Show an analog joystick below the screen for fine cursor control — double-tap it to cycle speed"
            value={showJoystick}
            onValueChange={setShowJoystick}
            last
          />
        </Section>

        <View style={styles.spacer} />
        <Button title="Sign Out" variant="destructive" onPress={() => void handleSignOut()} />

        <View style={styles.footer}>
          <Text style={[typography.footnote, { color: colors.labelTertiary }]}>RemoteMac · Version {APP_VERSION}</Text>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, padding: spacing.lg },
  accountCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.xl },
  avatar: { width: 52, height: 52, borderRadius: 26, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  accountInfo: { flex: 1, gap: 2 },
  spacer: { flex: 1, minHeight: spacing.xl },
  footer: { alignItems: 'center', marginTop: spacing.lg },
});
