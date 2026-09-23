/**
 * Typed builders for the mouse/keyboard wire contract sent over the "control"
 * data channel (see pairingStore.ts's `sendControlMessage`). Fixed by the Mac
 * side — do not change shapes here without updating that contract on both
 * ends. Every message is fire-and-forget: no ack is ever expected.
 */

export type NamedKey =
  | 'Escape'
  | 'Tab'
  | 'Enter'
  | 'Backspace'
  | 'Delete'
  | 'ArrowUp'
  | 'ArrowDown'
  | 'ArrowLeft'
  | 'ArrowRight'
  | 'Home'
  | 'End'
  | 'PageUp'
  | 'PageDown';

export type Modifier = 'shift' | 'control' | 'option' | 'command';

export interface Point {
  x: number;
  y: number;
}

export const controlMessages = {
  mouseMove: (point: Point) => ({ type: 'mouse.move', payload: point }),
  mouseDown: (point: Point) => ({ type: 'mouse.down', payload: point }),
  mouseUp: (point: Point) => ({ type: 'mouse.up', payload: point }),
  mouseClick: (point: Point) => ({ type: 'mouse.click', payload: point }),
  mouseRightClick: (point: Point) => ({ type: 'mouse.rightClick', payload: point }),
  mouseDoubleClick: (point: Point) => ({ type: 'mouse.doubleClick', payload: point }),
  mouseScroll: (deltaX: number, deltaY: number) => ({ type: 'mouse.scroll', payload: { deltaX, deltaY } }),
  keyboardKey: (key: NamedKey | string, down: boolean) => ({ type: 'keyboard.key', payload: { key, down } }),
  keyboardText: (text: string) => ({ type: 'keyboard.text', payload: { text } }),
  keyboardModifier: (modifier: Modifier, down: boolean) => ({ type: 'keyboard.modifier', payload: { modifier, down } }),
};
