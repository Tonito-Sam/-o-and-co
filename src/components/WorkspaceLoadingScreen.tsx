import { BrandLogo } from "@/components/BrandLogo";

export function WorkspaceLoadingScreen({ overlay = false }: { overlay?: boolean }) {
  return (
    <div
      className={`${overlay ? "fixed inset-0 z-[100]" : "min-h-screen"} grid place-items-center bg-[#0d121c] px-6 text-white`}
      role="status"
      aria-live="polite"
    >
      <div className="flex w-full max-w-xs flex-col items-center text-center">
        <BrandLogo className="h-auto w-52 object-contain" />
        <p className="mt-5 text-sm font-medium tracking-[0.18em] text-white/75">
          Spaces that Inspire
        </p>
        <p className="mt-10 text-sm text-white/70">Loading your workspace</p>
        <div
          className="mt-3 h-1 w-56 overflow-hidden rounded-full bg-white/15"
          role="progressbar"
          aria-label="Loading workspace"
        >
          <div className="workspace-loading-bar h-full w-1/3 rounded-full bg-white/85" />
        </div>
      </div>
    </div>
  );
}
