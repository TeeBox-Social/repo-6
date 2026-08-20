/**
 * Tiny pub/sub so the tab bar (in app/(tabs)/_layout.tsx) can tell the Feed
 * screen "the user tapped the Feed tab while already on it" without any
 * heavier state-management dependency. The Feed screen scrolls to top and
 * refreshes when it receives this signal — the standard "tap home to go to
 * top" pattern used by most social apps.
 */
type Listener = () => void;

const listeners = new Set<Listener>();

export function subscribeFeedRefresh(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emitFeedRefresh(): void {
  listeners.forEach((l) => l());
}
