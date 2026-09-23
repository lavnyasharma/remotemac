import { RTCIceCandidate, RTCPeerConnection, RTCSessionDescription } from 'react-native-webrtc';
import type { MediaStream } from 'react-native-webrtc';
import type { RTCIceServerConfig } from '../api/apiClient';

export type DataChannelStatus = 'connecting' | 'open' | 'closed';
export type PeerConnectionState = 'new' | 'connecting' | 'connected' | 'disconnected' | 'failed' | 'closed';

export interface RemoteIceCandidate {
  candidate: string;
  sdpMid: string | null;
  sdpMLineIndex: number | null;
}

/**
 * Wraps an `RTCPeerConnection` plus the "control" `RTCDataChannel` it creates
 * as the offerer (the iPhone is always the one who sends the *initial* offer —
 * see protocol.ts). Mirrors signalingClient.ts's shape: a plain class with
 * callbacks, no UI or store concerns.
 *
 * Phase 4 only proved the data channel (ping/pong). This also carries the
 * Mac's remote video track, received once the Mac starts screen capture and
 * renegotiates — see `createAnswerForOffer`, which makes this side answerable
 * for that one mid-session case even though it's never the one who starts a
 * session.
 */
export class WebRTCClient {
  private pc: RTCPeerConnection | null = null;
  private dataChannel: ReturnType<RTCPeerConnection['createDataChannel']> | null = null;

  onIceCandidate: ((candidate: RemoteIceCandidate) => void) | null = null;
  onDataChannelStatusChange: ((status: DataChannelStatus) => void) | null = null;
  onDataChannelMessage: ((data: string) => void) | null = null;
  onRemoteStream: ((stream: MediaStream) => void) | null = null;
  /** The peer connection's overall state — 'disconnected'/'failed' is how a network switch
   * (Wi-Fi <-> cellular) or the Mac going away shows up while a session is live. */
  onConnectionStateChange: ((state: PeerConnectionState) => void) | null = null;

  /**
   * Creates the peer connection and the "control" data channel, and returns
   * the SDP offer to send as `webrtc.offer`. The data channel is created
   * before the offer so its m-line is included in the SDP.
   */
  async createOffer(iceServers: RTCIceServerConfig[]): Promise<string> {
    const pc = new RTCPeerConnection({ iceServers });
    this.pc = pc;

    pc.addEventListener('icecandidate', (event) => {
      if (!event.candidate) return;
      this.onIceCandidate?.({
        candidate: event.candidate.candidate,
        sdpMid: event.candidate.sdpMid ?? null,
        sdpMLineIndex: event.candidate.sdpMLineIndex ?? null,
      });
    });

    pc.addEventListener('connectionstatechange', () => {
      this.onConnectionStateChange?.(pc.connectionState as PeerConnectionState);
    });

    pc.addEventListener('track', (event) => {
      const stream = event.streams[0];
      if (stream) this.onRemoteStream?.(stream);
    });

    const dataChannel = pc.createDataChannel('control', { ordered: true });
    this.attachDataChannel(dataChannel);

    const offer = await pc.createOffer({});
    await pc.setLocalDescription(offer);
    return offer.sdp;
  }

  async setRemoteAnswer(sdp: string): Promise<void> {
    if (!this.pc) throw new Error('WebRTCClient: no peer connection (call createOffer first)');
    await this.pc.setRemoteDescription(new RTCSessionDescription({ sdp, type: 'answer' }));
  }

  async addRemoteIceCandidate(candidate: RemoteIceCandidate): Promise<void> {
    if (!this.pc) throw new Error('WebRTCClient: no peer connection (call createOffer first)');
    await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
  }

  /**
   * Handles a Mac-initiated renegotiation on the already-open connection
   * (e.g. once it starts screen capture and adds a video track): applies the
   * Mac's offer, answers, and returns the SDP to send back as `webrtc.answer`.
   */
  async createAnswerForOffer(sdp: string): Promise<string> {
    if (!this.pc) throw new Error('WebRTCClient: no peer connection (call createOffer first)');
    await this.pc.setRemoteDescription(new RTCSessionDescription({ sdp, type: 'offer' }));
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    return answer.sdp;
  }

  send(data: string): void {
    if (!this.dataChannel || this.dataChannel.readyState !== 'open') {
      throw new Error('WebRTCClient: data channel is not open');
    }
    this.dataChannel.send(data);
  }

  close(): void {
    this.dataChannel?.close();
    this.dataChannel = null;
    this.pc?.close();
    this.pc = null;
  }

  private attachDataChannel(channel: ReturnType<RTCPeerConnection['createDataChannel']>): void {
    this.dataChannel = channel;
    this.onDataChannelStatusChange?.('connecting');
    channel.addEventListener('open', () => this.onDataChannelStatusChange?.('open'));
    channel.addEventListener('close', () => this.onDataChannelStatusChange?.('closed'));
    channel.addEventListener('error', () => this.onDataChannelStatusChange?.('closed'));
    channel.addEventListener('message', (event) => {
      if (typeof event.data === 'string') this.onDataChannelMessage?.(event.data);
    });
  }
}
