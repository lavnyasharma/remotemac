// react-native-webrtc wraps a native module (and its own NativeEventEmitter) with no
// JS-only implementation, so it can't run under Jest's plain Node environment — tests get
// bare stubs instead, just enough for the module graph to resolve and construct.
class RTCPeerConnection {
  addEventListener() {}
  createDataChannel() {
    return {
      readyState: 'connecting',
      addEventListener: () => {},
      send: () => {},
      close: () => {},
    };
  }
  async createOffer() {
    return { sdp: '', type: 'offer' };
  }
  async createAnswer() {
    return { sdp: '', type: 'answer' };
  }
  async setLocalDescription() {}
  async setRemoteDescription() {}
  async addIceCandidate() {}
  close() {}
}

class RTCIceCandidate {
  constructor(init) {
    Object.assign(this, init);
  }
}

class RTCSessionDescription {
  constructor(init) {
    Object.assign(this, init);
  }
}

// RTCView is a native video view (requireNativeComponent); a plain no-op
// component is enough for it to mount under react-test-renderer.
function RTCView() {
  return null;
}

module.exports = { RTCPeerConnection, RTCIceCandidate, RTCSessionDescription, RTCView };
