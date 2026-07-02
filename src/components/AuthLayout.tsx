import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { BrandLogo } from "@/components/BrandLogo";

export function AuthLayout({
  eyebrow, title, subtitle, children, footer,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Brand panel */}
      <div className="relative hidden lg:flex flex-col justify-between bg-primary text-primary-foreground p-10 overflow-hidden">
        <div className="absolute inset-0 surface-grid opacity-[0.06]" />
        <div className="relative">
          <Link to="/welcome" className="flex items-center gap-3">
            <div className="grid size-11 place-items-center rounded-lg bg-white/10 backdrop-blur">
              <BrandLogo className="size-7 object-contain" />
            </div>
            <div className="leading-tight">
              <div className="font-display text-base font-semibold">Office &amp; Co</div>
              <div className="text-[11px] text-white/60">WorkspaceOS</div>
            </div>
          </Link>
        </div>
        <div className="relative max-w-md">
          <div className="text-[11px] uppercase tracking-[0.2em] text-white/50 mb-3">A workspace platform built for scale</div>
          <h2 className="font-display text-3xl font-semibold leading-tight">
            The operating system for Africa's most ambitious workspaces.
          </h2>
          <p className="mt-4 text-sm text-white/70 leading-relaxed">
            Kyalami · Bryanston · Rosebank · Union Station — and the cities still to come.
            One platform. Every member, every booking, every branch.
          </p>
          <div className="mt-8 flex items-center gap-3 text-[11px] text-white/50">
            <span className="size-1.5 rounded-full bg-success" /> SOC 2 · POPIA · ISO 27001
          </div>
        </div>
        <div className="relative text-[11px] text-white/40">© {new Date().getFullYear()} Office &amp; Co Group.</div>
      </div>

      {/* Form panel */}
      <div className="flex flex-col justify-center px-6 sm:px-12 py-12">
        <div className="mx-auto w-full max-w-md">
          {eyebrow && <div className="text-[11px] uppercase tracking-[0.18em] text-brand font-medium mb-2">{eyebrow}</div>}
          <h1 className="font-display text-2xl md:text-3xl font-semibold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>}
          <div className="mt-8">{children}</div>
          {footer && <div className="mt-8 text-xs text-muted-foreground text-center">{footer}</div>}
        </div>
      </div>
    </div>
  );
}
