import { ArrowUpRight } from "lucide-react";

const branches = [
  {
    name: "Rosebank",
    location: "Johannesburg",
    address: ["Level 2, The Zone @Rosebank,", "177 Oxford Rd,", "Rosebank,", "Johannesburg"],
    phone: "+27 10 142 0200",
    phoneLink: "tel:+27101420200",
    directions:
      "https://www.google.com/maps/place/Office+%26+Co.+-+Rosebank/@-26.0997365,28.0399311,11z/data=!4m6!3m5!1s0x1e950daeb3f775a5:0xa495bf956a26da90!8m2!3d-26.1445224!4d28.0437656!16s%2Fg%2F11n04k0pht?entry=ttu&g_ep=EgoyMDI1MDEyNi4wIKXMDSoASAFQAw%3D%3D",
  },
  {
    name: "Kyalami",
    location: "Johannesburg",
    address: ["134 River Road,", "Barbeque Downs,", "Kyalami,", "Johannesburg"],
    phone: "+27 11 267 0500",
    phoneLink: "tel:+27112670500",
    directions:
      "https://www.google.com/maps/place/Office+%26+Co.+-+Kyalami/@-26.0177223,28.0506933,11.89z/data=!4m6!3m5!1s0x1e95718c0643600b:0xd97a1ac67e25191d!8m2!3d-26.0037253!4d28.0730821!16s%2Fg%2F11y31g5nr?entry=tts",
  },
];

export function BranchContactCards({ className = "" }: { className?: string }) {
  return (
    <div className={className}>
      {branches.map((branch) => (
        <section key={branch.name} aria-label={`${branch.name} contact details`}>
          <h3 className="font-display text-sm font-semibold">{branch.name}</h3>
          <p className="mt-1 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
            {branch.location}
          </p>
          <address className="mt-3 not-italic leading-relaxed text-foreground/75">
            {branch.address.map((line) => (
              <span key={line} className="block">
                {line}
              </span>
            ))}
          </address>
          <a
            href={branch.phoneLink}
            className="mt-3 block text-foreground/75 hover:text-foreground"
          >
            Phone: {branch.phone}
          </a>
          <a
            href={branch.directions}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex items-center gap-1 font-medium text-foreground hover:underline"
          >
            Get Directions <ArrowUpRight className="size-3.5" />
          </a>
        </section>
      ))}
    </div>
  );
}
