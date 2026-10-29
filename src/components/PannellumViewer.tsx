// src/components/PannellumViewer.tsx
import { useCallback, useEffect, useRef } from "react";
import "pannellum/build/pannellum.css";

type PannellumHotspotConfig = {
  id: string;
  pitch: number;
  yaw: number;
  type: "info";
  text: string;
  cssClass?: string;
  clickHandler?: () => void;
};

type PannellumInstance = {
  on: (event: string, callback: (message?: string) => void) => void;
  destroy: () => void;
  setAutoRotate?: (speed: number, reverse?: boolean) => void;
  removeHotSpots?: () => void;
  addHotSpot?: (hotspot: PannellumHotspotConfig) => void;
};

declare global {
  interface Window {
    pannellum?: {
      viewer: (container: HTMLElement, config: Record<string, unknown>) => PannellumInstance;
    };
  }
}

export type PannellumHotspot = {
  id?: string;
  pitch: number;          // -90 (down) to 90 (up)
  yaw: number;            // -180 to 180 (0 = forward)
  text?: string;
  cssClass?: string;
  clickHandler?: () => void;
};

export type PannellumViewerProps = {
  image: string;                      // equirectangular panorama (2:1)
  yaw?: number;
  pitch?: number;
  hfov?: number;                      // horizontal FOV, default 100
  minHfov?: number;
  maxHfov?: number;
  autoRotate?: number;                // degrees per second, -5..5 (0 = off)
  showControls?: boolean;
  compass?: boolean;
  hotspots?: PannellumHotspot[];
  className?: string;
  onLoad?: () => void;
  onError?: (message: string) => void;
};

export function PannellumViewer({
  image,
  yaw = 0,
  pitch = 0,
  hfov = 100,
  minHfov = 50,
  maxHfov = 120,
  autoRotate = 0,
  showControls = true,
  compass = false,
  hotspots = [],
  className,
  onLoad,
  onError,
}: PannellumViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<PannellumInstance | null>(null);

  // Mount / remount when the image changes — Pannellum has no "setPanorama",
  // so we destroy and rebuild. Fast enough (< 100ms) for tour navigation.
  useEffect(() => {
    let cancelled = false;

    void import("pannellum/build/pannellum.js").then(() => {
      const container = containerRef.current;
      const pannellum = window.pannellum;
      if (cancelled || !container || !pannellum) return;

      viewerRef.current = pannellum.viewer(container, {
        type: "equirectangular",
        panorama: image,
        autoLoad: true,
        yaw,
        pitch,
        hfov,
        minHfov,
        maxHfov,
        autoRotate,
        showControls,
        compass,
        hotSpots: hotspots.map((hotspot, index) => ({
          id: hotspot.id ?? `hs-${index}`,
          pitch: hotspot.pitch,
          yaw: hotspot.yaw,
          type: "info",
          text: hotspot.text ?? "",
          cssClass: hotspot.cssClass,
          clickHandler: hotspot.clickHandler,
        })),
      });

      viewerRef.current.on("load", () => onLoad?.());
      viewerRef.current.on("error", (message) => onError?.(message ?? "Panorama failed to load."));
    }).catch((error: unknown) => {
      if (!cancelled) onError?.(error instanceof Error ? error.message : "Unable to load the panorama viewer.");
    });

    return () => {
      cancelled = true;
      try {
        viewerRef.current?.destroy();
      } catch {
        /* noop */
      }
      viewerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [image]);

  // Update hotspots / autorotate without destroying the viewer.
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    viewer.setAutoRotate?.(autoRotate, autoRotate < 0);
    viewer.removeHotSpots?.();
    hotspots.forEach((hotspot, index) => {
      viewer.addHotSpot?.({
        id: hotspot.id ?? `hs-${index}`,
        pitch: hotspot.pitch,
        yaw: hotspot.yaw,
        type: "info",
        text: hotspot.text ?? "",
        cssClass: hotspot.cssClass,
        clickHandler: hotspot.clickHandler,
      });
    });
  }, [hotspots, autoRotate]);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ width: "100%", height: "100%" }}
    />
  );
}