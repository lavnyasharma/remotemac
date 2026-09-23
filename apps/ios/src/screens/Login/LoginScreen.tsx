import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Animated,
  Easing,
  AccessibilityInfo,
} from 'react-native';
import { useAuthStore } from '../../state/authStore';
import { useTheme } from '../../theme/useTheme';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { Button, TextField, IconTile, SegmentedControl, ScreenContainer, Card } from '../../components';

const MODE_OPTIONS = [
  { value: 'signIn' as const, label: 'Sign In' },
  { value: 'register' as const, label: 'Create Account' },
];

const MODE_COPY: Record<'signIn' | 'register', string> = {
  signIn: 'Sign in to control your Mac from here.',
  register: 'Create an account to start pairing your Mac.',
};

export function LoginScreen() {
  const { colors } = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'signIn' | 'register'>('signIn');
  const signIn = useAuthStore((state) => state.signIn);
  const register = useAuthStore((state) => state.register);
  const isBusy = useAuthStore((state) => state.isBusy);
  const error = useAuthStore((state) => state.error);
  const entrance = useEntranceAnimation();

  const isValid = email.includes('@') && password.length >= 8;

  const submit = () => {
    if (mode === 'signIn') void signIn(email, password);
    else void register(email, password);
  };

  return (
    <ScreenContainer edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* A plain centered View clips silently once content (a large title at max Dynamic
            Type size, in particular) outgrows the screen — nothing to scroll to reach the rest.
            A ScrollView centers the same way when content fits, and scrolls when it doesn't. */}
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Animated.View style={{ opacity: entrance.opacity, transform: [{ translateY: entrance.translateY }] }}>
            <View style={styles.hero}>
              <View style={styles.iconWrap}>
                <PulseGlow color={colors.accentSoft} size={132} />
                <IconTile icon="monitor" tint={colors.accent} size={88} iconSize={40} radius={26} glow />
              </View>
              <Text style={[typography.largeTitle, { color: colors.label }]}>
                <Text style={styles.titleLight}>Remote</Text>
                <Text style={styles.titleBold}>Mac</Text>
              </Text>
              <Text style={[typography.subhead, styles.subtitle, { color: colors.labelSecondary }]}>
                {MODE_COPY[mode]}
              </Text>
            </View>

            <Card style={styles.card}>
              <SegmentedControl
                options={MODE_OPTIONS}
                value={mode}
                onChange={setMode}
                colors={{ fill: colors.fill, accent: colors.accent, label: colors.labelSecondary, labelOnAccent: colors.accentContrast }}
              />

              <View style={styles.form}>
                <TextField
                  label="Email"
                  icon="envelope"
                  placeholder="Email address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  returnKeyType="next"
                  value={email}
                  onChangeText={setEmail}
                />
                <TextField
                  label="Password"
                  icon="lock"
                  placeholder={mode === 'signIn' ? 'Password' : 'At least 8 characters'}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="done"
                  value={password}
                  onChangeText={setPassword}
                  onSubmitEditing={submit}
                />

                {error ? (
                  <Text style={[typography.footnote, styles.error, { color: colors.negative }]} accessibilityRole="alert">
                    {error}
                  </Text>
                ) : null}

                <Button
                  title={mode === 'signIn' ? 'Sign In' : 'Create Account'}
                  onPress={submit}
                  disabled={!isValid}
                  loading={isBusy}
                  style={styles.submitButton}
                />
              </View>
            </Card>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

/**
 * A one-time fade/rise on mount — the only motion here that isn't looping, so it never
 * competes with typing or fights VoiceOver focus. Skipped entirely under Reduce Motion
 * (HIG accessibility.md: motion is optional and never the only carrier of meaning).
 */
function useEntranceAnimation() {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (cancelled) return;
      if (reduced) {
        progress.setValue(1);
        return;
      }
      Animated.timing(progress, {
        toValue: 1,
        duration: 420,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    });
    return () => {
      cancelled = true;
    };
  }, [progress]);

  return {
    opacity: progress,
    translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }),
  };
}

/**
 * A slow breathing halo behind the hero mark — reads as "this app is about a live connection
 * to your Mac" rather than a static app-icon placard. One soft shape, not the stacked
 * fake-blur rings colors.ts warns against; a single accentSoft wash animated in place.
 * Loops only when Reduce Motion is off, and stops cleanly on unmount.
 */
function PulseGlow({ color, size }: { color: string; size: number }) {
  const pulse = useRef(new Animated.Value(0)).current;
  const loopRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (cancelled || reduced) return;
      loopRef.current = Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 1, duration: 1800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 0, duration: 1800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ]),
      );
      loopRef.current.start();
    });
    return () => {
      cancelled = true;
      loopRef.current?.stop();
    };
  }, [pulse]);

  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.14] });
  const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0.18] });

  return (
    <Animated.View
      pointerEvents="none"
      importantForAccessibility="no"
      style={[
        styles.glow,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: color, opacity, transform: [{ scale }] },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: spacing.xxl, paddingVertical: spacing.xxxl },
  hero: { alignItems: 'center', marginBottom: spacing.xxl },
  iconWrap: { width: 132, height: 132, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md },
  glow: { position: 'absolute' },
  titleLight: { fontWeight: '400' },
  titleBold: { fontWeight: '800' },
  subtitle: { marginTop: spacing.xs, textAlign: 'center' },
  card: { paddingTop: spacing.md },
  form: { marginTop: spacing.lg },
  error: { marginTop: -spacing.sm, marginBottom: spacing.md, textAlign: 'center' },
  submitButton: { marginTop: spacing.md },
});
