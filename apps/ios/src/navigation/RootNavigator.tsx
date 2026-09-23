import React, { useRef } from 'react';
import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import type { NavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuthStore } from '../state/authStore';
import { LoginScreen } from '../screens/Login/LoginScreen';
import { DevicesScreen } from '../screens/Devices/DevicesScreen';
import { PairingScreen } from '../screens/Pairing/PairingScreen';
import { SettingsScreen } from '../screens/Settings/SettingsScreen';
import { ScreenScreen } from '../screens/Screen/ScreenScreen';
import type { RootStackParamList } from '../types/navigation';
import { useTheme } from '../theme/useTheme';
import { logScreenView } from '../services/analytics/analytics';

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  const status = useAuthStore((state) => state.status);
  const { colors } = useTheme();
  const navigationRef = useRef<NavigationContainerRef<RootStackParamList>>(null);
  const currentRouteName = useRef<string | undefined>(undefined);

  const navigationTheme = {
    ...DarkTheme,
    colors: {
      ...DarkTheme.colors,
      primary: colors.accent,
      background: colors.groupedBackground,
      card: colors.groupedBackgroundSecondary,
      text: colors.label,
      border: colors.separator,
    },
  };

  return (
    <NavigationContainer
      ref={navigationRef}
      theme={navigationTheme}
      onReady={() => {
        currentRouteName.current = navigationRef.current?.getCurrentRoute()?.name;
        if (currentRouteName.current) logScreenView(currentRouteName.current);
      }}
      onStateChange={() => {
        const previousRouteName = currentRouteName.current;
        const nextRouteName = navigationRef.current?.getCurrentRoute()?.name;
        if (nextRouteName && nextRouteName !== previousRouteName) {
          logScreenView(nextRouteName);
        }
        currentRouteName.current = nextRouteName;
      }}
    >
      {/* Every screen draws its own header (or none, for Login/Screen) — native-stack's
          default bar-button chrome (the current OS's floating pill/glass treatment) doesn't
          match this app's flat, token-driven look, so nothing here relies on it. */}
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {status === 'signedOut' ? (
          <Stack.Screen name="Login" component={LoginScreen} />
        ) : (
          <>
            <Stack.Screen name="Devices" component={DevicesScreen} />
            <Stack.Screen name="Pairing" component={PairingScreen} />
            <Stack.Screen name="Settings" component={SettingsScreen} />
            <Stack.Screen name="Screen" component={ScreenScreen} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
