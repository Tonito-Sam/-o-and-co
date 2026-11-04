// Mock data for Office & Co WorkspaceOS

import invoiceLogo from "@/assets/OCO-Stacked-Logo-White-300px.png";

export const branches = [
  {
    id: "kyalami",
    name: "Kyalami",
    region: "Gauteng",
    city: "Johannesburg",
    occupancy: 0.84,
    revenue: 2_410_000,
    status: "live" as const,
  },
  {
    id: "bryanston",
    name: "Bryanston",
    region: "Gauteng",
    city: "Johannesburg",
    occupancy: 0.89,
    revenue: 2_780_000,
    status: "closed" as const,
  },
  {
    id: "rosebank",
    name: "Rosebank",
    region: "Gauteng",
    city: "Johannesburg",
    occupancy: 0.78,
    revenue: 1_910_000,
    status: "live" as const,
  },
  {
    id: "union-station",
    name: "Union Station",
    region: "Gauteng",
    city: "Johannesburg",
    occupancy: 0.72,
    revenue: 1_540_000,
    status: "closed" as const,
    kind: "Corporate Event Venue" as const,
  },
  {
    id: "sandton",
    name: "Sandton (Coming Soon)",
    region: "Gauteng",
    city: "Johannesburg",
    occupancy: 0,
    revenue: 0,
    status: "planned" as const,
  },
  {
    id: "cpt-waterfront",
    name: "Cape Town · V&A (Pipeline)",
    region: "Western Cape",
    city: "Cape Town",
    occupancy: 0,
    revenue: 0,
    status: "planned" as const,
  },
  {
    id: "dbn-umhlanga",
    name: "Durban · Umhlanga (Exploring)",
    region: "KwaZulu-Natal",
    city: "Durban",
    occupancy: 0,
    revenue: 0,
    status: "planned" as const,
  },
];

export const revenueTrend = [
  { month: "Jan", revenue: 6.2, target: 6.0 },
  { month: "Feb", revenue: 6.5, target: 6.3 },
  { month: "Mar", revenue: 6.8, target: 6.5 },
  { month: "Apr", revenue: 6.9, target: 6.7 },
  { month: "May", revenue: 7.0, target: 6.9 },
  { month: "Jun", revenue: 7.1, target: 7.0 },
  { month: "Jul", revenue: 7.3, target: 7.1 },
  { month: "Aug", revenue: 7.5, target: 7.2 },
];

export type Lead = {
  id: string;
  company: string;
  contact: string;
  source: string;
  stage: string;
  value: number;
  score: number;
  branch: string;
  owner: string;
};

export const leads: Lead[] = [];

export const stages = [
  "New Lead",
  "Contacted",
  "Qualified",
  "Tour Scheduled",
  "Proposal Sent",
  "Negotiation",
  "Contract Sent",
  "Contract Signed",
  "Onboarding",
  "Active Tenant",
  "Lost",
] as const;

export type Tenant = {
  id: string;
  name: string;
  plan: string;
  branch: string;
  since: string;
  mrr: number;
  members: number;
  health: string;
};

export const tenants: Tenant[] = [];

export const spaces = [
  {
    id: "BR-01",
    name: "Atlas Boardroom",
    type: "Boardroom",
    branch: "Bryanston",
    floor: 3,
    capacity: 16,
    status: "In Use",
    until: "14:30",
    monthlyRent: 45000,
  },
  {
    id: "MR-08",
    name: "Karoo Meeting Room",
    type: "Meeting Room",
    branch: "Kyalami",
    floor: 2,
    capacity: 8,
    status: "Available",
    until: "—",
    monthlyRent: 30000,
  },
  {
    id: "ST-02",
    name: "Podcast Studio B",
    type: "Podcast Studio",
    branch: "Rosebank",
    floor: 2,
    capacity: 4,
    status: "Booked",
    until: "16:00",
    monthlyRent: 22000,
  },
  {
    id: "EV-01",
    name: "The Loft",
    type: "Event Space",
    branch: "Bryanston",
    floor: 1,
    capacity: 120,
    status: "Available",
    until: "—",
    monthlyRent: 68000,
  },
  {
    id: "HD-22",
    name: "Hot Desk Bank North",
    type: "Hot Desks",
    branch: "Kyalami",
    floor: 1,
    capacity: 24,
    status: "Partial",
    until: "—",
    monthlyRent: 28000,
  },
  {
    id: "TR-04",
    name: "Cedar Training Room",
    type: "Training Room",
    branch: "Rosebank",
    floor: 3,
    capacity: 30,
    status: "Available",
    until: "—",
    monthlyRent: 34000,
  },
];

export const invoices: Invoice[] = [];

export type InvoiceStatus =
  "Paid" | "Sent" | "Overdue" | "Draft" | "Pending verification" | "Unpaid";
export type InvoiceMethod =
  "Charge to account" | "Cash on Delivery" | "Paystack" | "PayFast" | "EFT" | "—";
export type InvoiceItem = { name: string; qty: number; price: number; image?: string };
export type Invoice = {
  id: string;
  tenant: string;
  amount: number;
  status: InvoiceStatus;
  due: string;
  method: InvoiceMethod;
  items: InvoiceItem[];
  issuedAt: string;
  orderedBy?: string;
  branch?: string;
  kind?: "cafe" | "marketplace";
  note?: string;
};

export const PAYSTACK_PUBLIC_KEY = "pk_test_1234567890abcdef";

const invoiceStorageKey = "oco-generated-invoices";
export const legacyDemoTenantNames = new Set([
  "Ember & Co.",
  "Helix Ventures",
  "Mosaic Studio",
  "Northwind Legal",
  "Tundra Capital",
]);

const escapePdfText = (text: string) =>
  text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");

type PdfTextBlock = {
  text: string;
  x: number;
  y: number;
  size: number;
  bold?: boolean;
};

const createPdfBlob = (blocks: PdfTextBlock[]) => {
  const encoder = new TextEncoder();
  const contentLines = blocks
    .map(
      ({ text, x, y, size, bold }) =>
        `BT ${bold ? "/F2" : "/F1"} ${size} Tf ${x} ${y} Td (${escapePdfText(text)}) Tj ET`,
    )
    .join("\n");
  const stream = encoder.encode(contentLines);
  const objects = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>\nendobj\n",
    `4 0 obj\n<< /Length ${stream.byteLength} >>\nstream\n${contentLines}\nendstream\nendobj\n`,
    "5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
    "6 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n",
  ];

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [0];
  objects.forEach((obj) => {
    offsets.push(pdf.length);
    pdf += obj;
  });
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  offsets
    .slice(1)
    .forEach((offset) => (pdf += `${offset.toString().padStart(10, "0")} 00000 n \n`));
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return new Blob([pdf], { type: "application/pdf" });
};

export const loadInvoices = (): Invoice[] => {
  const seeded = [...invoices];
  if (typeof window === "undefined") return seeded;
  try {
    const raw = window.localStorage.getItem(invoiceStorageKey);
    if (!raw) return seeded;
    const parsed = (JSON.parse(raw) as Invoice[]).filter(
      (invoice) => !legacyDemoTenantNames.has(invoice.tenant),
    );
    saveInvoices(parsed);
    const merged = [...seeded];
    parsed.forEach((invoice) => {
      if (!merged.some((existing) => existing.id === invoice.id)) merged.unshift(invoice);
    });
    return merged.sort((a, b) => b.issuedAt.localeCompare(a.issuedAt));
  } catch {
    return seeded;
  }
};

export const saveInvoices = (next: Invoice[]) => {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(invoiceStorageKey, JSON.stringify(next));
  }
  return next;
};

export const createInvoice = (
  input: Omit<Invoice, "id" | "issuedAt"> & Partial<Pick<Invoice, "id" | "issuedAt">>,
): Invoice => {
  const invoice: Invoice = {
    id:
      input.id ??
      `INV-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
    tenant: input.tenant,
    amount: input.amount,
    status: input.status ?? "Sent",
    due: input.due ?? new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    method: input.method,
    items: input.items,
    issuedAt: input.issuedAt ?? new Date().toISOString(),
    orderedBy: input.orderedBy,
    branch: input.branch,
    kind: input.kind,
    note: input.note,
  };
  const existing = loadInvoices();
  const next = [invoice, ...existing.filter((entry) => entry.id !== invoice.id)];
  saveInvoices(next);
  return invoice;
};

export const downloadInvoicePdf = (invoice: Invoice) => {
  if (typeof window === "undefined") return;

  const printWindow = window.open("", "_blank", "width=900,height=900");
  if (!printWindow) return;

  const escapeHtml = (value: string) =>
    value.replace(
      /[&<>"']/g,
      (character) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[character]!,
    );
  const bodyRows = invoice.items
    .map((item) => {
      const image = item.image
        ? `<img src="${escapeHtml(new URL(item.image, window.location.origin).href)}" alt="" />`
        : "";
      return `<div class="row"><div class="item">${image}<span>${item.qty} × ${escapeHtml(item.name)}</span></div><strong>${formatZAR(item.price * item.qty)}</strong></div>`;
    })
    .join("");

  const invoiceHtml = `<!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${invoice.id}</title>
        <style>
          @page { size: A4; margin: 20mm; }
          * { box-sizing: border-box; }
          body {
            margin: 0;
            font-family: Arial, Helvetica, sans-serif;
            color: #1f2937;
            background: #ffffff;
            padding: 24px;
          }
          .sheet {
            width: 100%;
            max-width: 794px;
            margin: 0 auto;
            border: 1px solid #dbe2ea;
            border-radius: 16px;
            overflow: hidden;
            background: #fff;
          }
          .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 22px 24px;
            background: linear-gradient(135deg, #0f172a, #1d4ed8);
            color: white;
          }
          .logo {
            width: 150px;
            height: auto;
            filter: brightness(0) invert(1);
          }
          .meta {
            text-align: right;
            font-size: 12px;
            line-height: 1.5;
          }
          .content {
            padding: 24px;
          }
          .address-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
            margin-bottom: 20px;
          }
          .kicker {
            font-size: 11px;
            letter-spacing: 0.12em;
            text-transform: uppercase;
            color: #6b7280;
            margin-bottom: 8px;
          }
          .label {
            font-size: 13px;
            color: #6b7280;
            margin-bottom: 4px;
          }
          .value {
            font-size: 14px;
            font-weight: 700;
          }
          .summary {
            border: 1px solid #e5e7eb;
            border-radius: 12px;
            overflow: hidden;
            margin: 16px 0 24px;
          }
          .row {
            display: flex;
            justify-content: space-between;
            gap: 12px;
            padding: 12px 14px;
            border-bottom: 1px solid #eef2f7;
            font-size: 13px;
          }
          .item { display: flex; align-items: center; gap: 12px; }
          .item img { width: 44px; height: 44px; object-fit: cover; border-radius: 6px; }
          .row:last-child { border-bottom: 0; }
          .total {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 14px 16px;
            background: #f8fafc;
            font-weight: 700;
          }
          .footer {
            margin-top: 16px;
            font-size: 12px;
            color: #6b7280;
            line-height: 1.6;
          }
        </style>
      </head>
      <body>
        <div class="sheet">
          <div class="header">
            <img class="logo" src="${invoiceLogo}" alt="Office & Co" />
            <div class="meta">
              <div><strong>Tax Invoice</strong></div>
              <div>${invoice.id}</div>
              <div>Issued ${new Date(invoice.issuedAt).toLocaleDateString("en-ZA")}</div>
              <div>Due ${invoice.due}</div>
            </div>
          </div>
          <div class="content">
            <div class="address-grid">
              <div>
                <div class="kicker">From</div>
                <div class="value">Office & Co WorkspaceOS</div>
                <div class="label">4th Floor · 5 Grayston Drive</div>
                <div class="label">Sandton · Johannesburg · 2196</div>
                <div class="label">hello@officeandco.co · +27 (0)11 234 5678</div>
              </div>
              <div>
                <div class="kicker">Bill To</div>
                <div class="value">${invoice.tenant}</div>
                <div class="label">Ordered by: ${invoice.orderedBy ?? "—"}</div>
                <div class="label">Branch: ${invoice.branch ?? "—"}</div>
                <div class="label">Payment method: ${invoice.method}</div>
                <div class="label">Status: ${invoice.status}</div>
              </div>
            </div>
            <div class="summary">
              ${bodyRows}
              <div class="total"><span>Total due</span><span>${formatZAR(invoice.amount)}</span></div>
            </div>
            <div class="footer">
              <div><strong>Note:</strong> ${invoice.note ?? "—"}</div>
              <div>Thank you for choosing Office & Co. For support, contact finance@officeandco.co</div>
            </div>
          </div>
        </div>
      </body>
    </html>`;

  printWindow.document.open();
  printWindow.document.write(invoiceHtml);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => {
    printWindow.print();
    printWindow.close();
  }, 350);
};

export const cafeOrders: {
  id: string;
  item: string;
  tenant: string;
  member: string;
  method: string;
  status: string;
}[] = [];

export const communityPosts = [
  {
    id: "P-4",
    author: "Office & Co · Group",
    role: "Announcement",
    time: "2d",
    body: "Sandton branch officially opens Q4 — member preview tours start September.",
    reactions: 67,
    comments: 22,
    kind: "Announcement",
  },
];

export const events = [
  {
    id: "E-1",
    title: "Founders Breakfast: Scaling Beyond R10M ARR",
    date: "Jun 26",
    branch: "Bryanston",
    rsvp: 64,
    capacity: 80,
    kind: "Public",
    total: 96000,
  },
  {
    id: "E-2",
    title: "Wine Down Friday",
    date: "Jun 27",
    branch: "Rosebank",
    rsvp: 92,
    capacity: 120,
    kind: "Internal",
    total: 74000,
  },
  {
    id: "E-3",
    title: "AI for Operators — Workshop",
    date: "Jul 02",
    branch: "Kyalami",
    rsvp: 28,
    capacity: 40,
    kind: "Public",
    total: 32000,
  },
  {
    id: "E-4",
    title: "Group Members Summit",
    date: "Jul 18",
    branch: "Bryanston",
    rsvp: 180,
    capacity: 220,
    kind: "Group",
    total: 185000,
  },
  {
    id: "E-5",
    title: "Investec Year-End Gala",
    date: "Jul 25",
    branch: "Union Station",
    rsvp: 320,
    capacity: 450,
    kind: "Corporate",
    total: 410000,
  },
  {
    id: "E-6",
    title: "Standard Bank Leadership Offsite",
    date: "Aug 02",
    branch: "Union Station",
    rsvp: 140,
    capacity: 200,
    kind: "Corporate",
    total: 156000,
  },
];

export const bookings: {
  id: string;
  branch: string;
  tenant: string;
  room: string;
  total: number;
}[] = [];

export const unionStations = [
  { id: "US-001", branch: "Union Station", name: "The Atrium", revenue: 148000 },
  { id: "US-002", branch: "Union Station", name: "Grand Hall", revenue: 224000 },
  { id: "US-003", branch: "Union Station", name: "Boardroom Suite", revenue: 91000 },
];

export const tickets: {
  id: string;
  subject: string;
  tenant: string;
  priority: string;
  status: string;
  sla: string;
}[] = [];

export const messages = [
  {
    id: "M-2",
    from: "Naledi Khoza",
    role: "Branch Manager · Bryanston",
    preview: "Q3 occupancy forecast is ahead of plan — full memo attached.",
    time: "08:42",
    unread: true,
  },
  {
    id: "M-3",
    from: "Pieter van der Merwe",
    role: "Branch Manager · Kyalami",
    preview: "Phase 2 fit-out tracking 4 days ahead.",
    time: "08:02",
    unread: false,
  },
  {
    id: "M-4",
    from: "Finance",
    role: "Channel",
    preview: "May close report ready for Anthony to review.",
    time: "Yesterday",
    unread: false,
  },
  {
    id: "M-5",
    from: "Group Exec",
    role: "Channel",
    preview: "Board pack v3 uploaded.",
    time: "Yesterday",
    unread: false,
  },
];

// Use explicit en-US formatting so SSR and client output match (en-ZA uses NBSP
// thousands separators, which causes hydration mismatches in some browsers).
const _zarFmt = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
export const formatZAR = (n: number) => `R${_zarFmt.format(Math.round(n))}`;
export const formatInt = (n: number) => _zarFmt.format(Math.round(n));

export const getRoleById = (roleId: RoleId) => ROLES.find((r) => r.id === roleId);
export const getRoleBranch = (roleId: RoleId) => getRoleById(roleId)?.branch;
export const getRoleTenant = (roleId: RoleId) => getRoleById(roleId)?.tenant;
export const isBillingRole = (roleId: RoleId) =>
  [
    "group-ceo",
    "sales-manager",
    "branch-manager",
    "finance",
    "lydia-admin",
    "community-manager",
  ].includes(roleId);

const billingDraftKey = "oco-monthly-billing-drafts";
const monthEndDay = (year: number, month: number) => new Date(year, month, 0).getDate();

export const loadBillingDrafts = (): Invoice[] => {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(billingDraftKey);
    if (!raw) return [];
    return JSON.parse(raw) as Invoice[];
  } catch {
    return [];
  }
};

export const saveBillingDrafts = (next: Invoice[]) => {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(billingDraftKey, JSON.stringify(next));
  }
  return next;
};

export const clearBillingDrafts = (): Invoice[] => saveBillingDrafts([]);

export const createInvoiceDraft = (
  input: Omit<Invoice, "id" | "issuedAt"> & Partial<Pick<Invoice, "id" | "issuedAt">>,
): Invoice => ({
  id:
    input.id ??
    `INV-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
  tenant: input.tenant,
  amount: input.amount,
  status: input.status ?? "Draft",
  due: input.due ?? new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
  method: input.method,
  items: input.items,
  issuedAt: input.issuedAt ?? new Date().toISOString(),
  branch: input.branch,
  kind: input.kind,
  note: input.note,
});

export const prepareMonthlyBilling = (month: string): Invoice[] => {
  const [year, monthNumber] = month.split("-").map(Number);
  const prefix = `${year}-${String(monthNumber).padStart(2, "0")}`;
  const buckets = tenantOrderHistory
    .filter((order) => order.method === "Charge to account" && order.placedAt.startsWith(prefix))
    .reduce<
      Record<
        string,
        { tenant: string; branch: string; items: InvoiceItem[]; amount: number; kinds: Set<string> }
      >
    >((acc, order) => {
      const key = `${order.tenant}:${order.branch}`;
      const bucket = acc[key] ?? {
        tenant: order.tenant,
        branch: order.branch,
        items: [],
        amount: 0,
        kinds: new Set<string>(),
      };
      order.items.forEach((item) => bucket.items.push(item));
      bucket.amount += order.total;
      bucket.kinds.add(order.kind);
      acc[key] = bucket;
      return acc;
    }, {});

  const drafts = Object.values(buckets).map((bucket) =>
    createInvoiceDraft({
      tenant: bucket.tenant,
      amount: bucket.amount,
      status: "Draft",
      due: `${year}-${String(monthNumber).padStart(2, "0")}-${String(monthEndDay(year, monthNumber)).padStart(2, "0")}`,
      method: "Charge to account",
      items: bucket.items,
      branch: bucket.branch,
      kind:
        bucket.kinds.size === 1
          ? bucket.kinds.has("marketplace")
            ? "marketplace"
            : "cafe"
          : undefined,
      note: `Month-end charge summary for ${month}. Ready for billing review and send by the 24th of next month.`,
    }),
  );

  saveBillingDrafts(drafts);
  return drafts;
};

export const sendBillingInvoices = (drafts: Invoice[]): Invoice[] => {
  const existing = loadInvoices();
  const sent: Invoice[] = drafts.map((invoice): Invoice => ({
    ...invoice,
    status: invoice.status === "Paid" ? "Paid" : "Sent",
  }));
  const next: Invoice[] = [
    ...sent,
    ...existing.filter((entry) => !drafts.some((draft) => draft.id === entry.id)),
  ];
  saveInvoices(next);
  clearBillingDrafts();
  return sent;
};

// ───────────────────────── Roles & Users ─────────────────────────

export type RoleId =
  | "superadmin"
  | "group-admin"
  | "group-ceo"
  | "crm-manager"
  | "sales-manager"
  | "rosebank-sales"
  | "branch-manager"
  | "cafe-manager"
  | "community-manager"
  | "finance"
  | "lydia-admin"
  | "tenant-admin"
  | "external-vendor"
  | "organization-admin"
  | "organization-member"
  | "member";

export type CommunityModuleKey = "community" | "events" | "marketplace" | "cafe" | "content";

export const COMMUNITY_MODULES: { key: CommunityModuleKey; label: string; url: string }[] = [
  { key: "community", label: "Community Feed", url: "/community" },
  { key: "events", label: "Events", url: "/events" },
  { key: "marketplace", label: "Marketplace", url: "/marketplace" },
  { key: "cafe", label: "Café", url: "/cafe" },
  { key: "content", label: "Content Hub", url: "/content" },
];

export type RoleDef = {
  id: RoleId;
  user: string;
  initials: string;
  title: string;
  scope: string;
  nav: string[]; // route urls visible to this role
  communityModules: Record<CommunityModuleKey, boolean>;
  branch?: string;
  branchIds?: string[];
  branchNames?: string[];
  tenant?: string;
};

const all = (v: boolean): Record<CommunityModuleKey, boolean> => ({
  community: v,
  events: v,
  marketplace: v,
  cafe: v,
  content: v,
});

export const ROLES: RoleDef[] = [
  {
    id: "superadmin",
    user: "Platform Superadmin",
    initials: "SA",
    title: "Platform Superadmin",
    scope: "Full platform administration",
    nav: [
      "/",
      "/analytics",
      "/crm",
      "/leads-intelligence",
      "/crawler-intelligence",
      "/tenants",
      "/billing",
      "/facilities",
      "/bookings",
      "/union-station",
      "/union-station-admin",
      "/support",
      "/community",
      "/events",
      "/content",
      "/cafe",
      "/marketplace",
      "/messaging",
      "/notifications",
    ],
    communityModules: all(true),
  },
  {
    id: "group-admin",
    user: "Samantha · Office & Co Admin",
    initials: "SA",
    title: "Group Administrator",
    scope: "All branches · Staff and role administration",
    nav: [
      "/",
      "/analytics",
      "/crm",
      "/leads-intelligence",
      "/crawler-intelligence",
      "/outreach",
      "/tenants",
      "/billing",
      "/facilities",
      "/bookings",
      "/union-station",
      "/union-station-admin",
      "/support",
      "/community",
      "/events",
      "/content",
      "/cafe",
      "/marketplace",
      "/messaging",
      "/notifications",
      "/organization",
      "/account",
      "/settings/roles",
    ],
    communityModules: all(true),
  },
  {
    id: "group-ceo",
    user: "Anthony Manas",
    initials: "AM",
    title: "Group CEO",
    scope: "All branches · Group view",
    nav: [
      "/",
      "/analytics",
      "/ai-assistant",
      "/crm",
      "/leads-intelligence",
      "/crawler-intelligence",
      "/tenants",
      "/billing",
      "/facilities",
      "/bookings",
      "/union-station-admin",
      "/support",
      "/community",
      "/events",
      "/content",
      "/cafe",
      "/marketplace",
      "/messaging",
      "/notifications",
      "/settings/roles",
    ],
    communityModules: all(true),
  },
  {
    id: "crm-manager",
    user: "Samantha Ndlovu",
    initials: "SN",
    title: "Group CRM Manager",
    scope: "CRM and sales pipeline · All branches",
    nav: [
      "/",
      "/crm",
      "/outreach",
      "/leads-intelligence",
      "/crawler-intelligence",
      "/community",
      "/content",
      "/cafe",
      "/marketplace",
      "/tenants",
      "/bookings",
      "/messaging",
      "/analytics",
      "/notifications",
    ],
    communityModules: {
      community: true,
      events: false,
      marketplace: true,
      cafe: true,
      content: true,
    },
  },
  {
    id: "sales-manager",
    user: "Samantha Naidoo",
    initials: "SN",
    title: "Sales & CRM Manager",
    scope: "Group pipeline · All branches",
    nav: [
      "/",
      "/crm",
      "/outreach",
      "/leads-intelligence",
      "/crawler-intelligence",
      "/community",
      "/content",
      "/tenants",
      "/analytics",
      "/events",
      "/union-station",
      "/cafe",
      "/marketplace",
      "/messaging",
      "/notifications",
      "/settings/roles",
    ],
    communityModules: {
      community: true,
      events: true,
      marketplace: true,
      cafe: true,
      content: true,
    },
  },
  {
    id: "rosebank-sales",
    user: "Regina “Regie” Mthembu",
    initials: "RM",
    title: "Sales & CRM · Rosebank",
    scope: "Rosebank branch pipeline",
    nav: [
      "/",
      "/crm",
      "/tenants",
      "/analytics",
      "/events",
      "/content",
      "/community",
      "/cafe",
      "/marketplace",
      "/messaging",
      "/notifications",
    ],
    communityModules: {
      community: true,
      events: true,
      marketplace: true,
      cafe: true,
      content: true,
    },
  },
  {
    id: "branch-manager",
    user: "Naledi Khoza",
    initials: "NK",
    title: "Branch Manager · Bryanston",
    scope: "Bryanston only",
    branch: "Bryanston",
    nav: [
      "/",
      "/crm",
      "/tenants",
      "/facilities",
      "/bookings",
      "/billing",
      "/union-station",
      "/union-station-admin",
      "/support",
      "/community",
      "/content",
      "/events",
      "/cafe",
      "/marketplace",
      "/analytics",
      "/messaging",
      "/notifications",
      "/settings/roles",
    ],
    communityModules: {
      community: true,
      events: true,
      marketplace: true,
      cafe: true,
      content: true,
    },
  },
  {
    id: "community-manager",
    user: "Lerato Pillay",
    initials: "LP",
    title: "Community Manager · Rosebank",
    scope: "Rosebank community",
    branch: "Rosebank",
    nav: [
      "/",
      "/community",
      "/events",
      "/content",
      "/cafe",
      "/marketplace",
      "/bookings",
      "/messaging",
      "/notifications",
    ],
    communityModules: all(true),
  },
  {
    id: "cafe-manager",
    user: "Branch Café Manager",
    initials: "CM",
    title: "Café Manager",
    scope: "Assigned branch café",
    nav: ["/", "/cafe", "/community", "/marketplace", "/content", "/notifications", "/messaging"],
    communityModules: {
      community: true,
      events: false,
      marketplace: true,
      cafe: true,
      content: true,
    },
  },
  {
    id: "finance",
    user: "Vijeshna Naidoo",
    initials: "VN",
    title: "Finance Lead",
    scope: "Group financial ops",
    nav: [
      "/",
      "/billing",
      "/tenants",
      "/analytics",
      "/content",
      "/community",
      "/cafe",
      "/marketplace",
      "/messaging",
      "/notifications",
    ],
    communityModules: {
      community: true,
      events: false,
      marketplace: true,
      cafe: true,
      content: true,
    },
  },
  {
    id: "lydia-admin",
    user: "Lydia Mokoena",
    initials: "LM",
    title: "Union Station Administrator",
    scope: "Union Station · Corporate Events",
    branch: "Union Station",
    nav: [
      "/",
      "/union-station",
      "/union-station-admin",
      "/bookings",
      "/facilities",
      "/support",
      "/community",
      "/content",
      "/events",
      "/analytics",
      "/cafe",
      "/marketplace",
      "/messaging",
      "/notifications",
    ],
    communityModules: {
      community: true,
      events: true,
      marketplace: true,
      cafe: true,
      content: true,
    },
  },
  {
    id: "tenant-admin",
    user: "Organization Administrator",
    initials: "OA",
    title: "Organization Admin",
    scope: "Registered organization",
    nav: [
      "/",
      "/bookings",
      "/cafe",
      "/community",
      "/content",
      "/marketplace",
      "/billing",
      "/analytics",
      "/support",
      "/notifications",
      "/messaging",
    ],
    communityModules: {
      community: true,
      events: false,
      marketplace: true,
      cafe: true,
      content: true,
    },
  },
  {
    id: "external-vendor",
    user: "Northstar Studio",
    initials: "NS",
    title: "External Vendor",
    scope: "Marketplace vendor access",
    nav: ["/marketplace", "/content"],
    communityModules: {
      community: false,
      events: false,
      marketplace: true,
      cafe: false,
      content: true,
    },
  },
  {
    id: "organization-admin",
    user: "Organization admin",
    initials: "OA",
    title: "Organization Admin",
    scope: "Organization workspace",
    nav: [
      "/",
      "/bookings",
      "/billing",
      "/community",
      "/cafe",
      "/marketplace",
      "/content",
      "/support",
      "/messaging",
      "/notifications",
      "/organization",
      "/account",
    ],
    communityModules: {
      community: true,
      events: false,
      marketplace: true,
      cafe: true,
      content: true,
    },
  },
  {
    id: "organization-member",
    user: "Organization member",
    initials: "OM",
    title: "Organization Member",
    scope: "Organization workspace",
    nav: ["/", "/community", "/cafe", "/marketplace", "/content", "/notifications", "/account"],
    communityModules: {
      community: true,
      events: false,
      marketplace: true,
      cafe: true,
      content: true,
    },
  },
  {
    id: "member",
    user: "Workspace member",
    initials: "WM",
    title: "Member",
    scope: "Member access",
    nav: ["/", "/notifications", "/support"],
    communityModules: { ...all(false), content: true },
  },
];

export const tenantManagers: {
  id: string;
  name: string;
  initials: string;
  title: string;
  tenant: string;
  branch: string;
  email: string;
  online: boolean;
  lastPreview: string;
  lastTime: string;
  unread: number;
}[] = [];

// ───────────── Union Station — event check-in (QR lead capture) ─────────────
export type EventAccessCode = {
  code: string; // short access code embedded in the QR URL
  eventId: string;
  title: string;
  date: string;
  client: string;
  attendeesExpected: number;
  leadsCaptured: number;
  conversionsToSales: number;
  active: boolean;
};

export const eventAccessCodes: EventAccessCode[] = [
  {
    code: "INV-GALA-25",
    eventId: "US-2026-031",
    title: "Investec Year-End Gala",
    date: "2026-07-25",
    client: "Investec Private Bank",
    attendeesExpected: 320,
    leadsCaptured: 287,
    conversionsToSales: 14,
    active: true,
  },
  {
    code: "SB-OFFSITE",
    eventId: "US-2026-032",
    title: "Standard Bank Leadership Offsite",
    date: "2026-08-02",
    client: "Standard Bank",
    attendeesExpected: 140,
    leadsCaptured: 121,
    conversionsToSales: 7,
    active: true,
  },
  {
    code: "DISC-SUMMIT",
    eventId: "US-2026-033",
    title: "Discovery Product Summit",
    date: "2026-08-14",
    client: "Discovery Health",
    attendeesExpected: 220,
    leadsCaptured: 0,
    conversionsToSales: 0,
    active: true,
  },
  {
    code: "AG-BRIEF",
    eventId: "US-2026-034",
    title: "Allan Gray Investor Briefing",
    date: "2026-09-05",
    client: "Allan Gray",
    attendeesExpected: 95,
    leadsCaptured: 0,
    conversionsToSales: 0,
    active: false,
  },
];

export const eventLeadsSample: {
  id: string;
  fullName: string;
  email: string;
  phone?: string;
  eventCode: string;
  capturedAt: string;
  status: "New" | "Qualified" | "Converted";
}[] = [
  {
    id: "EL-1",
    fullName: "Tebogo Maseko",
    email: "tebogo@finmark.co.za",
    phone: "+27 82 555 1023",
    eventCode: "INV-GALA-25",
    capturedAt: "2026-07-25 18:12",
    status: "Qualified",
  },
  {
    id: "EL-2",
    fullName: "Kim Robertson",
    email: "kim@valex.com",
    eventCode: "INV-GALA-25",
    capturedAt: "2026-07-25 18:14",
    status: "Converted",
  },
  {
    id: "EL-3",
    fullName: "Sipho Ndlovu",
    email: "sipho.n@orbitcapital.co.za",
    phone: "+27 71 998 0021",
    eventCode: "INV-GALA-25",
    capturedAt: "2026-07-25 18:22",
    status: "New",
  },
  {
    id: "EL-4",
    fullName: "Hannah Reyes",
    email: "hannah@deltacorp.io",
    eventCode: "SB-OFFSITE",
    capturedAt: "2026-08-02 08:31",
    status: "Qualified",
  },
  {
    id: "EL-5",
    fullName: "Mxolisi Dube",
    email: "mx@duberesearch.co.za",
    phone: "+27 83 221 4488",
    eventCode: "SB-OFFSITE",
    capturedAt: "2026-08-02 08:38",
    status: "New",
  },
];

// ───────────── Café — per-branch product catalog ─────────────
export type CafeProduct = {
  id: string;
  branch: string;
  name: string;
  category: "Coffee" | "Tea" | "Cold Drinks" | "Bakery" | "Breakfast" | "Lunch" | "Snacks";
  price: number;
  description: string;
  available: boolean;
  popular?: boolean;
  image?: string;
  vendor?: string;
  stockQuantity?: number;
  lowStockThreshold?: number;
  trackInventory?: boolean;
};

export const cafeProducts: CafeProduct[] = [
  // Bryanston
  {
    id: "CP-B01",
    branch: "Bryanston",
    name: "Single Origin Flat White",
    category: "Coffee",
    price: 38,
    description: "Ethiopian Yirgacheffe, micro-foam milk.",
    available: true,
    popular: true,
  },
  {
    id: "CP-B02",
    branch: "Bryanston",
    name: "Cortado",
    category: "Coffee",
    price: 34,
    description: "Equal parts espresso and warm milk.",
    available: true,
  },
  {
    id: "CP-B03",
    branch: "Bryanston",
    name: "Iced Matcha Latte",
    category: "Cold Drinks",
    price: 52,
    description: "Ceremonial-grade matcha, oat milk.",
    available: true,
    popular: true,
  },
  {
    id: "CP-B04",
    branch: "Bryanston",
    name: "Almond Croissant",
    category: "Bakery",
    price: 42,
    description: "Baked fresh daily by our pastry team.",
    available: true,
  },
  {
    id: "CP-B05",
    branch: "Bryanston",
    name: "Smashed Avo on Sourdough",
    category: "Breakfast",
    price: 95,
    description: "Heirloom tomato, dukkah, lime.",
    available: true,
    popular: true,
  },
  {
    id: "CP-B06",
    branch: "Bryanston",
    name: "Power Bowl",
    category: "Lunch",
    price: 125,
    description: "Quinoa, grilled chicken, tahini.",
    available: true,
  },
  // Kyalami
  {
    id: "CP-K01",
    branch: "Kyalami",
    name: "Americano",
    category: "Coffee",
    price: 28,
    description: "Double shot, hot water.",
    available: true,
  },
  {
    id: "CP-K02",
    branch: "Kyalami",
    name: "Cappuccino",
    category: "Coffee",
    price: 36,
    description: "Classic, with dark chocolate dust.",
    available: true,
    popular: true,
  },
  {
    id: "CP-K03",
    branch: "Kyalami",
    name: "Banana Bread",
    category: "Bakery",
    price: 38,
    description: "House-made with walnuts.",
    available: true,
  },
  {
    id: "CP-K04",
    branch: "Kyalami",
    name: "Chicken Schnitzel Wrap",
    category: "Lunch",
    price: 110,
    description: "Slaw, garlic aioli, crisp lettuce.",
    available: true,
  },
  {
    id: "CP-K05",
    branch: "Kyalami",
    name: "Cold Brew",
    category: "Cold Drinks",
    price: 48,
    description: "Slow-steeped 18 hours.",
    available: true,
  },
  // Rosebank
  {
    id: "CP-R01",
    branch: "Rosebank",
    name: "Macchiato",
    category: "Coffee",
    price: 32,
    description: "Espresso with a dash of foam.",
    available: true,
  },
  {
    id: "CP-R02",
    branch: "Rosebank",
    name: "Rooibos Cappuccino",
    category: "Tea",
    price: 36,
    description: "Local rooibos, steamed milk.",
    available: true,
    popular: true,
  },
  {
    id: "CP-R03",
    branch: "Rosebank",
    name: "Acai Bowl",
    category: "Breakfast",
    price: 105,
    description: "Granola, berries, coconut.",
    available: true,
    popular: true,
  },
  {
    id: "CP-R04",
    branch: "Rosebank",
    name: "Caprese Sandwich",
    category: "Lunch",
    price: 98,
    description: "Buffalo mozzarella, basil, balsamic.",
    available: true,
  },
  {
    id: "CP-R05",
    branch: "Rosebank",
    name: "Chocolate Brownie",
    category: "Snacks",
    price: 35,
    description: "Belgian dark chocolate.",
    available: true,
  },
  // Union Station
  {
    id: "CP-U01",
    branch: "Union Station",
    name: "Event Espresso Bar (per cup)",
    category: "Coffee",
    price: 32,
    description: "Available during corporate events.",
    available: true,
  },
  {
    id: "CP-U02",
    branch: "Union Station",
    name: "Canapé Platter (10pc)",
    category: "Snacks",
    price: 320,
    description: "Chef's selection — for delegate breaks.",
    available: true,
  },
];

// ───────────── Union Station — booking requests & approvals ─────────────

export type UnionStationStatus =
  | "Draft"
  | "Submitted"
  | "In Review"
  | "Quoted"
  | "Confirmed"
  | "Invoiced"
  | "Completed"
  | "Declined";

export type UnionStationRequest = {
  id: string;
  client: string;
  contact: string;
  email: string;
  eventType: string;
  date: string;
  start: string;
  end: string;
  attendees: number;
  layout: "Theatre" | "Banquet" | "Cabaret" | "Expo" | "Classroom";
  catering: "None" | "Coffee Break" | "Lunch" | "Cocktail" | "Gala Dinner";
  av: string[];
  notes?: string;
  status: UnionStationStatus;
  estimate: number;
  depositPct: number;
  contractSent: boolean;
  contractSigned: boolean;
  submittedBy: string;
  submittedAt: string;
};

export const unionStationVenue = {
  capacity: 450,
  halls: ["Grand Hall (450)", "Heritage Hall (220)", "Mezzanine (90)", "Boardroom (24)"],
  baseRatePerHour: 4800,
  cateringPerHead: { None: 0, "Coffee Break": 95, Lunch: 285, Cocktail: 320, "Gala Dinner": 695 },
  avRates: {
    "Stage & Lighting": 12000,
    "Pro AV + Streaming": 18500,
    "Simul-translation": 9500,
    Photography: 6500,
    Videography: 14000,
  } as Record<string, number>,
  afterHoursSurchargePct: 0.18,
};

export const unionStationRequests: UnionStationRequest[] = [
  {
    id: "US-2026-031",
    client: "Investec Private Bank",
    contact: "Lerato Mahlangu",
    email: "lerato.m@investec.co.za",
    eventType: "Year-End Gala",
    date: "2026-07-25",
    start: "18:00",
    end: "23:30",
    attendees: 320,
    layout: "Banquet",
    catering: "Gala Dinner",
    av: ["Stage & Lighting", "Pro AV + Streaming", "Photography"],
    status: "Confirmed",
    estimate: 312_400,
    depositPct: 50,
    contractSent: true,
    contractSigned: true,
    submittedBy: "Samantha N.",
    submittedAt: "2026-05-12",
  },
  {
    id: "US-2026-032",
    client: "Standard Bank",
    contact: "Thabo Sithole",
    email: "t.sithole@standardbank.co.za",
    eventType: "Leadership Offsite",
    date: "2026-08-02",
    start: "08:00",
    end: "17:00",
    attendees: 140,
    layout: "Cabaret",
    catering: "Lunch",
    av: ["Pro AV + Streaming", "Videography"],
    status: "Quoted",
    estimate: 168_900,
    depositPct: 30,
    contractSent: true,
    contractSigned: false,
    submittedBy: "Samantha N.",
    submittedAt: "2026-06-08",
  },
  {
    id: "US-2026-033",
    client: "Discovery Health",
    contact: "Priya Naidoo",
    email: "p.naidoo@discovery.co.za",
    eventType: "Product Summit",
    date: "2026-08-14",
    start: "09:00",
    end: "16:00",
    attendees: 220,
    layout: "Theatre",
    catering: "Lunch",
    av: ["Pro AV + Streaming", "Simul-translation"],
    status: "In Review",
    estimate: 198_300,
    depositPct: 30,
    contractSent: false,
    contractSigned: false,
    submittedBy: "Regie M.",
    submittedAt: "2026-06-18",
  },
  {
    id: "US-2026-034",
    client: "Allan Gray",
    contact: "Michael Carter",
    email: "m.carter@allangray.co.za",
    eventType: "Investor Briefing",
    date: "2026-09-05",
    start: "16:00",
    end: "20:00",
    attendees: 95,
    layout: "Theatre",
    catering: "Cocktail",
    av: ["Stage & Lighting", "Videography"],
    status: "Submitted",
    estimate: 124_600,
    depositPct: 25,
    contractSent: false,
    contractSigned: false,
    submittedBy: "Samantha N.",
    submittedAt: "2026-06-22",
  },
  {
    id: "US-2026-035",
    client: "TechCabal Africa",
    contact: "Zanele Khumalo",
    email: "zanele@techcabal.com",
    eventType: "Pan-African Summit",
    date: "2026-10-12",
    start: "08:00",
    end: "22:00",
    attendees: 380,
    layout: "Theatre",
    catering: "Lunch",
    av: ["Pro AV + Streaming", "Simul-translation", "Photography", "Videography"],
    status: "Draft",
    estimate: 0,
    depositPct: 0,
    contractSent: false,
    contractSigned: false,
    submittedBy: "Regie M.",
    submittedAt: "2026-06-24",
  },
];

// ───────────── Messaging — channels, members, receipts ─────────────

export type ChannelVisibility = "public" | "private" | "restricted";

export const channelsCatalog: {
  name: string;
  visibility: ChannelVisibility;
  allowedRoles: RoleId[];
  members: number;
  description: string;
}[] = [
  {
    name: "exec-board",
    visibility: "private",
    allowedRoles: ["group-ceo", "finance"],
    members: 7,
    description: "Closed channel for the executive board. End-to-end encrypted. Audit-logged.",
  },
  {
    name: "group-leadership",
    visibility: "restricted",
    allowedRoles: ["group-ceo", "sales-manager", "branch-manager", "finance"],
    members: 18,
    description: "All managers and leads across the group.",
  },
  {
    name: "finance",
    visibility: "restricted",
    allowedRoles: ["group-ceo", "finance"],
    members: 6,
    description: "Finance ops, close cycle, treasury.",
  },
  {
    name: "branch-managers",
    visibility: "restricted",
    allowedRoles: ["group-ceo", "branch-manager"],
    members: 9,
    description: "Branch managers across all locations.",
  },
  {
    name: "ops-incident",
    visibility: "restricted",
    allowedRoles: ["group-ceo", "branch-manager", "community-manager"],
    members: 14,
    description: "Real-time incident response across facilities.",
  },
  {
    name: "union-station-events",
    visibility: "restricted",
    allowedRoles: [
      "group-ceo",
      "sales-manager",
      "rosebank-sales",
      "community-manager",
      "lydia-admin",
    ],
    members: 11,
    description: "Corporate event venue planning and approvals.",
  },
  {
    name: "sales-floor",
    visibility: "restricted",
    allowedRoles: ["group-ceo", "sales-manager", "rosebank-sales", "lydia-admin"],
    members: 8,
    description: "Sales pipeline, deals, hand-offs.",
  },
  {
    name: "announcements",
    visibility: "public",
    allowedRoles: [
      "group-ceo",
      "sales-manager",
      "rosebank-sales",
      "branch-manager",
      "community-manager",
      "finance",
      "lydia-admin",
      "tenant-admin",
    ],
    members: 38,
    description: "Read-only company-wide announcements.",
  },
  {
    name: "tenant-relations",
    visibility: "restricted",
    allowedRoles: ["group-ceo", "sales-manager", "branch-manager", "community-manager"],
    members: 12,
    description: "Internal channel that pairs with DMs to tenant managers.",
  },
];

export const sampleThread = [
  {
    from: "Pieter van der Merwe",
    initials: "PM",
    role: "RM · Western Cape",
    text: "Cape Town launch venue confirmed for 18 July. 300 cap — RSVPs already at 240.",
    time: "08:02",
    seenBy: ["NK", "AM", "SN"],
  },
  {
    from: "Naledi Khoza",
    initials: "NK",
    role: "BM · Bryanston",
    text: "Excellent. I'll mirror the format for Bryanston in Q4.",
    time: "08:14",
    seenBy: ["AM", "SN", "PM"],
  },
  {
    from: "Anthony Manas",
    initials: "AM",
    role: "Group CEO",
    text: "Let's pull a member panel — three tenants who scaled past 20 desks here. Helix, Tundra, and someone from Rosebank.",
    time: "08:22",
    seenBy: ["SN", "PM", "NK", "LP"],
  },
  {
    from: "Samantha Naidoo",
    initials: "SN",
    role: "Sales & CRM Manager",
    text: "On it. Union Station bookings spiked 32% MoM — investor briefing demand is exploding.",
    time: "08:34",
    seenBy: ["AM", "NK"],
  },
  {
    from: "Pieter van der Merwe",
    initials: "PM",
    role: "RM · Western Cape",
    text: "Briefing comms today. Will share draft by EOD.",
    time: "08:41",
    seenBy: ["AM"],
  },
];

// ───────────── Community engagement (for analytics card) ─────────────

export const communityEngagement = {
  activeMembers: 1284,
  newThisWeek: 23,
  engagementRate: 62,
  topBranch: "Bryanston",
  sparkline: [38, 42, 48, 55, 51, 58, 62],
};

// ───────────── Demo accounts (front-end only, no DB) ─────────────
export const demoAccounts: { email: string; password: string; roleId: RoleId; label: string }[] = [
  {
    email: "anthony@officeand.co",
    password: "demo",
    roleId: "group-ceo",
    label: "Anthony Manas — Group CEO",
  },
  {
    email: "samantha@officeand.co",
    password: "demo",
    roleId: "sales-manager",
    label: "Samantha Naidoo — Sales & CRM Manager",
  },
  {
    email: "regie@officeand.co",
    password: "demo",
    roleId: "rosebank-sales",
    label: "Regie Mthembu — Sales · Rosebank",
  },
  {
    email: "naledi@officeand.co",
    password: "demo",
    roleId: "branch-manager",
    label: "Naledi Khoza — Branch Manager · Bryanston",
  },
  {
    email: "lerato@officeand.co",
    password: "demo",
    roleId: "community-manager",
    label: "Lerato Pillay — Community Manager",
  },
  {
    email: "vijeshna@officeand.co",
    password: "demo",
    roleId: "finance",
    label: "Vijeshna Naidoo — Finance Lead",
  },
  {
    email: "lydia@officeand.co",
    password: "demo",
    roleId: "lydia-admin",
    label: "Lydia Mokoena — Union Station Administrator",
  },
];

// ───────────── Union Station — conversion analytics ─────────────
export type ConversionRow = {
  eventCode: string;
  event: string;
  branch: string;
  checkIns: number;
  leads: number;
  tours: number;
  contracts: number;
};

export const conversionByEvent: ConversionRow[] = [
  {
    eventCode: "INV-GALA-25",
    event: "Investec Year-End Gala",
    branch: "Union Station",
    checkIns: 312,
    leads: 287,
    tours: 46,
    contracts: 14,
  },
  {
    eventCode: "SB-OFFSITE",
    event: "Standard Bank Leadership Offsite",
    branch: "Union Station",
    checkIns: 138,
    leads: 121,
    tours: 22,
    contracts: 7,
  },
  {
    eventCode: "DISC-SUMMIT",
    event: "Discovery Product Summit",
    branch: "Union Station",
    checkIns: 0,
    leads: 0,
    tours: 0,
    contracts: 0,
  },
  {
    eventCode: "BRY-FBRK",
    event: "Founders Breakfast",
    branch: "Bryanston",
    checkIns: 62,
    leads: 41,
    tours: 18,
    contracts: 6,
  },
  {
    eventCode: "KYA-AIWS",
    event: "AI for Operators — Workshop",
    branch: "Kyalami",
    checkIns: 27,
    leads: 22,
    tours: 9,
    contracts: 3,
  },
  {
    eventCode: "RSB-WINE",
    event: "Wine Down Friday",
    branch: "Rosebank",
    checkIns: 89,
    leads: 34,
    tours: 11,
    contracts: 4,
  },
];

export const conversionByBranch = (() => {
  const map = new Map<
    string,
    { branch: string; checkIns: number; leads: number; tours: number; contracts: number }
  >();
  conversionByEvent.forEach((r) => {
    const b = map.get(r.branch) ?? {
      branch: r.branch,
      checkIns: 0,
      leads: 0,
      tours: 0,
      contracts: 0,
    };
    b.checkIns += r.checkIns;
    b.leads += r.leads;
    b.tours += r.tours;
    b.contracts += r.contracts;
    map.set(r.branch, b);
  });
  return Array.from(map.values());
})();

// ───────────── Tenant ordering — café + marketplace history ─────────────
export type TenantOrder = {
  id: string;
  placedAt: string;
  kind: "cafe" | "marketplace";
  branch: string;
  tenant: string;
  items: { name: string; qty: number; price: number }[];
  total: number;
  method: "Charge to account" | "Pay now";
  status: "Queued" | "Preparing" | "Ready" | "Collected" | "Shipped" | "Delivered";
};

export const tenantOrderHistory: TenantOrder[] = [];

export const cafeSalesByBranch = tenantOrderHistory
  .filter((order) => order.kind === "cafe")
  .reduce<Array<{ branch: string; sales: number; orders: number }>>((acc, order) => {
    const existing = acc.find((row) => row.branch === order.branch);
    if (existing) {
      existing.sales += order.total;
      existing.orders += 1;
    } else {
      acc.push({ branch: order.branch, sales: order.total, orders: 1 });
    }
    return acc;
  }, [])
  .sort((a, b) => b.sales - a.sales);

export const totalCafeSales = cafeSalesByBranch.reduce((sum, row) => sum + row.sales, 0);
