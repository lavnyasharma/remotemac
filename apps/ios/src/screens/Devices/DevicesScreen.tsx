import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, ActivityIndicator, Alert, ActionSheetIOS, RefreshControl, ScrollView } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuthStore } from '../../state/authStore';
import { useDeviceStore } from '../../state/deviceStore';
import { usePairingStore } from '../../state/pairingStore';
import type { RootStackParamList } from '../../types/navigation';
import { apiClient, type DeviceResponse } from '../../services/api/apiClient';
import { useTheme } from '../../theme/useTheme';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { glowShadow } from '../../theme/colors';
import { Button, Card, Icon, IconButton, IconTile, StatusBadge, type StatusTone, ScreenContainer } from '../../components';

type Props = NativeStackScreenProps<RootStackParamList, 'Devices'>;

export function DevicesScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const isSignedIn = useAuthStore((state) => state.status === 'signedIn');
  const getFreshAccessToken = useAuthStore((state) => state.getFreshAccessToken);
  const userEmail = useAuthStore((state) => state.user?.email);
  const thisDeviceId = useDeviceStore((state) => state.thisDeviceId);
  const devices = useDeviceStore((state) => state.devices);
  const isLoading = useDeviceStore((state) => state.isLoading);
  const ensureRegistered = useDeviceStore((state) => state.ensureRegistered);
  const refreshDevices = useDeviceStore((state) => state.refreshDevices);
  const removeDevice = useDeviceStore((state) => state.removeDevice);
  const connectionStatus = usePairingStore((state) => state.connectionStatus);
  const pairedDeviceOnline = usePairingStore((state) => state.pairedDeviceOnline);
  const webrtcTestStatus = usePairingStore((state) => state.webrtcTestStatus);
  const connect = usePairingStore((state) => state.connect);
  const reconnectNow = usePairingStore((state) => state.reconnectNow);
  const testWebrtcConnection = usePairingStore((state) => state.testWebrtcConnection);

  // devicePairId per Mac device, keyed by that Mac's device id — needed to start a
  // WebRTC session (see GET /devices/:id/pairs), since it's not otherwise known
  // once pairing happened in an earlier app launch than this one.
  const [pairIdByDeviceId, setPairIdByDeviceId] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!isSignedIn) return;
    void (async () => {
      const accessToken = await getFreshAccessToken();
      if (!accessToken) return;
      const deviceId = await ensureRegistered(accessToken);
      await refreshDevices(accessToken);
      connect(deviceId, accessToken);
      const pairs = await apiClient.listDevicePairs(deviceId, accessToken).catch(() => []);
      setPairIdByDeviceId(Object.fromEntries(pairs.map((pair) => [pair.device.id, pair.pairId])));
    })();
    // Runs once per sign-in — not per access token, which now refreshes every ~10 minutes;
    // re-running on that would tear down a healthy socket (and any live screen session).
    // Reconnects after drops are handled inside pairingStore.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSignedIn]);

  const macDevices = devices.filter((device) => device.deviceType === 'mac' && device.id !== thisDeviceId);

  // A diagnostic test kicked off from a device's overflow menu — tracked by device id so the
  // result alert below can tell which device it belongs to (webrtcTestStatus itself is a
  // single shared value, not per-device).
  const [testingDeviceName, setTestingDeviceName] = useState<string | null>(null);

  useEffect(() => {
    if (!testingDeviceName) return;
    if (webrtcTestStatus.kind === 'success') {
      Alert.alert('Connection OK', `${testingDeviceName} responded in ${Math.round(webrtcTestStatus.rttMs)}ms.`);
      setTestingDeviceName(null);
    } else if (webrtcTestStatus.kind === 'failed') {
      Alert.alert('Connection Test Failed', webrtcTestStatus.message);
      setTestingDeviceName(null);
    }
  }, [webrtcTestStatus, testingDeviceName]);

  const handleTestWebrtc = (device: DeviceResponse) => {
    const pairId = pairIdByDeviceId[device.id];
    if (!pairId) {
      Alert.alert('Not paired', "This Mac's pairing info isn't available yet. Try again in a moment.");
      return;
    }
    setTestingDeviceName(device.name);
    void testWebrtcConnection(pairId);
  };

  const handleViewScreen = (device: DeviceResponse) => {
    const pairId = pairIdByDeviceId[device.id];
    if (!pairId) {
      Alert.alert('Not paired', "This Mac's pairing info isn't available yet. Try again in a moment.");
      return;
    }
    navigation.navigate('Screen', { devicePairId: pairId, macDeviceName: device.name });
  };

  const confirmRemove = (device: DeviceResponse) => {
    Alert.alert('Remove Mac', `Forget "${device.name}"? You'll need to pair it again to reconnect.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          void getFreshAccessToken().then((accessToken) => {
            if (accessToken) void removeDevice(device.id, accessToken);
          });
        },
      },
    ]);
  };

  const showDeviceActions = (device: DeviceResponse) => {
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: device.name,
        options: ['Test Connection', 'Remove Mac', 'Cancel'],
        destructiveButtonIndex: 1,
        cancelButtonIndex: 2,
      },
      (buttonIndex) => {
        if (buttonIndex === 0) handleTestWebrtc(device);
        else if (buttonIndex === 1) confirmRemove(device);
      },
    );
  };

  const initial = (userEmail ?? '?').charAt(0).toUpperCase();

  return (
    <ScreenContainer edges={['top', 'bottom']}>
      <View style={styles.container}>
        {/* Custom header — full control over shape and color instead of the OS's own bar-button
            chrome, and an avatar (initial-letter, tappable) doubles as the way to reach Settings
            since this app has no tab bar. */}
        <View style={styles.header}>
          <View style={styles.headerTitles}>
            <Text style={[typography.title1, { color: colors.label }]}>RemoteMac</Text>
            <Text style={[typography.subhead, { color: colors.labelSecondary }]}>
              {macDevices.length} {macDevices.length === 1 ? 'device' : 'devices'}
            </Text>
          </View>
          <View style={styles.headerActions}>
            <Pressable
              onPress={() => navigation.navigate('Settings')}
              accessibilityRole="button"
              accessibilityLabel="Account and settings"
              style={[styles.avatar, { backgroundColor: colors.accentSoft, borderColor: colors.accent }]}
            >
              <Text style={[typography.headline, { color: colors.accent }]}>{initial}</Text>
            </Pressable>
            <Pressable
              onPress={() => navigation.navigate('Pairing')}
              accessibilityRole="button"
              accessibilityLabel="Add Mac"
              style={[styles.addButton, { backgroundColor: colors.accent }, glowShadow(colors.accent)]}
            >
              <Icon name="plus" color={colors.accentContrast} size={20} strokeWidth={2.4} />
            </Pressable>
          </View>
        </View>

        {/* The backend connection is plumbing, not something people need to watch — it only
            earns screen space when it isn't in the state they'd expect (HIG feedback.md:
            "they only need to know when it doesn't [succeed]"). */}
        {connectionStatus !== 'connected' && (
          <View style={styles.connectionStatus}>
            <StatusBadge label={connectionLabel(connectionStatus)} tone={connectionTone(connectionStatus)} />
            {connectionStatus === 'disconnected' && (
              <Button title="Reconnect" variant="plain" onPress={reconnectNow} />
            )}
          </View>
        )}

        {isLoading && macDevices.length === 0 ? (
          <ActivityIndicator style={styles.loading} color={colors.labelSecondary} />
        ) : macDevices.length === 0 ? (
          <ScrollView contentContainerStyle={styles.empty}>
            <IconTile icon="monitor" tint={colors.accent} size={80} iconSize={36} radius={22} glow />
            <Text style={[typography.title3, styles.emptyTitle, { color: colors.label }]}>No Mac Paired</Text>
            <Text style={[typography.subhead, styles.emptySubtitle, { color: colors.labelSecondary }]}>
              Pair a Mac to pull up its screen and control it from here.
            </Text>
            <Button title="Add Mac" onPress={() => navigation.navigate('Pairing')} style={styles.emptyButton} />
          </ScrollView>
        ) : (
          <FlatList
            data={macDevices}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            refreshControl={
              <RefreshControl
                refreshing={isLoading}
                onRefresh={() => {
                  void getFreshAccessToken().then((accessToken) => {
                    if (accessToken) void refreshDevices(accessToken);
                  });
                }}
                tintColor={colors.labelSecondary}
              />
            }
            renderItem={({ item }: { item: DeviceResponse }) => (
              <Pressable
                onPress={() => handleViewScreen(item)}
                accessibilityRole="button"
                accessibilityLabel={`${item.name}, ${pairedDeviceOnline ? 'online' : 'offline'}`}
                accessibilityHint="View this Mac's screen"
                style={({ pressed }) => [pressed && styles.cardPressed]}
              >
                <Card style={styles.card}>
                  <IconTile icon="monitor" tint={colors.accentSoft} iconColor={colors.accent} size={48} iconSize={22} radius={14} />

                  <View style={styles.deviceInfo}>
                    <Text style={[typography.headline, { color: colors.label }]} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <StatusBadge label={pairedDeviceOnline ? 'Online' : 'Offline'} tone={pairedDeviceOnline ? 'positive' : 'neutral'} />
                  </View>

                  <View style={styles.cardTrailing}>
                    <IconButton
                      icon="ellipsis"
                      color={colors.labelSecondary}
                      accessibilityLabel={`More options for ${item.name}`}
                      onPress={() => showDeviceActions(item)}
                    />
                    <Icon name="chevronRight" color={colors.labelTertiary} size={16} strokeWidth={2} />
                  </View>
                </Card>
              </Pressable>
            )}
          />
        )}
      </View>
    </ScreenContainer>
  );
}

function connectionLabel(status: 'disconnected' | 'connecting' | 'connected'): string {
  switch (status) {
    case 'connected':
      return 'Connected';
    case 'connecting':
      return 'Connecting…';
    case 'disconnected':
      return 'Disconnected';
  }
}

function connectionTone(status: 'disconnected' | 'connecting' | 'connected'): StatusTone {
  switch (status) {
    case 'connected':
      return 'positive';
    case 'connecting':
      return 'progress';
    case 'disconnected':
      return 'neutral';
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: spacing.lg },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  headerTitles: { gap: 2 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  connectionStatus: { marginBottom: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  loading: { marginTop: spacing.xxxl * 1.25 },
  empty: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xxl, paddingVertical: spacing.xxl },
  emptyTitle: { marginTop: spacing.lg, marginBottom: spacing.xs },
  emptySubtitle: { textAlign: 'center', marginBottom: spacing.xxl },
  emptyButton: { minWidth: 180 },
  list: { paddingTop: spacing.sm, paddingBottom: spacing.xl },
  cardPressed: { opacity: 0.6 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.md,
    paddingVertical: spacing.md,
  },
  deviceInfo: { flex: 1, gap: spacing.xs },
  // A tighter, dedicated gap here — the overflow button already carries ~15pt of its own
  // padding (for its 44pt hit target), so the row's usual `gap: spacing.md` would read as an
  // oversized, lopsided space before the chevron.
  cardTrailing: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
});
