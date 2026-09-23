import { getAnalytics, logScreenView as firebaseLogScreenView } from '@react-native-firebase/analytics';

const analytics = getAnalytics();

export function logScreenView(screenName: string): void {
  void firebaseLogScreenView(analytics, {
    screen_name: screenName,
    screen_class: screenName,
  });
}
