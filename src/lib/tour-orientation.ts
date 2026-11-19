type LockableScreenOrientation = ScreenOrientation & {
  lock?: (orientation: "landscape") => Promise<void>;
  unlock?: () => void;
};

export function requestTourLandscape() {
  if (!window.matchMedia("(max-width: 767px)").matches) return;

  const orientation = window.screen?.orientation as LockableScreenOrientation | undefined;
  if (typeof orientation?.lock !== "function") return;

  try {
    void orientation.lock("landscape").catch(() => {
      // The tour remains usable in portrait and prompts the visitor to rotate manually.
    });
  } catch {
    // The tour remains usable in portrait and prompts the visitor to rotate manually.
  }
}

export function releaseTourOrientation() {
  const orientation = window.screen?.orientation as LockableScreenOrientation | undefined;
  if (typeof orientation?.unlock === "function") orientation.unlock();
}
