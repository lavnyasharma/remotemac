import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  TextInput,
  InputAccessoryView,
  ActivityIndicator,
  PanResponder,
  useWindowDimensions,
  type GestureResponderEvent,
  type PanResponderGestureState,
  type TextInputKeyPressEvent,
  type TextInputInstance,
  type NativeTouchEvent,
} from 'react-native';
import { RTCView } from 'react-native-webrtc';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../types/navigation';
import { usePairingStore } from '../../state/pairingStore';
import { useScreenPreferencesStore } from '../../state/screenPreferencesStore';
import { controlMessages, type Modifier, type NamedKey, type Point } from '../../services/webrtc/controlMessages';
import { consoleColors } from '../../theme/colors';
import { Icon, SegmentedControl, ScreenContainer } from '../../components';

const cc = consoleColors;
/** Surfaces here are elevation levels of the console's own dark chrome, not brand tokens. */
const surface = {
  videoArea: '#111111',
  keycap: 'rgba(255,255,255,0.14)',
  keycapActive: cc.accent,
  joystickBase: 'rgba(255,255,255,0.08)',
  joystickBaseBorder: 'rgba(255,255,255,0.2)',
};

type Props = NativeStackScreenProps<RootStackParamList, 'Screen'>;

const LONG_PRESS_MS = 400;
const TAP_MAX_DURATION_MS = 300;
const TAP_MAX_MOVEMENT_PX = 10;
const DOUBLE_TAP_WINDOW_MS = 250;
const MOVE_THROTTLE_MS = 33;
const CURSOR_SENSITIVITY = 1.6;
const SCROLL_SENSITIVITY = 1;

const JOYSTICK_RADIUS = 46;
const JOYSTICK_TICK_MS = 33;
const JOYSTICK_MAX_SPEED = 0.018; // fraction of the Mac's screen moved per tick at full deflection

const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
// Below this, a two-finger gesture is treated as "not really pinching" — its movement goes
// to scroll as before; above it, movement pans the zoomed view instead (see the wire-up in
// the PanResponder's two-touch branch).
const ZOOM_ACTIVE_THRESHOLD = 1.02;

type ControlMode = 'move' | 'drag' | 'scroll';

// Without this, the accessory toolbar just sits in normal document flow below the control
// surface — the system keyboard (a separate native layer RN doesn't account for automatically)
// then slides up on top of it, hiding every modifier/arrow key behind the keyboard itself.
// InputAccessoryView instead docks the toolbar natively right above the keyboard, so it's
// always visible while typing regardless of where it'd otherwise land in the layout.
const KEYBOARD_ACCESSORY_ID = 'screenModeKeyboardAccessory';

const MODE_OPTIONS = [
  { value: 'move' as const, label: 'Mouse' },
  { value: 'scroll' as const, label: 'Scroll' },
  { value: 'drag' as const, label: 'Drag' },
];

const SPEED_MULTIPLIERS = [1, 1.5, 2, 2.5, 3];

/** onKeyPress's `nativeEvent.key` values that map onto the wire contract's named keys. */
const NAMED_KEYS: Record<string, NamedKey> = {
  Escape: 'Escape',
  Tab: 'Tab',
  Enter: 'Enter',
  Backspace: 'Backspace',
  Delete: 'Delete',
  ArrowUp: 'ArrowUp',
  ArrowDown: 'ArrowDown',
  ArrowLeft: 'ArrowLeft',
  ArrowRight: 'ArrowRight',
  Home: 'Home',
  End: 'End',
  PageUp: 'PageUp',
  PageDown: 'PageDown',
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function averageTouch(touches: readonly NativeTouchEvent[]): Point {
  const x = (touches[0].pageX + touches[1].pageX) / 2;
  const y = (touches[0].pageY + touches[1].pageY) / 2;
  return { x, y };
}

function touchDistance(touches: readonly NativeTouchEvent[]): number {
  return Math.hypot(touches[0].pageX - touches[1].pageX, touches[0].pageY - touches[1].pageY);
}

/**
 * The rect `objectFit="contain"` actually renders the video into within its display box —
 * centered, letterboxed on whichever axis the aspect ratios don't match. Needed because a
 * Mac's (usually landscape, wide) display very often doesn't match the phone's (usually
 * taller) video area, so assuming the video fills the whole box is wrong most of the time,
 * not just at the edges.
 */
function computeContainedRect(
  container: { width: number; height: number },
  content: { width: number; height: number },
): { x: number; y: number; width: number; height: number } {
  const containerAspect = container.width / container.height;
  const contentAspect = content.width / content.height;
  let width: number;
  let height: number;
  if (contentAspect > containerAspect) {
    width = container.width;
    height = container.width / contentAspect;
  } else {
    height = container.height;
    width = container.height * contentAspect;
  }
  return { x: (container.width - width) / 2, y: (container.height - height) / 2, width, height };
}

/**
 * Maps a touch point local to the video view (relative to its own top-left) back through
 * the current pinch-zoom transform, then through `objectFit="contain"`'s letterboxing, onto
 * a normalized [0,1] position in the actual video content. Returns null if the tap landed
 * in a letterbox bar (not on the video content itself) — callers should ignore it rather
 * than guess. `contentSize` is the Mac's actual captured pixel dimensions (see `video.info`
 * in pairingStore); until that first arrives, this falls back to assuming full-bleed.
 */
function mapVideoTouchToContent(
  localX: number,
  localY: number,
  container: { width: number; height: number },
  scale: number,
  offset: { x: number; y: number },
  contentSize: { width: number; height: number } | null,
): Point | null {
  // Undo the pinch-zoom transform first — it's applied to the whole video box, on top of
  // whatever `objectFit="contain"` already rendered inside it.
  const cx = container.width / 2;
  const cy = container.height / 2;
  const unzoomedX = (localX - cx) / scale - offset.x + cx;
  const unzoomedY = (localY - cy) / scale - offset.y + cy;

  if (!contentSize) {
    return { x: clamp(unzoomedX / container.width, 0, 1), y: clamp(unzoomedY / container.height, 0, 1) };
  }

  const rect = computeContainedRect(container, contentSize);
  const relX = unzoomedX - rect.x;
  const relY = unzoomedY - rect.y;
  if (relX < 0 || relX > rect.width || relY < 0 || relY > rect.height) return null;
  return { x: clamp(relX / rect.width, 0, 1), y: clamp(relY / rect.height, 0, 1) };
}

/**
 * The Screen Mode view (build plan §18-20, mockup around "Main iPhone screen"/"Screen"):
 * remote video on top, a dedicated touchpad surface below it (not tap-on-video-to-click),
 * plus a keyboard toolbar. Talks to the Mac exclusively through pairingStore's existing
 * WebRTCClient/data-channel machinery — this component owns gesture interpretation only.
 */
export function ScreenScreen({ navigation, route }: Props) {
  const { devicePairId, macDeviceName } = route.params;

  const showJoystick = useScreenPreferencesStore((state) => state.showJoystick);
  const showTrackpad = useScreenPreferencesStore((state) => state.showTrackpad);
  const showTrackpadRef = useRef(showTrackpad);
  useEffect(() => {
    showTrackpadRef.current = showTrackpad;
  }, [showTrackpad]);
  // HIG layout.md: "Aim to support both portrait and landscape orientations." A Mac's display
  // is itself landscape, so letting the control surface re-flow sideways (video gets the wide
  // dimension, touchpad/joystick stack in a narrower rail) matters more here than in most apps.
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const isLandscape = windowWidth > windowHeight;
  const remoteStream = usePairingStore((state) => state.remoteStream);
  const videoContentSize = usePairingStore((state) => state.videoContentSize);
  const videoContentSizeRef = useRef(videoContentSize);
  useEffect(() => {
    videoContentSizeRef.current = videoContentSize;
  }, [videoContentSize]);
  const dataChannelStatus = usePairingStore((state) => state.dataChannelStatus);
  const screenSessionStatus = usePairingStore((state) => state.screenSessionStatus);
  const connectScreenSession = usePairingStore((state) => state.connectScreenSession);
  const endScreenSession = usePairingStore((state) => state.endScreenSession);
  const sendControlMessage = usePairingStore((state) => state.sendControlMessage);

  useEffect(() => {
    void connectScreenSession(devicePairId);
    // Leaving Screen Mode stops the automatic reconnects that keep its session alive.
    return () => endScreenSession();
    // Intentionally once per mount: connectScreenSession tears down and re-establishes
    // its own WebRTC session internally, so re-running it on every render would just
    // restart the connection for no reason.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [devicePairId]);

  // The data channel connecting doesn't mean video is coming — the Mac only adds a video
  // track once Screen Recording (and Accessibility) permission is granted there, which is
  // a manual step on the user's first run. Without this, a Mac stuck on the permission
  // prompt leaves the iPhone spinning forever with no explanation.
  const [waitedTooLong, setWaitedTooLong] = useState(false);
  useEffect(() => {
    setWaitedTooLong(false);
    if (remoteStream || screenSessionStatus.kind !== 'connected') return;
    const timer = setTimeout(() => setWaitedTooLong(true), 15000);
    return () => clearTimeout(timer);
  }, [remoteStream, screenSessionStatus.kind]);

  // Virtual absolute cursor, per build plan §19 — a touchpad reports relative motion,
  // so the on-screen (well, on-Mac) cursor position is tracked here and only ever
  // nudged by deltas, starting centered.
  const cursorRef = useRef<Point>({ x: 0.5, y: 0.5 });
  const touchpadSizeRef = useRef({ width: 1, height: 1 });

  const gestureRef = useRef({
    startedAt: 0,
    movement: 0,
    isLongPressActive: false,
    isDragging: false,
    singleTouch: null as Point | null,
    twoTouchAvg: null as Point | null,
    twoTouchDistance: null as number | null,
    // `locationX/Y` for a *second* touch has a history of being unreliable on RN/iOS, so
    // multi-touch math here otherwise sticks to `pageX/Y` (reliable for every touch) — this
    // is a one-time, gesture-lifetime conversion from that page space to `controlSurface`-
    // local space, captured from the first (single, definitely-reliable) touch at grant time,
    // used only to place the pinch's anchor point for the zoom-to-point math below.
    pageToLocalOffset: null as Point | null,
    longPressTimer: null as ReturnType<typeof setTimeout> | null,
    pendingClickTimer: null as ReturnType<typeof setTimeout> | null,
    lastMoveSentAt: 0,
  });

  // Pinch-to-zoom on the video — a local viewing aid, but tapping directly on the video
  // (see `mapVideoTouchToContent` below) needs it too, to map a tap through whatever zoom
  // is currently applied back onto the right point in the actual (unzoomed) content.
  const [zoomScale, setZoomScaleState] = useState(1);
  const [zoomOffset, setZoomOffsetState] = useState({ x: 0, y: 0 });
  const zoomScaleRef = useRef(1);
  const zoomOffsetRef = useRef({ x: 0, y: 0 });
  // Position/size of the video, relative to `controlSurface` (its parent, and the view the
  // PanResponder below is attached to) — lets a touch's `locationX/Y` (already relative to
  // that same parent) be tested against the video's bounds and remapped into its content.
  const videoAreaLayoutRef = useRef({ x: 0, y: 0, width: 1, height: 1 });
  const videoAreaSizeRef = useRef({ width: 1, height: 1 });

  // Mutate the ref synchronously (not via a `useEffect` mirror, which only catches up after
  // the next render commits) so a PanResponder move handler two frames into the same pinch —
  // which can easily fire faster than React re-renders — always reads the value the previous
  // frame just set, rather than a stale one.
  const setZoomScale = useCallback((next: number | ((prev: number) => number)) => {
    setZoomScaleState((prev) => {
      const value = typeof next === 'function' ? next(prev) : next;
      zoomScaleRef.current = value;
      return value;
    });
  }, []);
  const setZoomOffset = useCallback(
    (next: { x: number; y: number } | ((prev: { x: number; y: number }) => { x: number; y: number })) => {
      setZoomOffsetState((prev) => {
        const value = typeof next === 'function' ? next(prev) : next;
        zoomOffsetRef.current = value;
        return value;
      });
    },
    [],
  );

  const resetZoom = useCallback(() => {
    setZoomScale(1);
    setZoomOffset({ x: 0, y: 0 });
  }, [setZoomScale, setZoomOffset]);

  // Native touch-move can fire well above 60Hz (up to the display's refresh rate), but a pinch
  // gesture below wrote zoomScale/zoomOffset to React state on every single one of those events —
  // driving a full re-render of this ~1000-line screen at whatever rate the OS delivers touches,
  // during the one gesture (zoom) where smoothness matters most. The refs are still updated
  // synchronously every touch-move (the pinch/pan math below reads them back mid-gesture), but
  // committing that to React state — and thus to RTCView's transform — is now coalesced to at
  // most once per animation frame, matching the display instead of the touch sampler.
  const zoomRenderScheduledRef = useRef(false);
  const scheduleZoomRender = useCallback(() => {
    if (zoomRenderScheduledRef.current) return;
    zoomRenderScheduledRef.current = true;
    requestAnimationFrame(() => {
      zoomRenderScheduledRef.current = false;
      setZoomScaleState(zoomScaleRef.current);
      setZoomOffsetState(zoomOffsetRef.current);
    });
  }, []);

  const [activeModifiers, setActiveModifiers] = useState<Record<Modifier, boolean>>({
    shift: false,
    control: false,
    option: false,
    command: false,
  });
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const textInputRef = useRef<TextInputInstance>(null);

  // 'drag'/'scroll' are one-shot: pick the mode, do one gesture, it reverts to 'move'
  // afterward — a `controlModeRef` mirror avoids the PanResponder callbacks (created once,
  // in a ref) closing over a stale `controlMode` value.
  const [controlMode, setControlMode] = useState<ControlMode>('move');
  const controlModeRef = useRef<ControlMode>('move');
  useEffect(() => {
    controlModeRef.current = controlMode;
  }, [controlMode]);

  const clearLongPressTimer = () => {
    const g = gestureRef.current;
    if (g.longPressTimer) {
      clearTimeout(g.longPressTimer);
      g.longPressTimer = null;
    }
  };

  const moveCursorBy = useCallback(
    (dx: number, dy: number) => {
      const { width, height } = touchpadSizeRef.current;
      const next = {
        x: clamp(cursorRef.current.x + (dx / width) * CURSOR_SENSITIVITY, 0, 1),
        y: clamp(cursorRef.current.y + (dy / height) * CURSOR_SENSITIVITY, 0, 1),
      };
      cursorRef.current = next;

      const g = gestureRef.current;
      const now = Date.now();
      if (now - g.lastMoveSentAt >= MOVE_THROTTLE_MS) {
        g.lastMoveSentAt = now;
        sendControlMessage(controlMessages.mouseMove(next));
      }
    },
    [sendControlMessage],
  );

  // For the joystick: a direct, fixed-fraction nudge rather than the touchpad's
  // pixel-relative-to-view-size delta — the joystick's own tick loop already paces this,
  // so no throttling is needed here.
  const nudgeCursor = useCallback(
    (fx: number, fy: number) => {
      const next = {
        x: clamp(cursorRef.current.x + fx, 0, 1),
        y: clamp(cursorRef.current.y + fy, 0, 1),
      };
      cursorRef.current = next;
      sendControlMessage(controlMessages.mouseMove(next));
    },
    [sendControlMessage],
  );

  const finishGesture = useCallback(() => {
    const g = gestureRef.current;
    const mode = controlModeRef.current;
    clearLongPressTimer();

    if (g.isLongPressActive) {
      sendControlMessage(controlMessages.mouseUp(cursorRef.current));
    } else if (!g.isDragging && mode !== 'scroll') {
      const duration = Date.now() - g.startedAt;
      if (duration <= TAP_MAX_DURATION_MS && g.movement <= TAP_MAX_MOVEMENT_PX) {
        const point = cursorRef.current;
        if (g.pendingClickTimer) {
          clearTimeout(g.pendingClickTimer);
          g.pendingClickTimer = null;
          sendControlMessage(controlMessages.mouseDoubleClick(point));
        } else {
          g.pendingClickTimer = setTimeout(() => {
            g.pendingClickTimer = null;
            sendControlMessage(controlMessages.mouseClick(point));
          }, DOUBLE_TAP_WINDOW_MS);
        }
      }
    }

    g.isLongPressActive = false;
    g.isDragging = false;
    g.singleTouch = null;
    g.twoTouchAvg = null;
    g.twoTouchDistance = null;

    // Pinched back down near 1x — snap fully back rather than leaving a barely-there zoom.
    if (zoomScaleRef.current <= ZOOM_ACTIVE_THRESHOLD) resetZoom();
  }, [sendControlMessage, resetZoom]);

  useEffect(() => {
    const g = gestureRef.current;
    return () => {
      if (g.longPressTimer) clearTimeout(g.longPressTimer);
      if (g.pendingClickTimer) clearTimeout(g.pendingClickTimer);
    };
  }, []);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      // Capture-phase variants too: without them, a second finger landing mid-gesture is only
      // guaranteed to reach this handler via bubbling, which on the New Architecture (the only
      // one RN 0.87 ships) has been unreliable for claiming an already-in-progress touch — the
      // classic symptom is single-finger drags/taps working fine while two-finger pinches don't
      // consistently register. Safe to claim unconditionally here because the joystick (the one
      // other independent PanResponder on this screen) now lives entirely outside this view,
      // not nested inside it — there's nothing left for this capture to steal it from.
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponderCapture: () => true,
      onPanResponderGrant: (evt: GestureResponderEvent) => {
        const g = gestureRef.current;
        const touches = evt.nativeEvent.touches;
        g.startedAt = Date.now();
        g.movement = 0;
        g.isLongPressActive = false;
        g.isDragging = false;
        g.singleTouch = touches.length === 1 ? { x: touches[0].pageX, y: touches[0].pageY } : null;
        g.twoTouchAvg = touches.length >= 2 ? averageTouch(touches) : null;
        g.twoTouchDistance = touches.length >= 2 ? touchDistance(touches) : null;

        // Captured unconditionally (not just for a single-touch start) — a pinch that begins
        // with both fingers already down never sees `touches.length === 1` at grant, and
        // without this the two-touch zoom math below has no page->local offset to anchor to,
        // so the pinch would only pan/scroll and never actually change the zoom scale.
        g.pageToLocalOffset = {
          x: touches[0].pageX - touches[0].locationX,
          y: touches[0].pageY - touches[0].locationY,
        };

        if (touches.length === 1) {
          // `locationX/Y` are relative to `controlSurface` (the view these handlers are
          // attached to) — the same frame `videoAreaLayoutRef` was captured in — so a touch
          // starting inside the video's bounds can be mapped straight to a point on the Mac's
          // screen and the virtual cursor warped there. Tapping an icon then really clicks it,
          // instead of clicking wherever the cursor happened to be left from before.
          const layout = videoAreaLayoutRef.current;
          const loc = { x: touches[0].locationX, y: touches[0].locationY };
          const isOnVideo =
            loc.x >= layout.x && loc.x <= layout.x + layout.width && loc.y >= layout.y && loc.y <= layout.y + layout.height;
          if (isOnVideo) {
            const mapped = mapVideoTouchToContent(
              loc.x - layout.x,
              loc.y - layout.y,
              videoAreaSizeRef.current,
              zoomScaleRef.current,
              zoomOffsetRef.current,
              videoContentSizeRef.current,
            );
            // null means the tap landed in a letterbox bar, not the video itself — leave
            // the cursor wherever it already was rather than warping it somewhere wrong.
            if (mapped) {
              cursorRef.current = mapped;
              sendControlMessage(controlMessages.mouseMove(mapped));
            }
          }

          const mode = controlModeRef.current;
          if (mode === 'drag') {
            // Explicit Drag mode: press down immediately, no long-press wait — the button
            // itself already signalled intent.
            g.isLongPressActive = true;
            sendControlMessage(controlMessages.mouseDown(cursorRef.current));
          } else if (mode === 'move') {
            g.longPressTimer = setTimeout(() => {
              g.isLongPressActive = true;
              sendControlMessage(controlMessages.mouseDown(cursorRef.current));
            }, LONG_PRESS_MS);
          }
          // mode === 'scroll': nothing to do on touch-down, handled as movement arrives.
        }
      },
      onPanResponderMove: (evt: GestureResponderEvent) => {
        const g = gestureRef.current;
        const touches = evt.nativeEvent.touches;

        if (touches.length >= 2) {
          g.singleTouch = null;
          clearLongPressTimer();
          if (g.isLongPressActive) {
            sendControlMessage(controlMessages.mouseUp(cursorRef.current));
            g.isLongPressActive = false;
          }
          const avg = averageTouch(touches);
          const dist = touchDistance(touches);
          const { width, height } = videoAreaSizeRef.current;
          const cx = width / 2;
          const cy = height / 2;
          const clampOffset = (offset: Point, scale: number): Point => {
            const maxX = (width * (scale - 1)) / 2;
            const maxY = (height * (scale - 1)) / 2;
            return { x: clamp(offset.x, -maxX, maxX), y: clamp(offset.y, -maxY, maxY) };
          };

          if (g.twoTouchDistance && g.pageToLocalOffset) {
            const ratio = dist / g.twoTouchDistance;
            const s0 = zoomScaleRef.current;
            const s1 = clamp(s0 * ratio, MIN_ZOOM, MAX_ZOOM);
            const effectiveRatio = s1 / s0; // may differ from `ratio` once clamped at a bound
            if (effectiveRatio !== 1) {
              // Zoom anchored at the pinch midpoint: solve for the offset that keeps the
              // point under the fingers visually fixed as scale goes s0 -> s1, rather than
              // always zooming from the video's center regardless of where you pinch.
              const localX = avg.x - g.pageToLocalOffset.x - videoAreaLayoutRef.current.x;
              const localY = avg.y - g.pageToLocalOffset.y - videoAreaLayoutRef.current.y;
              const o0 = zoomOffsetRef.current;
              const anchored = {
                x: ((localX - cx) / s0) * (1 / effectiveRatio - 1) + o0.x,
                y: ((localY - cy) / s0) * (1 / effectiveRatio - 1) + o0.y,
              };
              zoomScaleRef.current = s1;
              zoomOffsetRef.current = clampOffset(anchored, s1);
              scheduleZoomRender();
            }
          }

          if (g.twoTouchAvg) {
            const dx = avg.x - g.twoTouchAvg.x;
            const dy = avg.y - g.twoTouchAvg.y;
            if (zoomScaleRef.current > ZOOM_ACTIVE_THRESHOLD) {
              // Zoomed in: two-finger movement pans the zoomed view locally instead of
              // scrolling the Mac — you're navigating your own close-up, not its content.
              if (dx !== 0 || dy !== 0) {
                const prev = zoomOffsetRef.current;
                zoomOffsetRef.current = clampOffset({ x: prev.x + dx, y: prev.y + dy }, zoomScaleRef.current);
                scheduleZoomRender();
              }
            } else if (dx !== 0 || dy !== 0) {
              // "Natural" scrolling: content follows the fingers' direction.
              sendControlMessage(controlMessages.mouseScroll(-dx * SCROLL_SENSITIVITY, -dy * SCROLL_SENSITIVITY));
            }
          }
          g.twoTouchAvg = avg;
          g.twoTouchDistance = dist;
          return;
        }

        g.twoTouchAvg = null;
        g.twoTouchDistance = null;
        if (touches.length !== 1) return;

        const point = { x: touches[0].pageX, y: touches[0].pageY };
        if (g.singleTouch) {
          const dx = point.x - g.singleTouch.x;
          const dy = point.y - g.singleTouch.y;
          g.movement += Math.hypot(dx, dy);

          if (controlModeRef.current === 'scroll') {
            if (dx !== 0 || dy !== 0) {
              sendControlMessage(controlMessages.mouseScroll(-dx * SCROLL_SENSITIVITY, -dy * SCROLL_SENSITIVITY));
            }
          } else if (!showTrackpadRef.current) {
            // Direct touch: the cursor jumps straight to wherever the finger is on the video,
            // like a touchscreen, instead of accumulating relative deltas like a trackpad.
            if (!g.isDragging && g.movement > TAP_MAX_MOVEMENT_PX) g.isDragging = true;
            if (g.pageToLocalOffset) {
              const layout = videoAreaLayoutRef.current;
              const localX = point.x - g.pageToLocalOffset.x - layout.x;
              const localY = point.y - g.pageToLocalOffset.y - layout.y;
              const mapped = mapVideoTouchToContent(
                localX,
                localY,
                videoAreaSizeRef.current,
                zoomScaleRef.current,
                zoomOffsetRef.current,
                videoContentSizeRef.current,
              );
              if (mapped) {
                cursorRef.current = mapped;
                const now = Date.now();
                if (now - g.lastMoveSentAt >= MOVE_THROTTLE_MS) {
                  g.lastMoveSentAt = now;
                  sendControlMessage(controlMessages.mouseMove(mapped));
                }
              }
            }
          } else {
            if (!g.isLongPressActive && !g.isDragging && g.movement > TAP_MAX_MOVEMENT_PX) {
              g.isDragging = true;
              clearLongPressTimer();
            }

            if (g.isLongPressActive || g.isDragging) {
              moveCursorBy(dx, dy);
            }
          }
        }
        g.singleTouch = point;
      },
      onPanResponderRelease: finishGesture,
      onPanResponderTerminate: finishGesture,
    }),
  ).current;

  const toggleModifier = (modifier: Modifier) => {
    setActiveModifiers((prev) => {
      const next = !prev[modifier];
      sendControlMessage(controlMessages.keyboardModifier(modifier, next));
      return { ...prev, [modifier]: next };
    });
  };

  const sendNamedKey = (key: NamedKey) => {
    sendControlMessage(controlMessages.keyboardKey(key, true));
    sendControlMessage(controlMessages.keyboardKey(key, false));
  };

  // Special keys go through NAMED_KEYS as keyboard.key down+up pairs; everything else
  // (letters, numbers, symbols, including non-ASCII) is literal keyboard.text. Using
  // onKeyPress alone (not onChangeText too) avoids sending each character twice.
  const handleKeyPress = (e: TextInputKeyPressEvent) => {
    const key = e.nativeEvent.key;
    const namedKey = NAMED_KEYS[key];
    if (namedKey) {
      sendNamedKey(namedKey);
      return;
    }
    if (key.length > 0) {
      sendControlMessage(controlMessages.keyboardText(key));
    }
  };

  const openKeyboard = () => {
    setKeyboardVisible(true);
    requestAnimationFrame(() => textInputRef.current?.focus());
  };

  // Recreating this array/object literal inline on every render gave RTCView (a native view)
  // a new style reference each time, forcing RN to re-diff and re-apply the transform even when
  // nothing changed. Now that zoom commits are already rAF-throttled (see scheduleZoomRender
  // above), this also avoids redoing the array/object allocation on renders unrelated to zoom.
  const videoStyle = useMemo(
    () => [
      styles.video,
      { transform: [{ translateX: zoomOffset.x }, { translateY: zoomOffset.y }, { scale: zoomScale }] },
    ],
    [zoomOffset.x, zoomOffset.y, zoomScale],
  );

  const statusLabel = (() => {
    switch (screenSessionStatus.kind) {
      case 'connecting':
        return 'Connecting…';
      case 'reconnecting':
        return 'Connection lost — reconnecting…';
      case 'connected':
        if (remoteStream) return 'Connected';
        return waitedTooLong
          ? 'Still no video — check Screen Recording permission on the Mac'
          : `Waiting for ${macDeviceName}'s screen…`;
      case 'failed':
        return screenSessionStatus.message;
      case 'idle':
        return '';
    }
  })();

  return (
    <ScreenContainer edges={['top', 'bottom']} backgroundColor={cc.background}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Pressable
            onPress={() => navigation.goBack()}
            hitSlop={8}
            style={[styles.circleButton, { backgroundColor: surface.keycap }]}
            accessibilityRole="button"
            accessibilityLabel="Back to Devices"
          >
            <Icon name="chevronLeft" color={cc.label} size={16} strokeWidth={2.4} />
          </Pressable>
          <Text style={styles.backText} numberOfLines={1}>
            {macDeviceName}
          </Text>
        </View>
        <Pressable
          onPress={openKeyboard}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Show keyboard"
          style={[styles.keyboardToggle, { backgroundColor: surface.keycap }]}
        >
          <Text style={styles.keyboardToggleText}>Keyboard</Text>
        </Pressable>
      </View>

      <View style={styles.statusRow} accessibilityRole="text" accessibilityLabel={statusLabel}>
        <View style={[styles.dot, { backgroundColor: dataChannelStatus === 'open' ? cc.positive : cc.labelTertiary }]} />
        <Text style={styles.statusText}>{statusLabel}</Text>
      </View>
      <View style={styles.modeRow}>
        <SegmentedControl
          options={MODE_OPTIONS}
          value={controlMode}
          onChange={setControlMode}
          colors={{ fill: surface.keycap, accent: cc.accent, label: cc.labelSecondary, labelOnAccent: cc.accentContrast }}
        />
      </View>

      {/* The whole area below — video included — is one touch surface (tap/drag/scroll
          work anywhere on it, not just in a separate strip), per the request that touching
          anywhere should control the cursor. The video itself stays purely visual; touches
          are only ever interpreted here, never passed to RTCView. */}
      <View
        style={[styles.controlSurface, isLandscape && styles.controlSurfaceLandscape]}
        onLayout={(e) => {
          touchpadSizeRef.current = { width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height };
        }}
        {...panResponder.panHandlers}
      >
        <View
          style={styles.videoArea}
          pointerEvents="box-none"
          onLayout={(e) => {
            const { x, y, width, height } = e.nativeEvent.layout;
            videoAreaSizeRef.current = { width, height };
            videoAreaLayoutRef.current = { x, y, width, height };
          }}
        >
          {remoteStream ? (
            <RTCView streamURL={remoteStream.toURL()} style={videoStyle} objectFit="contain" />
          ) : (
            <View style={styles.videoPlaceholder}>
              {waitedTooLong ? (
                <Text style={styles.videoPlaceholderText}>
                  No video yet. On the Mac, open RemoteMac → Settings and grant Screen Recording
                  (and Accessibility, for control) to RemoteMac, then reopen this screen.
                </Text>
              ) : (
                <ActivityIndicator />
              )}
            </View>
          )}
          {/*
            `RTCView` is a raw native view, not a plain RN `<View>` — some native components
            like this one don't reliably let touches pass through a `pointerEvents="box-none"`
            ancestor the way a plain View does, which was silently swallowing gestures started
            directly over the video (working only on the touchpad strip below it instead). An
            ordinary transparent View on top is what actually gets hit-tested, and — having no
            responder handlers of its own — correctly lets `controlSurface`'s PanResponder
            claim it, same as everywhere else on this screen.
          */}
          <View style={StyleSheet.absoluteFill} />
          {zoomScale > ZOOM_ACTIVE_THRESHOLD && (
            <Pressable
              style={styles.zoomResetButton}
              onPress={resetZoom}
              hitSlop={10}
              pointerEvents="auto"
              accessibilityRole="button"
              accessibilityLabel={`Reset zoom, currently ${Math.round(zoomScale * 10) / 10} times`}
            >
              <Icon name="xmark" color={cc.accentContrast} size={13} strokeWidth={1.5} />
              <Text style={styles.zoomResetText}>Reset Zoom ({Math.round(zoomScale * 10) / 10}×)</Text>
            </Pressable>
          )}
          {!showTrackpad && zoomScale <= ZOOM_ACTIVE_THRESHOLD && (
            <View style={styles.directTouchHint} pointerEvents="none">
              <Text style={styles.directTouchHintText}>touch the screen to move the cursor · pinch to zoom</Text>
            </View>
          )}
        </View>

        {/* The touchpad, when shown, is the surface's only other child besides the video —
            it needs to stay inside `controlSurface` since it's just a visual hint over the
            same PanResponder-driven area, not a separately-interactive region. The joystick
            has its own independent PanResponder and doesn't belong in this touch surface at
            all (see the joystick row below, rendered as a sibling of this whole view) — nested
            here, it would have to fight this view's pinch/pan handling for every touch that
            starts on it. */}
        {showTrackpad && (
          <View style={styles.touchpad} pointerEvents="none">
            <Text style={styles.touchpadHint}>
              tap an icon on the screen above to click it directly, or use this area as a
              relative trackpad — hold and drag, two fingers to scroll or pinch to zoom
            </Text>
          </View>
        )}
      </View>

      {showJoystick && (
        <View style={styles.joystickRow}>
          <Pressable
            onPress={() => navigation.goBack()}
            hitSlop={8}
            style={styles.roundIconButton}
            accessibilityRole="button"
            accessibilityLabel="Back to Devices"
          >
            <Icon name="xmark" color={cc.label} size={16} strokeWidth={2} />
          </Pressable>
          <CursorJoystick onNudge={nudgeCursor} />
          <Pressable
            onPress={openKeyboard}
            hitSlop={8}
            style={styles.roundIconButton}
            accessibilityRole="button"
            accessibilityLabel="Show keyboard"
          >
            <Icon name="keyboard" color={cc.label} size={18} strokeWidth={1.6} />
          </Pressable>
        </View>
      )}

      {/* Explicit click buttons — always available regardless of Trackpad/Joystick settings,
          since a plain tap on the video already doubles as a left click but there was no way
          to right-click at all without them. */}
      <View style={styles.clickButtonsRow}>
        <Pressable
          onPress={() => sendControlMessage(controlMessages.mouseClick(cursorRef.current))}
          style={styles.clickButton}
          accessibilityRole="button"
          accessibilityLabel="Left click"
        >
          <Text style={styles.clickButtonText}>L</Text>
        </Pressable>
        <Pressable
          onPress={() => sendControlMessage(controlMessages.mouseRightClick(cursorRef.current))}
          style={styles.clickButton}
          accessibilityRole="button"
          accessibilityLabel="Right click"
        >
          <Text style={styles.clickButtonText}>R</Text>
        </Pressable>
      </View>

      {/* The TextInput must be a sibling of InputAccessoryView, not a child of it — nesting it
          inside would make it depend on the accessory view being visible to be reachable at
          all, while the accessory view only becomes visible once this input is focused. */}
      {keyboardVisible && (
        <TextInput
          ref={textInputRef}
          style={styles.hiddenTextInput}
          onKeyPress={handleKeyPress}
          autoCorrect={false}
          autoCapitalize="none"
          blurOnSubmit={false}
          onBlur={() => setKeyboardVisible(false)}
          inputAccessoryViewID={KEYBOARD_ACCESSORY_ID}
          accessibilityLabel="Keyboard input"
          accessibilityHint="Types are sent to the Mac as keystrokes"
        />
      )}

      {keyboardVisible && (
        <InputAccessoryView nativeID={KEYBOARD_ACCESSORY_ID} style={styles.keyboardAccessory}>
          <View style={styles.accessoryHeader}>
            <Pressable
              onPress={() => textInputRef.current?.blur()}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Close keyboard"
            >
              <Text style={styles.accessoryDoneText}>Done</Text>
            </Pressable>
          </View>
          <View style={styles.accessoryRow}>
            {(['control', 'option', 'command', 'shift'] as Modifier[]).map((modifier) => (
              <Pressable
                key={modifier}
                style={[styles.accessoryKey, activeModifiers[modifier] && styles.accessoryKeyActive]}
                onPress={() => toggleModifier(modifier)}
                accessibilityRole="button"
                accessibilityLabel={`${modifierAccessibilityLabel(modifier)} key`}
                accessibilityState={{ selected: activeModifiers[modifier] }}
              >
                <Text style={styles.accessoryKeyText}>{modifierLabel(modifier)}</Text>
              </Pressable>
            ))}
            <Pressable style={styles.accessoryKey} onPress={() => sendNamedKey('Escape')} accessibilityRole="button" accessibilityLabel="Escape key">
              <Text style={styles.accessoryKeyText}>esc</Text>
            </Pressable>
            <Pressable style={styles.accessoryKey} onPress={() => sendNamedKey('Tab')} accessibilityRole="button" accessibilityLabel="Tab key">
              <Text style={styles.accessoryKeyText}>tab</Text>
            </Pressable>
          </View>
          <View style={styles.accessoryRow}>
            <Pressable style={styles.accessoryKey} onPress={() => sendNamedKey('ArrowLeft')} accessibilityRole="button" accessibilityLabel="Left arrow key">
              <Text style={styles.accessoryKeyText}>{'←'}</Text>
            </Pressable>
            <Pressable style={styles.accessoryKey} onPress={() => sendNamedKey('ArrowUp')} accessibilityRole="button" accessibilityLabel="Up arrow key">
              <Text style={styles.accessoryKeyText}>{'↑'}</Text>
            </Pressable>
            <Pressable style={styles.accessoryKey} onPress={() => sendNamedKey('ArrowDown')} accessibilityRole="button" accessibilityLabel="Down arrow key">
              <Text style={styles.accessoryKeyText}>{'↓'}</Text>
            </Pressable>
            <Pressable style={styles.accessoryKey} onPress={() => sendNamedKey('ArrowRight')} accessibilityRole="button" accessibilityLabel="Right arrow key">
              <Text style={styles.accessoryKeyText}>{'→'}</Text>
            </Pressable>
            <Pressable style={styles.accessoryKey} onPress={() => sendNamedKey('Home')} accessibilityRole="button" accessibilityLabel="Home key">
              <Text style={styles.accessoryKeyText}>home</Text>
            </Pressable>
            <Pressable style={styles.accessoryKey} onPress={() => sendNamedKey('End')} accessibilityRole="button" accessibilityLabel="End key">
              <Text style={styles.accessoryKeyText}>end</Text>
            </Pressable>
          </View>
        </InputAccessoryView>
      )}
    </ScreenContainer>
  );
}

/** How far the whole joystick button visually leans toward a drag — a subtle tactile cue,
 * independent of `JOYSTICK_RADIUS` (which governs the actual cursor-speed curve below). */
const JOYSTICK_VISUAL_LEAN_PX = 14;

function formatSpeedMultiplier(multiplier: number): string {
  return `${Number.isInteger(multiplier) ? multiplier.toFixed(0) : multiplier.toFixed(1)}×`;
}

/**
 * A single-button analog stick for fine cursor control, as an alternative to dragging on the
 * touchpad surface — hold and deflect it in a direction, the cursor keeps moving that way
 * (speed proportional to deflection) until released, when it leans back to center. Double-tap
 * cycles a speed multiplier (shown as its own label), since the joystick otherwise has no
 * "click" of its own to spend on a secondary gesture.
 */
const CursorJoystick = React.memo(function CursorJoystickInner({
  onNudge,
}: {
  onNudge: (fx: number, fy: number) => void;
}) {
  const [lean, setLean] = useState({ x: 0, y: 0 });
  const [speedIndex, setSpeedIndex] = useState(0);
  const speedRef = useRef(SPEED_MULTIPLIERS[0]);
  useEffect(() => {
    speedRef.current = SPEED_MULTIPLIERS[speedIndex];
  }, [speedIndex]);
  const deflectionRef = useRef({ x: 0, y: 0 });
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const movementRef = useRef(0);
  const lastTapAtRef = useRef(0);

  const stop = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    // A quick, low-movement press-and-release is a tap; two of those inside the double-tap
    // window cycle the speed multiplier instead of nudging the cursor at all.
    if (movementRef.current <= TAP_MAX_MOVEMENT_PX) {
      const now = Date.now();
      if (now - lastTapAtRef.current <= DOUBLE_TAP_WINDOW_MS) {
        setSpeedIndex((i) => (i + 1) % SPEED_MULTIPLIERS.length);
        lastTapAtRef.current = 0;
      } else {
        lastTapAtRef.current = now;
      }
    }
    movementRef.current = 0;
    deflectionRef.current = { x: 0, y: 0 };
    setLean({ x: 0, y: 0 });
  }, []);

  useEffect(() => stop, [stop]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        if (intervalRef.current) return;
        intervalRef.current = setInterval(() => {
          const { x, y } = deflectionRef.current;
          if (x !== 0 || y !== 0) {
            onNudge(x * JOYSTICK_MAX_SPEED * speedRef.current, y * JOYSTICK_MAX_SPEED * speedRef.current);
          }
        }, JOYSTICK_TICK_MS);
      },
      onPanResponderMove: (_evt: GestureResponderEvent, gestureState: PanResponderGestureState) => {
        const { dx, dy } = gestureState;
        movementRef.current = Math.hypot(dx, dy);
        const clampedDistance = Math.min(movementRef.current, JOYSTICK_RADIUS);
        const scale = movementRef.current > JOYSTICK_RADIUS ? JOYSTICK_RADIUS / movementRef.current : 1;
        const x = dx * scale;
        const y = dy * scale;
        const unitX = clampedDistance > 0 ? x / clampedDistance : 0;
        const unitY = clampedDistance > 0 ? y / clampedDistance : 0;
        // The visual lean is capped well short of the full drag radius — a subtle "press
        // toward the direction" cue rather than a nub traveling the button's whole width.
        setLean({ x: unitX * Math.min(clampedDistance, JOYSTICK_VISUAL_LEAN_PX), y: unitY * Math.min(clampedDistance, JOYSTICK_VISUAL_LEAN_PX) });
        // Cursor speed itself uses a quadratic ease of the normalized deflection (direction
        // preserved): small nudges near center move the cursor slowly for precise placement,
        // while the full range up to the edge still reaches the same top speed. A plain linear
        // mapping made every small nudge feel about as fast as a large one.
        const normalized = clampedDistance / JOYSTICK_RADIUS;
        const eased = normalized * normalized;
        deflectionRef.current = { x: unitX * eased, y: unitY * eased };
      },
      onPanResponderRelease: stop,
      onPanResponderTerminate: stop,
    }),
  ).current;

  return (
    <View
      style={[styles.joystickBase, { transform: [{ translateX: lean.x }, { translateY: lean.y }] }]}
      accessibilityLabel="Cursor joystick"
      accessibilityHint="Drag to move the pointer; double-tap to cycle speed"
      {...panResponder.panHandlers}
    >
      <Text style={styles.joystickSpeedText}>{formatSpeedMultiplier(SPEED_MULTIPLIERS[speedIndex])}</Text>
    </View>
  );
});

function modifierLabel(modifier: Modifier): string {
  switch (modifier) {
    case 'shift':
      return 'shift';
    case 'control':
      return 'ctrl';
    case 'option':
      return 'opt';
    case 'command':
      return 'cmd';
  }
}

function modifierAccessibilityLabel(modifier: Modifier): string {
  switch (modifier) {
    case 'shift':
      return 'Shift';
    case 'control':
      return 'Control';
    case 'option':
      return 'Option';
    case 'command':
      return 'Command';
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: cc.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  headerLeft: { flexShrink: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  circleButton: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  backText: { flexShrink: 1, color: cc.label, fontSize: 17, fontWeight: '600' },
  keyboardToggle: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999 },
  keyboardToggleText: { color: cc.accent, fontSize: 14, fontWeight: '600' },
  statusRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 8 },
  dot: { width: 7, height: 7, borderRadius: 3.5, marginRight: 6 },
  statusText: { color: cc.labelSecondary, fontSize: 12 },
  modeRow: { paddingHorizontal: 8, marginBottom: 4 },
  // `padding` + `gap` (rather than per-child margins) keeps this spacing correct in both
  // flexDirections below — no separate portrait/landscape margin math to keep in sync.
  controlSurface: { flex: 5, flexDirection: 'column', padding: 8, gap: 8 },
  controlSurfaceLandscape: { flexDirection: 'row' },
  videoArea: { flex: 3, backgroundColor: surface.videoArea, borderRadius: 18, overflow: 'hidden' },
  video: { flex: 1 },
  videoPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  videoPlaceholderText: { color: cc.labelSecondary, textAlign: 'center', lineHeight: 20 },
  zoomResetButton: {
    position: 'absolute',
    top: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: cc.accent,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  zoomResetText: { color: cc.accentContrast, fontSize: 14, fontWeight: '700' },
  directTouchHint: {
    position: 'absolute',
    bottom: 10,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
  },
  directTouchHintText: { color: cc.labelSecondary, fontSize: 11, fontWeight: '600' },
  // The touchpad hint box, when shown, takes the same proportion of `controlSurface` that the
  // old shared touchpad+joystick row used to (flex: 2 against the video's flex: 3) — the
  // joystick no longer lives here at all (see `joystickRow` below, a sibling of the whole
  // `controlSurface` view), so there's nothing left to share this space with.
  touchpad: {
    flex: 2,
    borderRadius: 18,
    backgroundColor: surface.videoArea,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  touchpadHint: { color: cc.labelTertiary, fontSize: 13, textAlign: 'center' },
  joystickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 28,
    paddingVertical: 12,
  },
  roundIconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: surface.keycap,
    alignItems: 'center',
    justifyContent: 'center',
  },
  joystickBase: {
    width: JOYSTICK_RADIUS * 2,
    height: JOYSTICK_RADIUS * 2,
    borderRadius: JOYSTICK_RADIUS,
    backgroundColor: surface.joystickBase,
    borderWidth: 1,
    borderColor: surface.joystickBaseBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  joystickSpeedText: { color: cc.label, fontSize: 15, fontWeight: '700' },
  clickButtonsRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingBottom: 12 },
  clickButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: surface.keycap,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clickButtonText: { color: cc.label, fontSize: 15, fontWeight: '700', letterSpacing: 1 },
  keyboardAccessory: { backgroundColor: cc.backgroundSecondary, padding: 8 },
  accessoryHeader: { flexDirection: 'row', justifyContent: 'flex-end', paddingBottom: 6 },
  accessoryDoneText: { color: cc.accent, fontSize: 15, fontWeight: '700' },
  accessoryRow: { flexDirection: 'row', marginBottom: 6, gap: 4 },
  accessoryKey: {
    flex: 1,
    minHeight: 40,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: surface.keycap,
    alignItems: 'center',
    justifyContent: 'center',
  },
  accessoryKeyActive: { backgroundColor: surface.keycapActive },
  accessoryKeyText: { color: cc.label, fontSize: 13, fontWeight: '600' },
  // Off-screen rather than `opacity: 0` so it's still reachable for focus/VoiceOver, but never
  // visually competes with the accessory toolbar that now carries the visible typing UI.
  hiddenTextInput: { position: 'absolute', width: 1, height: 1, left: -9999 },
});
