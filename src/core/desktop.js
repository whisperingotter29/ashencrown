// The desktop (Electron) shell exposes window.ashenDesktop; in a browser this is null and the
// game behaves exactly as on the web.
export const desktop = (typeof window !== 'undefined' && window.ashenDesktop) || null;
