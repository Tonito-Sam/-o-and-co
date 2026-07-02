// Mock data for Office & Co WorkspaceOS

export const branches = [
  { id: "kyalami", name: "Kyalami", region: "Gauteng", city: "Johannesburg", occupancy: 0.84, revenue: 2_410_000, status: "live" as const },
  { id: "bryanston", name: "Bryanston", region: "Gauteng", city: "Johannesburg", occupancy: 0.89, revenue: 2_780_000, status: "live" as const },
  { id: "rosebank", name: "Rosebank", region: "Gauteng", city: "Johannesburg", occupancy: 0.78, revenue: 1_910_000, status: "live" as const },
  { id: "union-station", name: "Union Station", region: "Gauteng", city: "Johannesburg", occupancy: 0.72, revenue: 1_540_000, status: "live" as const, kind: "Corporate Event Venue" as const },
  { id: "sandton", name: "Sandton (Coming Soon)", region: "Gauteng", city: "Johannesburg", occupancy: 0, revenue: 0, status: "planned" as const },
  { id: "cpt-waterfront", name: "Cape Town · V&A (Pipeline)", region: "Western Cape", city: "Cape Town", occupancy: 0, revenue: 0, status: "planned" as const },
  { id: "dbn-umhlanga", name: "Durban · Umhlanga (Exploring)", region: "KwaZulu-Natal", city: "Durban", occupancy: 0, revenue: 0, status: "planned" as const },
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

export const leads = [
  { id: "L-1042", company: "Helix Ventures", contact: "Naledi Khoza", source: "Website", stage: "Qualified", value: 48000, score: 86, branch: "Bryanston", owner: "Samantha N." },
  { id: "L-1043", company: "Northwind Legal", contact: "Pieter van der Merwe", source: "Broker", stage: "Tour Scheduled", value: 92000, score: 91, branch: "Kyalami", owner: "Samantha N." },
  { id: "L-1044", company: "Mosaic Studio", contact: "Aisha Patel", source: "Referral", stage: "Proposal Sent", value: 28000, score: 74, branch: "Rosebank", owner: "Regie M." },
  { id: "L-1045", company: "Tundra Capital", contact: "James O'Connor", source: "Event", stage: "Negotiation", value: 156000, score: 95, branch: "Bryanston", owner: "Samantha N." },
  { id: "L-1046", company: "BrightSeed Agritech", contact: "Mandla Zulu", source: "Website", stage: "Contacted", value: 36000, score: 62, branch: "Rosebank", owner: "Regie M." },
  { id: "L-1047", company: "Quanta Labs", contact: "Reza Naidoo", source: "Walk-in", stage: "New Lead", value: 0, score: 41, branch: "Kyalami", owner: "Lerato P." },
  { id: "L-1048", company: "Ember & Co.", contact: "Sara Lindberg", source: "Campaign", stage: "Won", value: 64000, score: 98, branch: "Rosebank", owner: "Samantha N." },
];

export const stages = ["New Lead", "Contacted", "Qualified", "Tour Scheduled", "Proposal Sent", "Negotiation", "Won"] as const;

export const tenants = [
  { id: "T-201", name: "Helix Ventures", plan: "Private Office · 12 desks", branch: "Bryanston", since: "2023-04", mrr: 48000, members: 14, health: "Excellent" },
  { id: "T-202", name: "Northwind Legal", plan: "Private Suite · 22 desks", branch: "Kyalami", since: "2022-08", mrr: 92000, members: 24, health: "Good" },
  { id: "T-203", name: "Mosaic Studio", plan: "Dedicated · 6 desks", branch: "Rosebank", since: "2024-01", mrr: 28000, members: 7, health: "At Risk" },
  { id: "T-204", name: "Tundra Capital", plan: "Floor · 40 desks", branch: "Bryanston", since: "2021-11", mrr: 156000, members: 38, health: "Excellent" },
  { id: "T-205", name: "Ember & Co.", plan: "Hot Desk · Flex", branch: "Rosebank", since: "2025-02", mrr: 14000, members: 4, health: "Good" },
];

export const spaces = [
  { id: "BR-01", name: "Atlas Boardroom", type: "Boardroom", branch: "Bryanston", floor: 3, capacity: 16, status: "In Use", until: "14:30" },
  { id: "MR-08", name: "Karoo Meeting Room", type: "Meeting Room", branch: "Kyalami", floor: 2, capacity: 8, status: "Available", until: "—" },
  { id: "ST-02", name: "Podcast Studio B", type: "Podcast Studio", branch: "Rosebank", floor: 2, capacity: 4, status: "Booked", until: "16:00" },
  { id: "EV-01", name: "The Loft", type: "Event Space", branch: "Bryanston", floor: 1, capacity: 120, status: "Available", until: "—" },
  { id: "HD-22", name: "Hot Desk Bank North", type: "Hot Desks", branch: "Kyalami", floor: 1, capacity: 24, status: "Partial", until: "—" },
  { id: "TR-04", name: "Cedar Training Room", type: "Training Room", branch: "Rosebank", floor: 3, capacity: 30, status: "Available", until: "—" },
];

export const invoices = [
  { id: "INV-2026-0871", tenant: "Tundra Capital", amount: 168400, status: "Paid", due: "2026-06-01", method: "EFT" },
  { id: "INV-2026-0872", tenant: "Northwind Legal", amount: 99250, status: "Sent", due: "2026-06-25", method: "—" },
  { id: "INV-2026-0873", tenant: "Helix Ventures", amount: 51120, status: "Overdue", due: "2026-06-15", method: "—" },
  { id: "INV-2026-0874", tenant: "Mosaic Studio", amount: 29900, status: "Paid", due: "2026-06-05", method: "PayFast" },
  { id: "INV-2026-0875", tenant: "Ember & Co.", amount: 14820, status: "Sent", due: "2026-06-28", method: "—" },
];

export const cafeOrders = [
  { id: "C-9921", item: "Flat White + Croissant", tenant: "Tundra Capital", member: "James O.", method: "Charge to account", status: "Ready" },
  { id: "C-9922", item: "Cortado x2", tenant: "Helix Ventures", member: "Naledi K.", method: "Pay now", status: "Preparing" },
  { id: "C-9923", item: "Smoothie Bowl", tenant: "Mosaic Studio", member: "Aisha P.", method: "Charge to account", status: "Queued" },
  { id: "C-9924", item: "Cappuccino + Banana Bread", tenant: "Northwind Legal", member: "Pieter v.", method: "Pay now", status: "Collected" },
];

export const communityPosts = [
  { id: "P-1", author: "Office & Co · Bryanston", role: "Community Manager", time: "2h", body: "Please welcome the team from Helix Ventures to our Bryanston community 🎉", reactions: 24, comments: 6, kind: "Welcome" },
  { id: "P-2", author: "Helix Ventures", role: "Tenant", time: "5h", body: "We're hiring two senior product designers — interviews on-site at Bryanston next week.", reactions: 18, comments: 4, kind: "Hiring" },
  { id: "P-3", author: "Ember & Co.", role: "Tenant", time: "1d", body: "Launching our new analytics product on Thursday. Live demo at The Loft, Bryanston.", reactions: 41, comments: 12, kind: "Launch" },
  { id: "P-4", author: "Office & Co · Group", role: "Announcement", time: "2d", body: "Sandton branch officially opens Q4 — member preview tours start September.", reactions: 67, comments: 22, kind: "Announcement" },
];

export const events = [
  { id: "E-1", title: "Founders Breakfast: Scaling Beyond R10M ARR", date: "Jun 26", branch: "Bryanston", rsvp: 64, capacity: 80, kind: "Public" },
  { id: "E-2", title: "Wine Down Friday", date: "Jun 27", branch: "Rosebank", rsvp: 92, capacity: 120, kind: "Internal" },
  { id: "E-3", title: "AI for Operators — Workshop", date: "Jul 02", branch: "Kyalami", rsvp: 28, capacity: 40, kind: "Public" },
  { id: "E-4", title: "Group Members Summit", date: "Jul 18", branch: "Bryanston", rsvp: 180, capacity: 220, kind: "Group" },
  { id: "E-5", title: "Investec Year-End Gala", date: "Jul 25", branch: "Union Station", rsvp: 320, capacity: 450, kind: "Corporate" },
  { id: "E-6", title: "Standard Bank Leadership Offsite", date: "Aug 02", branch: "Union Station", rsvp: 140, capacity: 200, kind: "Corporate" },
];

export const content = [
  { id: "M-1", title: "Building a category-defining brand in Africa", kind: "Podcast", host: "The Co Cast · Ep. 47", duration: "42 min", plays: 4820 },
  { id: "M-2", title: "Inside Tundra Capital's investment thesis", kind: "Interview", host: "James O'Connor", duration: "28 min", plays: 2310 },
  { id: "M-3", title: "Workspace design that drives retention", kind: "Video", host: "Office & Co Studios", duration: "12 min", plays: 1640 },
  { id: "M-4", title: "Negotiating enterprise contracts", kind: "Training", host: "Sales Academy with Samantha", duration: "55 min", plays: 980 },
];

export const marketplace = [
  { id: "MP-1", seller: "Office & Co Store", title: "Ergonomic standing desk", price: 6890, category: "Furniture", rating: 4.8 },
  { id: "MP-2", seller: "Helix Ventures", title: "Brand strategy sprint (2 wks)", price: 48000, category: "Services", rating: 4.9 },
  { id: "MP-3", seller: "Office & Co Store", title: "Premium stationery bundle", price: 480, category: "Supplies", rating: 4.6 },
  { id: "MP-4", seller: "Mosaic Studio", title: "Product launch video — 60s", price: 22500, category: "Services", rating: 5.0 },
];

export const tickets = [
  { id: "TKT-401", subject: "Aircon too cold on Floor 3", tenant: "Tundra Capital", priority: "Medium", status: "In Progress", sla: "2h left" },
  { id: "TKT-402", subject: "Wi-Fi guest access for event", tenant: "Helix Ventures", priority: "Low", status: "Open", sla: "1d left" },
  { id: "TKT-403", subject: "Lost access card — replacement", tenant: "Northwind Legal", priority: "High", status: "Resolved", sla: "Met" },
];

export const messages = [
  { id: "M-1", from: "Samantha Naidoo", role: "Sales & CRM Manager", preview: "Tundra Capital ready to sign — proposal countersigned, sending to legal.", time: "09:14", unread: true },
  { id: "M-2", from: "Naledi Khoza", role: "Branch Manager · Bryanston", preview: "Q3 occupancy forecast is ahead of plan — full memo attached.", time: "08:42", unread: true },
  { id: "M-3", from: "Pieter van der Merwe", role: "Branch Manager · Kyalami", preview: "Phase 2 fit-out tracking 4 days ahead.", time: "08:02", unread: false },
  { id: "M-4", from: "Finance", role: "Channel", preview: "May close report ready for Anthony to review.", time: "Yesterday", unread: false },
  { id: "M-5", from: "Group Exec", role: "Channel", preview: "Board pack v3 uploaded.", time: "Yesterday", unread: false },
];

// Use explicit en-US formatting so SSR and client output match (en-ZA uses NBSP
// thousands separators, which causes hydration mismatches in some browsers).
const _zarFmt = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
export const formatZAR = (n: number) => `R${_zarFmt.format(Math.round(n))}`;
export const formatInt = (n: number) => _zarFmt.format(Math.round(n));

// ───────────────────────── Roles & Users ─────────────────────────

export type RoleId =
  | "group-ceo"
  | "sales-manager"
  | "rosebank-sales"
  | "branch-manager"
  | "community-manager"
  | "finance"
  | "lydia-admin"
  | "tenant-admin";

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
};

const all = (v: boolean): Record<CommunityModuleKey, boolean> =>
  ({ community: v, events: v, marketplace: v, cafe: v, content: v });

export const ROLES: RoleDef[] = [
  {
    id: "group-ceo",
    user: "Anthony Manas",
    initials: "AM",
    title: "Group CEO",
    scope: "All branches · Group view",
    nav: ["/", "/analytics", "/ai-assistant", "/crm", "/tenants", "/billing", "/facilities", "/bookings", "/union-station", "/union-station-admin", "/support", "/community", "/events", "/content", "/cafe", "/marketplace", "/messaging", "/notifications", "/mobile-app", "/settings/roles"],
    communityModules: all(true),
  },
  {
    id: "sales-manager",
    user: "Samantha Naidoo",
    initials: "SN",
    title: "Sales & CRM Manager",
    scope: "Group pipeline · All branches",
    nav: ["/", "/crm", "/tenants", "/analytics", "/ai-assistant", "/events", "/content", "/union-station", "/messaging", "/notifications"],
    communityModules: { community: false, events: true, marketplace: false, cafe: false, content: true },
  },
  {
    id: "rosebank-sales",
    user: "Regina “Regie” Mthembu",
    initials: "RM",
    title: "Sales & CRM · Rosebank",
    scope: "Rosebank branch pipeline",
    nav: ["/", "/crm", "/tenants", "/events", "/content", "/community", "/messaging", "/notifications"],
    communityModules: { community: true, events: true, marketplace: false, cafe: false, content: true },
  },
  {
    id: "branch-manager",
    user: "Naledi Khoza",
    initials: "NK",
    title: "Branch Manager · Bryanston",
    scope: "Bryanston only",
    nav: ["/", "/tenants", "/facilities", "/bookings", "/support", "/community", "/events", "/cafe", "/billing", "/messaging", "/notifications"],
    communityModules: { community: true, events: true, marketplace: false, cafe: true, content: false },
  },
  {
    id: "community-manager",
    user: "Lerato Pillay",
    initials: "LP",
    title: "Community Manager · Rosebank",
    scope: "Rosebank community",
    nav: ["/", "/community", "/events", "/content", "/cafe", "/marketplace", "/bookings", "/messaging", "/notifications"],
    communityModules: all(true),
  },
  {
    id: "finance",
    user: "Marcus Olivier",
    initials: "MO",
    title: "Finance Lead",
    scope: "Group financial ops",
    nav: ["/", "/billing", "/tenants", "/analytics", "/messaging", "/notifications"],
    communityModules: all(false),
  },
  {
    id: "lydia-admin",
    user: "Lydia Mokoena",
    initials: "LM",
    title: "Union Station Administrator",
    scope: "Union Station · Corporate Events",
    nav: ["/", "/union-station", "/union-station-admin", "/bookings", "/facilities", "/support", "/events", "/analytics", "/messaging", "/notifications"],
    communityModules: { community: false, events: true, marketplace: false, cafe: false, content: false },
  },
  {
    id: "tenant-admin",
    user: "James O'Connor",
    initials: "JO",
    title: "Tundra Capital · Account Admin",
    scope: "Tundra Capital · Bryanston",
    nav: ["/", "/bookings", "/cafe", "/community", "/events", "/marketplace", "/billing", "/support", "/mobile-app", "/notifications", "/messaging"],
    communityModules: { community: true, events: true, marketplace: true, cafe: true, content: false },
  },
];

// ───────────── Tenant managers (for direct messaging with Office & Co) ─────────────
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
}[] = [
  { id: "TM-1", name: "James O'Connor", initials: "JO", title: "COO", tenant: "Tundra Capital", branch: "Bryanston", email: "james@tundra.co", online: true, lastPreview: "Thanks — can we extend the floor lease by 6 desks?", lastTime: "09:21", unread: 2 },
  { id: "TM-2", name: "Naledi Khoza", initials: "NK", title: "Operations Manager", tenant: "Helix Ventures", branch: "Bryanston", email: "naledi@helix.vc", online: true, lastPreview: "Booking the boardroom for our board meeting Thursday.", lastTime: "08:47", unread: 0 },
  { id: "TM-3", name: "Pieter van der Merwe", initials: "PM", title: "Managing Partner", tenant: "Northwind Legal", branch: "Kyalami", email: "pieter@northwind.law", online: false, lastPreview: "Invoice INV-0872 — can we get a 7 day extension?", lastTime: "Yesterday", unread: 1 },
  { id: "TM-4", name: "Aisha Patel", initials: "AP", title: "Studio Lead", tenant: "Mosaic Studio", branch: "Rosebank", email: "aisha@mosaic.studio", online: true, lastPreview: "Loved the Rosebank refresh 💚", lastTime: "Yesterday", unread: 0 },
  { id: "TM-5", name: "Sara Lindberg", initials: "SL", title: "Founder", tenant: "Ember & Co.", branch: "Rosebank", email: "sara@emberandco.io", online: false, lastPreview: "Quick sync on event sponsorship?", lastTime: "Mon", unread: 0 },
];

// ───────────── Union Station — event check-in (QR lead capture) ─────────────
export type EventAccessCode = {
  code: string;            // short access code embedded in the QR URL
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
  { code: "INV-GALA-25", eventId: "US-2026-031", title: "Investec Year-End Gala", date: "2026-07-25", client: "Investec Private Bank", attendeesExpected: 320, leadsCaptured: 287, conversionsToSales: 14, active: true },
  { code: "SB-OFFSITE",  eventId: "US-2026-032", title: "Standard Bank Leadership Offsite", date: "2026-08-02", client: "Standard Bank", attendeesExpected: 140, leadsCaptured: 121, conversionsToSales: 7, active: true },
  { code: "DISC-SUMMIT", eventId: "US-2026-033", title: "Discovery Product Summit", date: "2026-08-14", client: "Discovery Health", attendeesExpected: 220, leadsCaptured: 0, conversionsToSales: 0, active: true },
  { code: "AG-BRIEF",    eventId: "US-2026-034", title: "Allan Gray Investor Briefing", date: "2026-09-05", client: "Allan Gray", attendeesExpected: 95, leadsCaptured: 0, conversionsToSales: 0, active: false },
];

export const eventLeadsSample: { id: string; fullName: string; email: string; phone?: string; eventCode: string; capturedAt: string; status: "New" | "Qualified" | "Converted" }[] = [
  { id: "EL-1", fullName: "Tebogo Maseko", email: "tebogo@finmark.co.za", phone: "+27 82 555 1023", eventCode: "INV-GALA-25", capturedAt: "2026-07-25 18:12", status: "Qualified" },
  { id: "EL-2", fullName: "Kim Robertson", email: "kim@valex.com", eventCode: "INV-GALA-25", capturedAt: "2026-07-25 18:14", status: "Converted" },
  { id: "EL-3", fullName: "Sipho Ndlovu", email: "sipho.n@orbitcapital.co.za", phone: "+27 71 998 0021", eventCode: "INV-GALA-25", capturedAt: "2026-07-25 18:22", status: "New" },
  { id: "EL-4", fullName: "Hannah Reyes", email: "hannah@deltacorp.io", eventCode: "SB-OFFSITE", capturedAt: "2026-08-02 08:31", status: "Qualified" },
  { id: "EL-5", fullName: "Mxolisi Dube", email: "mx@duberesearch.co.za", phone: "+27 83 221 4488", eventCode: "SB-OFFSITE", capturedAt: "2026-08-02 08:38", status: "New" },
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
};

export const cafeProducts: CafeProduct[] = [
  // Bryanston
  { id: "CP-B01", branch: "Bryanston", name: "Single Origin Flat White", category: "Coffee", price: 38, description: "Ethiopian Yirgacheffe, micro-foam milk.", available: true, popular: true },
  { id: "CP-B02", branch: "Bryanston", name: "Cortado", category: "Coffee", price: 34, description: "Equal parts espresso and warm milk.", available: true },
  { id: "CP-B03", branch: "Bryanston", name: "Iced Matcha Latte", category: "Cold Drinks", price: 52, description: "Ceremonial-grade matcha, oat milk.", available: true, popular: true },
  { id: "CP-B04", branch: "Bryanston", name: "Almond Croissant", category: "Bakery", price: 42, description: "Baked fresh daily by our pastry team.", available: true },
  { id: "CP-B05", branch: "Bryanston", name: "Smashed Avo on Sourdough", category: "Breakfast", price: 95, description: "Heirloom tomato, dukkah, lime.", available: true, popular: true },
  { id: "CP-B06", branch: "Bryanston", name: "Power Bowl", category: "Lunch", price: 125, description: "Quinoa, grilled chicken, tahini.", available: true },
  // Kyalami
  { id: "CP-K01", branch: "Kyalami", name: "Americano", category: "Coffee", price: 28, description: "Double shot, hot water.", available: true },
  { id: "CP-K02", branch: "Kyalami", name: "Cappuccino", category: "Coffee", price: 36, description: "Classic, with dark chocolate dust.", available: true, popular: true },
  { id: "CP-K03", branch: "Kyalami", name: "Banana Bread", category: "Bakery", price: 38, description: "House-made with walnuts.", available: true },
  { id: "CP-K04", branch: "Kyalami", name: "Chicken Schnitzel Wrap", category: "Lunch", price: 110, description: "Slaw, garlic aioli, crisp lettuce.", available: true },
  { id: "CP-K05", branch: "Kyalami", name: "Cold Brew", category: "Cold Drinks", price: 48, description: "Slow-steeped 18 hours.", available: true },
  // Rosebank
  { id: "CP-R01", branch: "Rosebank", name: "Macchiato", category: "Coffee", price: 32, description: "Espresso with a dash of foam.", available: true },
  { id: "CP-R02", branch: "Rosebank", name: "Rooibos Cappuccino", category: "Tea", price: 36, description: "Local rooibos, steamed milk.", available: true, popular: true },
  { id: "CP-R03", branch: "Rosebank", name: "Acai Bowl", category: "Breakfast", price: 105, description: "Granola, berries, coconut.", available: true, popular: true },
  { id: "CP-R04", branch: "Rosebank", name: "Caprese Sandwich", category: "Lunch", price: 98, description: "Buffalo mozzarella, basil, balsamic.", available: true },
  { id: "CP-R05", branch: "Rosebank", name: "Chocolate Brownie", category: "Snacks", price: 35, description: "Belgian dark chocolate.", available: true },
  // Union Station
  { id: "CP-U01", branch: "Union Station", name: "Event Espresso Bar (per cup)", category: "Coffee", price: 32, description: "Available during corporate events.", available: true },
  { id: "CP-U02", branch: "Union Station", name: "Canapé Platter (10pc)", category: "Snacks", price: 320, description: "Chef's selection — for delegate breaks.", available: true },
];

// ───────────── Union Station — booking requests & approvals ─────────────

export type UnionStationStatus =
  | "Draft" | "Submitted" | "In Review" | "Quoted" | "Confirmed" | "Invoiced" | "Completed" | "Declined";

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
  avRates: { "Stage & Lighting": 12000, "Pro AV + Streaming": 18500, "Simul-translation": 9500, "Photography": 6500, "Videography": 14000 } as Record<string, number>,
  afterHoursSurchargePct: 0.18,
};

export const unionStationRequests: UnionStationRequest[] = [
  { id: "US-2026-031", client: "Investec Private Bank", contact: "Lerato Mahlangu", email: "lerato.m@investec.co.za", eventType: "Year-End Gala", date: "2026-07-25", start: "18:00", end: "23:30", attendees: 320, layout: "Banquet", catering: "Gala Dinner", av: ["Stage & Lighting", "Pro AV + Streaming", "Photography"], status: "Confirmed", estimate: 312_400, depositPct: 50, contractSent: true, contractSigned: true, submittedBy: "Samantha N.", submittedAt: "2026-05-12" },
  { id: "US-2026-032", client: "Standard Bank", contact: "Thabo Sithole", email: "t.sithole@standardbank.co.za", eventType: "Leadership Offsite", date: "2026-08-02", start: "08:00", end: "17:00", attendees: 140, layout: "Cabaret", catering: "Lunch", av: ["Pro AV + Streaming", "Videography"], status: "Quoted", estimate: 168_900, depositPct: 30, contractSent: true, contractSigned: false, submittedBy: "Samantha N.", submittedAt: "2026-06-08" },
  { id: "US-2026-033", client: "Discovery Health", contact: "Priya Naidoo", email: "p.naidoo@discovery.co.za", eventType: "Product Summit", date: "2026-08-14", start: "09:00", end: "16:00", attendees: 220, layout: "Theatre", catering: "Lunch", av: ["Pro AV + Streaming", "Simul-translation"], status: "In Review", estimate: 198_300, depositPct: 30, contractSent: false, contractSigned: false, submittedBy: "Regie M.", submittedAt: "2026-06-18" },
  { id: "US-2026-034", client: "Allan Gray", contact: "Michael Carter", email: "m.carter@allangray.co.za", eventType: "Investor Briefing", date: "2026-09-05", start: "16:00", end: "20:00", attendees: 95, layout: "Theatre", catering: "Cocktail", av: ["Stage & Lighting", "Videography"], status: "Submitted", estimate: 124_600, depositPct: 25, contractSent: false, contractSigned: false, submittedBy: "Samantha N.", submittedAt: "2026-06-22" },
  { id: "US-2026-035", client: "TechCabal Africa", contact: "Zanele Khumalo", email: "zanele@techcabal.com", eventType: "Pan-African Summit", date: "2026-10-12", start: "08:00", end: "22:00", attendees: 380, layout: "Theatre", catering: "Lunch", av: ["Pro AV + Streaming", "Simul-translation", "Photography", "Videography"], status: "Draft", estimate: 0, depositPct: 0, contractSent: false, contractSigned: false, submittedBy: "Regie M.", submittedAt: "2026-06-24" },
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
  { name: "exec-board", visibility: "private", allowedRoles: ["group-ceo", "finance"], members: 7, description: "Closed channel for the executive board. End-to-end encrypted. Audit-logged." },
  { name: "group-leadership", visibility: "restricted", allowedRoles: ["group-ceo", "sales-manager", "branch-manager", "finance"], members: 18, description: "All managers and leads across the group." },
  { name: "finance", visibility: "restricted", allowedRoles: ["group-ceo", "finance"], members: 6, description: "Finance ops, close cycle, treasury." },
  { name: "branch-managers", visibility: "restricted", allowedRoles: ["group-ceo", "branch-manager"], members: 9, description: "Branch managers across all locations." },
  { name: "ops-incident", visibility: "restricted", allowedRoles: ["group-ceo", "branch-manager", "community-manager"], members: 14, description: "Real-time incident response across facilities." },
  { name: "union-station-events", visibility: "restricted", allowedRoles: ["group-ceo", "sales-manager", "rosebank-sales", "community-manager", "lydia-admin"], members: 11, description: "Corporate event venue planning and approvals." },
  { name: "sales-floor", visibility: "restricted", allowedRoles: ["group-ceo", "sales-manager", "rosebank-sales", "lydia-admin"], members: 8, description: "Sales pipeline, deals, hand-offs." },
  { name: "announcements", visibility: "public", allowedRoles: ["group-ceo", "sales-manager", "rosebank-sales", "branch-manager", "community-manager", "finance", "lydia-admin", "tenant-admin"], members: 38, description: "Read-only company-wide announcements." },
  { name: "tenant-relations", visibility: "restricted", allowedRoles: ["group-ceo", "sales-manager", "branch-manager", "community-manager"], members: 12, description: "Internal channel that pairs with DMs to tenant managers." },
];

export const sampleThread = [
  { from: "Pieter van der Merwe", initials: "PM", role: "RM · Western Cape", text: "Cape Town launch venue confirmed for 18 July. 300 cap — RSVPs already at 240.", time: "08:02", seenBy: ["NK", "AM", "SN"] },
  { from: "Naledi Khoza", initials: "NK", role: "BM · Bryanston", text: "Excellent. I'll mirror the format for Bryanston in Q4.", time: "08:14", seenBy: ["AM", "SN", "PM"] },
  { from: "Anthony Manas", initials: "AM", role: "Group CEO", text: "Let's pull a member panel — three tenants who scaled past 20 desks here. Helix, Tundra, and someone from Rosebank.", time: "08:22", seenBy: ["SN", "PM", "NK", "LP"] },
  { from: "Samantha Naidoo", initials: "SN", role: "Sales & CRM Manager", text: "On it. Union Station bookings spiked 32% MoM — investor briefing demand is exploding.", time: "08:34", seenBy: ["AM", "NK"] },
  { from: "Pieter van der Merwe", initials: "PM", role: "RM · Western Cape", text: "Briefing comms today. Will share draft by EOD.", time: "08:41", seenBy: ["AM"] },
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
  { email: "anthony@officeand.co",  password: "demo", roleId: "group-ceo",         label: "Anthony Manas — Group CEO" },
  { email: "samantha@officeand.co", password: "demo", roleId: "sales-manager",     label: "Samantha Naidoo — Sales & CRM Manager" },
  { email: "regie@officeand.co",    password: "demo", roleId: "rosebank-sales",    label: "Regie Mthembu — Sales · Rosebank" },
  { email: "naledi@officeand.co",   password: "demo", roleId: "branch-manager",    label: "Naledi Khoza — Branch Manager · Bryanston" },
  { email: "lerato@officeand.co",   password: "demo", roleId: "community-manager", label: "Lerato Pillay — Community Manager" },
  { email: "marcus@officeand.co",   password: "demo", roleId: "finance",           label: "Marcus Olivier — Finance Lead" },
  { email: "lydia@officeand.co",    password: "demo", roleId: "lydia-admin",       label: "Lydia Mokoena — Union Station Administrator" },
  { email: "james@tundra.co",       password: "demo", roleId: "tenant-admin",      label: "James O'Connor — Tenant Admin (Tundra)" },
];

// ───────────── Union Station — conversion analytics ─────────────
export type ConversionRow = {
  eventCode: string; event: string; branch: string;
  checkIns: number; leads: number; tours: number; contracts: number;
};

export const conversionByEvent: ConversionRow[] = [
  { eventCode: "INV-GALA-25", event: "Investec Year-End Gala",           branch: "Union Station", checkIns: 312, leads: 287, tours: 46, contracts: 14 },
  { eventCode: "SB-OFFSITE",  event: "Standard Bank Leadership Offsite", branch: "Union Station", checkIns: 138, leads: 121, tours: 22, contracts: 7 },
  { eventCode: "DISC-SUMMIT", event: "Discovery Product Summit",         branch: "Union Station", checkIns: 0,   leads: 0,   tours: 0,  contracts: 0 },
  { eventCode: "BRY-FBRK",    event: "Founders Breakfast",               branch: "Bryanston",     checkIns: 62,  leads: 41,  tours: 18, contracts: 6 },
  { eventCode: "KYA-AIWS",    event: "AI for Operators — Workshop",      branch: "Kyalami",       checkIns: 27,  leads: 22,  tours: 9,  contracts: 3 },
  { eventCode: "RSB-WINE",    event: "Wine Down Friday",                 branch: "Rosebank",      checkIns: 89,  leads: 34,  tours: 11, contracts: 4 },
];

export const conversionByBranch = (() => {
  const map = new Map<string, { branch: string; checkIns: number; leads: number; tours: number; contracts: number }>();
  conversionByEvent.forEach(r => {
    const b = map.get(r.branch) ?? { branch: r.branch, checkIns: 0, leads: 0, tours: 0, contracts: 0 };
    b.checkIns += r.checkIns; b.leads += r.leads; b.tours += r.tours; b.contracts += r.contracts;
    map.set(r.branch, b);
  });
  return Array.from(map.values());
})();

// ───────────── Tenant ordering — café + marketplace history ─────────────
export type TenantOrder = {
  id: string; placedAt: string; kind: "cafe" | "marketplace"; branch: string;
  items: { name: string; qty: number; price: number }[]; total: number;
  method: "Charge to account" | "Pay now";
  status: "Queued" | "Preparing" | "Ready" | "Collected" | "Shipped" | "Delivered";
};

export const tenantOrderHistory: TenantOrder[] = [
  { id: "ORD-3141", placedAt: "2026-06-24 09:12", kind: "cafe", branch: "Bryanston", items: [{ name: "Single Origin Flat White", qty: 2, price: 38 }, { name: "Almond Croissant", qty: 1, price: 42 }], total: 118, method: "Charge to account", status: "Collected" },
  { id: "ORD-3142", placedAt: "2026-06-24 12:48", kind: "cafe", branch: "Bryanston", items: [{ name: "Power Bowl", qty: 3, price: 125 }], total: 375, method: "Charge to account", status: "Ready" },
  { id: "ORD-3143", placedAt: "2026-06-23 15:20", kind: "marketplace", branch: "Bryanston", items: [{ name: "Ergonomic standing desk", qty: 1, price: 6890 }], total: 6890, method: "Charge to account", status: "Shipped" },
  { id: "ORD-3144", placedAt: "2026-06-22 08:30", kind: "cafe", branch: "Bryanston", items: [{ name: "Cortado", qty: 4, price: 34 }], total: 136, method: "Pay now", status: "Collected" },
  { id: "ORD-3145", placedAt: "2026-06-20 10:04", kind: "marketplace", branch: "Bryanston", items: [{ name: "Premium stationery bundle", qty: 2, price: 480 }], total: 960, method: "Charge to account", status: "Delivered" },
];
