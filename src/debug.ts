/**
 * Development-only overlay switch. Add `?debug=1` to the URL to show station
 * labels and a small status panel. During `npm run dev` the D key also toggles
 * it (the managed emulator window cannot change its URL); that key handler is
 * compiled out of production builds. Nothing here runs in the editor realm.
 */
export const debug = {
  enabled:
    typeof location !== 'undefined' &&
    new URLSearchParams(location.search).get('debug') === '1',
};

/** Lines shown on the debug panel; each system can register a provider. */
export const debugLines: Array<() => string> = [];
