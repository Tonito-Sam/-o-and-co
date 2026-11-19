import { ArrowRight } from "lucide-react";

type WhyOfficeAndCoProps = {
  sectionId: string;
  locationsHref: string;
  onOpenTourSelector: () => void;
};

const stats = [
  { value: "365", label: "Days open for you" },
  { value: "100", label: "Customisable Layouts" },
  { value: "100%", label: "Commitment to your success" },
];

export function WhyOfficeAndCo({
  sectionId,
  locationsHref,
  onOpenTourSelector,
}: WhyOfficeAndCoProps) {
  return (
    <section
      id={sectionId}
      aria-labelledby={`${sectionId}-heading`}
      className="relative overflow-hidden bg-[#0b0b0d] text-white"
    >
      <div className="pointer-events-none absolute -left-32 top-0 size-[28rem] rounded-full bg-amber-300/10 blur-[120px]" />
      <div className="pointer-events-none absolute -right-32 bottom-0 size-[28rem] rounded-full bg-cyan-400/10 blur-[120px]" />

      <div className="relative mx-auto max-w-6xl px-6 py-24 sm:py-32">
        <div className="flex items-center gap-3">
          <span className="h-px w-10 bg-gradient-to-r from-amber-200/80 to-transparent" />
          <span className="text-xs font-medium uppercase tracking-[0.28em] text-amber-200/80">
            Why Office &amp; Co
          </span>
        </div>

        <h2
          id={`${sectionId}-heading`}
          className="mt-6 max-w-3xl font-display text-4xl font-medium leading-[1.08] tracking-tight sm:text-5xl md:text-6xl"
        >
          Room to focus.{" "}
          <span className="bg-gradient-to-r from-amber-100 via-white to-cyan-100 bg-clip-text text-transparent">
            Space to bring people together.
          </span>
        </h2>

        <p className="mt-6 max-w-2xl text-base leading-relaxed text-white/60 sm:text-lg">
          Private offices and meeting rooms in Kyalami and Rosebank, with Union Station for company
          gatherings and events.
        </p>

        <div className="mt-16 grid gap-10 md:grid-cols-[1.1fr_0.9fr] md:gap-16">
          <div>
            <p className="font-display text-2xl font-medium leading-snug tracking-tight text-white sm:text-3xl">
              Spaces that inspire dreams to come alive.
            </p>
            <p className="mt-5 max-w-xl text-sm leading-relaxed text-white/55 sm:text-base">
              Every corner is designed for ideas to take root — quiet rooms for deep focus, open
              rooms for bold thinking, and gathering spaces where collaboration turns into momentum.
              This is where innovation finds its address.
            </p>
          </div>

          <div className="space-y-6">
            <blockquote className="border-l border-amber-200/30 pl-5">
              <p className="font-display text-lg italic leading-snug text-white/85">
                “The spaces we inhabit shape the thoughts we dare to have.”
              </p>
              <footer className="mt-2 text-xs uppercase tracking-[0.2em] text-white/40">
                A belief we build by
              </footer>
            </blockquote>

            <blockquote className="border-l border-cyan-200/30 pl-5">
              <p className="font-display text-lg italic leading-snug text-white/85">
                “Build a room worth dreaming in — the work will follow.”
              </p>
              <footer className="mt-2 text-xs uppercase tracking-[0.2em] text-white/40">
                Office &amp; Co
              </footer>
            </blockquote>
          </div>
        </div>

        <div className="mt-20 grid gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 sm:grid-cols-3">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="group relative flex flex-col items-center justify-center bg-[#0b0b0d] px-6 py-10 text-center transition-colors hover:bg-white/[0.03] sm:py-12"
            >
              <span className="font-display text-4xl font-medium tracking-tight text-white sm:text-5xl">
                {stat.value}
              </span>
              <span className="mt-3 text-xs uppercase tracking-[0.22em] text-white/45 sm:text-sm sm:tracking-[0.18em]">
                {stat.label}
              </span>
              <span className="pointer-events-none absolute inset-x-8 bottom-0 h-px bg-gradient-to-r from-transparent via-amber-200/40 to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
            </div>
          ))}
        </div>

        <div className="mt-14 flex flex-wrap items-center gap-4">
          <a
            href={locationsHref}
            className="group inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-medium text-black transition hover:bg-white/90"
          >
            Explore the branches
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
          </a>
          <button
            type="button"
            onClick={onOpenTourSelector}
            className="inline-flex items-center gap-2 rounded-full border border-white/15 px-6 py-3 text-sm font-medium text-white/80 transition hover:border-white/40 hover:text-white"
          >
            Take a virtual tour
          </button>
        </div>
      </div>
    </section>
  );
}
