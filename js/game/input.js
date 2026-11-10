// Unified input: keyboard, gamepad (standard mapping) and touch buttons -> one action set.
// Actions are "pressed this frame" flags plus a stick vector and an optional absolute aim point.
export const KEYMAP = {
  swing: ['Space', 'KeyJ'], power: ['KeyK'], bunt: ['KeyL'], steal: ['KeyQ'],
  throw: ['Space', 'KeyJ'], pitch0: ['Digit1'], pitch1: ['Digit2'], pitch2: ['Digit3'], pitch3: ['Digit4'], pitch4: ['Digit5'],
  b1: ['ArrowRight'], b2: ['ArrowUp'], b3: ['ArrowLeft'], b4: ['ArrowDown'], cut: ['KeyC'],
  goAll: ['KeyE'], backAll: ['KeyR'], pause: ['Escape', 'KeyP'], skip: ['Enter', 'NumpadEnter'],
};
// pad: 0 A, 1 B, 2 X, 3 Y, 4 LB, 5 RB, 6 LT, 7 RT, 9 START
export const PADMAP = {
  swing: [0], power: [1], bunt: [2], steal: [4], throw: [0], pitchPrev: [4], pitchNext: [5],
  b1: [1], b2: [3], b3: [2], b4: [0], cut: [4], goAll: [7], backAll: [6], pause: [9], skip: [0],
};
export class Input {
  constructor(el) {
    this.el = el; this.down = new Set(); this.edge = new Set(); this.padPrev = []; this.touchEdge = new Set();
    this.stick = { x: 0, y: 0 }; this.abs = null; this.mouseMoved = false; this.lastDevice = (matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window) ? 'touch' : 'keys';
    this.drag = null; this.rel = { x: 0, y: 0 };
    this.onKey = e => {
      if (e.repeat) return;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      this.down.add(e.code); this.edge.add(e.code); this.lastDevice = 'keys';
    };
    this.onKeyUp = e => this.down.delete(e.code);
    this.onMouse = e => { if (e.pointerType === 'touch') return; this.mouse = { x: e.clientX, y: e.clientY }; this.mouseMoved = true; this.lastDevice = 'keys'; };
    this.onMouseDown = e => { if (e.pointerType === 'touch' || e.target.closest('.hud-btn,.pause-menu,.hud-top button')) return; if (e.button === 0) this.edge.add('Mouse0'); if (e.button === 2) this.edge.add('Mouse2'); };
    this.onCtx = e => e.preventDefault();
    // touch drag (left part of the screen) = relative aim
    this.onTouchStart = e => {
      this.lastDevice = 'touch';
      for (const t of e.changedTouches) {
        if (t.target.closest && t.target.closest('.hud-btn,.pause-menu,.hud-top button,.card-skip')) continue;
        if (!this.drag) { this.drag = { id: t.identifier, x: t.clientX, y: t.clientY }; }
        this.touchEdge.add('tap');
      }
    };
    this.onTouchMove = e => {
      for (const t of e.changedTouches) if (this.drag && t.identifier === this.drag.id) {
        this.rel.x += t.clientX - this.drag.x; this.rel.y += t.clientY - this.drag.y; this.drag.x = t.clientX; this.drag.y = t.clientY;
      }
      e.preventDefault();
    };
    this.onTouchEnd = e => { for (const t of e.changedTouches) if (this.drag && t.identifier === this.drag.id) this.drag = null; };
    addEventListener('keydown', this.onKey); addEventListener('keyup', this.onKeyUp);
    el.addEventListener('pointermove', this.onMouse); el.addEventListener('pointerdown', this.onMouseDown); el.addEventListener('contextmenu', this.onCtx);
    el.addEventListener('touchstart', this.onTouchStart, { passive: true }); el.addEventListener('touchmove', this.onTouchMove, { passive: false }); el.addEventListener('touchend', this.onTouchEnd);
  }
  // on-screen button press
  tap(action) { this.touchEdge.add(action); this.lastDevice = 'touch'; }
  poll() {
    const out = { press: {}, stick: { x: 0, y: 0 }, rel: { ...this.rel } };
    this.rel = { x: 0, y: 0 };
    // keyboard
    const has = codes => codes.some(c => this.edge.has(c));
    for (const [a, codes] of Object.entries(KEYMAP)) if (has(codes)) out.press[a] = true;
    if (this.edge.has('Mouse0')) { out.press.swing = out.press.throw = true; }
    if (this.edge.has('Mouse2')) out.press.power = true;
    const d = c => this.down.has(c);
    out.stick.x = (d('KeyD') ? 1 : 0) - (d('KeyA') ? 1 : 0);
    out.stick.y = (d('KeyW') ? 1 : 0) - (d('KeyS') ? 1 : 0);
    if (d('ShiftLeft') || d('ShiftRight')) { if (out.press.goAll) out.press.goAll = true; }
    // gamepad
    const pads = navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : [];
    if (pads.length) {
      const p = pads[0], btn = i => !!(p.buttons[i] && p.buttons[i].pressed);
      const now = p.buttons.map((b, i) => btn(i));
      for (const [a, ids] of Object.entries(PADMAP)) if (ids.some(i => now[i] && !this.padPrev[i])) { out.press[a] = true; this.lastDevice = 'pad'; out.pad = true; }
      // d-pad also throws to bases (diamond)
      const dpad = { b1: 15, b2: 12, b3: 14, b4: 13, pitchPrev: 14, pitchNext: 15 };
      for (const [a, i] of Object.entries(dpad)) if (now[i] && !this.padPrev[i]) { out.press[a] = true; out.padDpad = true; }
      const ax = p.axes[0] || 0, ay = p.axes[1] || 0, dz = 0.18;
      if (Math.abs(ax) > dz || Math.abs(ay) > dz) { out.stick.x = ax; out.stick.y = -ay; this.lastDevice = 'pad'; }
      this.padPrev = now;
    }
    for (const a of this.touchEdge) out.press[a] = true;
    if (this.mouseMoved && this.mouse) { out.mouse = this.mouse; this.mouseMoved = false; }
    out.device = this.lastDevice;
    this.edge.clear(); this.touchEdge.clear();
    return out;
  }
  dispose() {
    removeEventListener('keydown', this.onKey); removeEventListener('keyup', this.onKeyUp);
    this.el.removeEventListener('pointermove', this.onMouse); this.el.removeEventListener('pointerdown', this.onMouseDown);
    this.el.removeEventListener('touchstart', this.onTouchStart); this.el.removeEventListener('touchmove', this.onTouchMove); this.el.removeEventListener('touchend', this.onTouchEnd);
  }
}
