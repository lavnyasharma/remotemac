// react-native-keychain wraps a native module with no JS-only implementation,
// so it can't run under Jest's plain Node environment — tests get a fake
// in-memory store instead, behaving like a fresh install with nothing saved.
const store = new Map();

function keyFor(options) {
  return options && options.service ? options.service : 'default';
}

module.exports = {
  setGenericPassword: jest.fn(async (username, password, options) => {
    store.set(keyFor(options), { username, password });
    return { service: keyFor(options), storage: 'test' };
  }),
  getGenericPassword: jest.fn(async (options) => {
    return store.get(keyFor(options)) ?? false;
  }),
  resetGenericPassword: jest.fn(async (options) => {
    store.delete(keyFor(options));
    return true;
  }),
};
