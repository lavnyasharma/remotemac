import React from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { useTheme } from '../theme/useTheme';

interface ScreenContainerProps {
  children: React.ReactNode;
  edges?: readonly Edge[];
  /** Overrides the theme background — used only by Screen Mode's permanently-dark surface. */
  backgroundColor?: string;
}

export function ScreenContainer({ children, edges, backgroundColor }: ScreenContainerProps) {
  const { colors } = useTheme();
  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: backgroundColor ?? colors.groupedBackground }]} edges={edges}>
      {children}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({ flex: { flex: 1 } });
