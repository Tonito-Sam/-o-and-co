type LockableScreenOrientation = ScreenOrientation & {
  lock?: (orientation: "landscape") => Promise<void>;
};

export function requestTourLandscape() {
  if (!window.matchMedia("(max-width: 767px)").matches) return;

  const orientation = window.screen.orientation as LockableScreenOrientation;
  if (typeof orientation?.lock !== "function") return;

  void orientation.lock("landscape").catch(() => {
    // The tour remains usable in portrait and prompts the visitor to rotate manually.
  });
}

export function releaseTourOrientation() {
  window.screen.orientation?.unlock();
}
