import React, { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useAuthStore } from '../state/authStore';
import { RootNavigator } from '../navigation/RootNavigator';
import { useTheme } from '../theme/useTheme';

export default function App() {
  const status = useAuthStore((state) => state.status);
  const bootstrap = useAuthStore((state) => state.bootstrap);
  const { colors } = useTheme();

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  return (
    <SafeAreaProvider>
      {status === 'loading' ? (
        <View style={[styles.loading, { backgroundColor: colors.groupedBackground }]}>
          <ActivityIndicator size="large" color={colors.labelSecondary} />
        </View>
      ) : (
        <RootNavigator />
      )}
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
});
