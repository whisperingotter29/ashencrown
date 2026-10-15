// Keyboard + mouse state. Gameplay polls `down`, `pressed` (edge this frame) and mouse info.
export const input = {
  down: new Set(),
  pressed: new Set(),
  released: new Set(),
  mouse: { x: 0, y: 0, nx: 0, ny: 0, left: false, right: false, middle: false, wheel: 0 },
  mousePressed: { left: false, right: false },
  mouseReleased: { left: false, right: false },
  enabled: true,      // false while UI captures input (typing a name etc.)
  uiBlocking: false,  // true when a modal menu is open; gameplay ignores attacks
};

function keyName(e) {
  if (e.code.startsWith('Key')) return e.code.slice(3).toLowerCase();
  if (e.code.startsWith('Digit')) return e.code.slice(5);
  const map = { Space: 'space', ShiftLeft: 'shift', ShiftRight: 'shift', Escape: 'escape', Tab: 'tab',
    ControlLeft: 'ctrl', ControlRight: 'ctrl', Enter: 'enter', AltLeft: 'alt', AltRight: 'alt',
    ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', Backquote: 'backquote' };
  return map[e.code] || e.code.toLowerCase();
}

export function initInput(canvas) {
  window.addEventListener('keydown', (e) => {
    const target = e.target;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
    const k = keyName(e);
    if (k === 'tab' || k === 'space' || (k.length === 1 && /[0-9]/.test(k))) e.preventDefault();
    if (!input.down.has(k)) input.pressed.add(k);
    input.down.add(k);
  });
  window.addEventListener('keyup', (e) => {
    const k = keyName(e);
    input.down.delete(k);
    input.released.add(k);
  });
  window.addEventListener('blur', () => { input.down.clear(); input.mouse.left = input.mouse.right = false; });
  window.addEventListener('mousemove', (e) => {
    input.usingPad = false;
    input.mouse.x = e.clientX; input.mouse.y = e.clientY;
    input.mouse.nx = (e.clientX / window.innerWidth) * 2 - 1;
    input.mouse.ny = -(e.clientY / window.innerHeight) * 2 + 1;
  });
  canvas.addEventListener('mousedown', (e) => {
    if (e.button === 0) { input.mouse.left = true; input.mousePressed.left = true; }
    if (e.button === 2) { input.mouse.right = true; input.mousePressed.right = true; }
    if (e.button === 1) { input.mouse.middle = true; e.preventDefault(); }
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) { input.mouse.left = false; input.mouseReleased.left = true; }
    if (e.button === 2) { input.mouse.right = false; input.mouseReleased.right = true; }
    if (e.button === 1) input.mouse.middle = false;
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('wheel', (e) => { input.mouse.wheel += Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });
}

export function endFrameInput() {
  input.pressed.clear();
  input.released.clear();
  input.mousePressed.left = input.mousePressed.right = false;
  input.mouseReleased.left = input.mouseReleased.right = false;
  input.mouse.wheel = 0;
}

export const key = (k) => input.enabled && input.down.has(k);
export const keyPressed = (k) => input.enabled && input.pressed.has(k);

// ------------------------------------------------------------------ gamepad
// Standard-layout controllers drive the same key/mouse state the game already reads, so every
// system (and the rumble in core/feel.js) works with a pad. Left stick moves, right stick aims,
// RT attacks (hold to keep attacking), LT blocks, A dodges, B interacts, X/Y/RB are the weapon's
// Q/E/R abilities, LB is the class signature, d-pad left/right cycle weapon slots, d-pad up/down are
// potions, L3 sprints, R3 inventory, Start pauses, Back opens the map.
const PAD_KEYS = { 0: 'space', 1: 'f', 2: 'q', 3: 'e', 5: 'r', 4: 'x', 14: 'padprev', 15: 'padnext', 12: 'z', 13: 'v', 10: 'shift', 11: 'i', 9: 'escape', 8: 'm' };
const padHeld = new Set();
let padMouse = { left: false, right: false };
export function pollGamepad(origin) {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  const gp = [...pads].find((p) => p && p.connected);
  if (!gp) return;
  const press = (k, on) => {
    if (on && !padHeld.has(k)) { padHeld.add(k); input.pressed.add(k); input.down.add(k); input.usingPad = true; }
    else if (!on && padHeld.has(k)) { padHeld.delete(k); input.down.delete(k); input.released.add(k); }
  };
  for (const [i, k] of Object.entries(PAD_KEYS)) press(k, !!gp.buttons[i]?.pressed);
  // triggers act as mouse buttons
  const rt = (gp.buttons[7]?.value || 0) > 0.4, lt = (gp.buttons[6]?.value || 0) > 0.4;
  if (rt !== padMouse.left) { padMouse.left = rt; input.mouse.left = rt; if (rt) input.mousePressed.left = true; else input.mouseReleased.left = true; input.usingPad = true; }
  if (lt !== padMouse.right) { padMouse.right = lt; input.mouse.right = lt; if (lt) input.mousePressed.right = true; else input.mouseReleased.right = true; }
  // left stick -> WASD
  const dz = 0.35, lx = gp.axes[0] || 0, ly = gp.axes[1] || 0;
  press('w', ly < -dz); press('s', ly > dz); press('a', lx < -dz); press('d', lx > dz);
  if (Math.hypot(lx, ly) > dz) input.usingPad = true;
  // right stick (or, failing that, the move direction) aims around the player
  if (origin && input.usingPad) {
    const rx = gp.axes[2] || 0, ry = gp.axes[3] || 0;
    const R = Math.min(window.innerWidth, window.innerHeight) * 0.3;
    if (Math.hypot(rx, ry) > 0.3) { input.mouse.x = origin.x + rx * R; input.mouse.y = origin.y + ry * R; }
    else if (Math.hypot(lx, ly) > dz) { input.mouse.x = origin.x + lx * R; input.mouse.y = origin.y + ly * R; }
  }
}
