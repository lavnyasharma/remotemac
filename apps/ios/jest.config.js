module.exports = {
  preset: '@react-native/jest-preset',
  // @react-navigation and the react-native-* ecosystem ship untranspiled ESM —
  // Jest's default node_modules ignore has to make an exception for them.
  transformIgnorePatterns: [
    'node_modules/(?!(react-native|@react-native|@react-navigation|react-native-.*)/)',
  ],
};
