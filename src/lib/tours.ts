// src/lib/tours.ts
import rosebankImg from "@/assets/space-rosebank.jpg";

export type SpaceCategory = "office" | "meeting" | "shared" | "event" | "reception";

export type TourHotspot = {
  x: number;            // % from left (0–100)
  y: number;            // % from top  (0–100)
  label: string;
  toSpaceId?: string;   // if set, clicking navigates to that space in the same tour
  /** Precise Pannellum coordinates; when set, these override the x/y mapping. */
  yaw?: number;         // -180..180
  pitch?: number;       // -90..90
};

export type TourSpace = {
  id: string;                 // unique across ALL branches, e.g. "kyalami-boardroom"
  name: string;               // "Boardroom", "Private Office A", "Grand Hall"
  category: SpaceCategory;
  capacity?: string;          // "Seats 12", "Up to 80 guests"
  description: string;
  image: string;              // main still image
  panorama?: string;          // optional 360° equirect (Tier B)
  hotspots?: TourHotspot[];
};

export type Tour = {
  id: "kyalami" | "rosebank" | "union-station";
  branchName: string;
  tagline: string;
  address: string;
  coverImage: string;
  spaces: TourSpace[];
};

/* ------------------------------------------------------------------ */
/* KYALAMI — private offices, boardrooms, shared space                 */
/* ------------------------------------------------------------------ */
const kyalami: Tour = {
  id: "kyalami",
  branchName: "Kyalami",
  tagline: "Private offices, boardrooms and shared space.",
  address: "Kyalami Business Park, Midrand",
  coverImage: "/kyalami/private-office-a.jpg",
  spaces: [
    {
      id: "kyalami-reception",
      name: "Reception",
      category: "reception",
      description: "A calm first impression for your visitors.",
      image: "/kyalami/available-private-office-a.jpg",
      hotspots: [
        { x: 60, y: 55, label: "Boardroom →", toSpaceId: "kyalami-boardroom" },
      ],
    },
    {
      id: "kyalami-boardroom",
      name: "Boardroom",
      category: "meeting",
      capacity: "Seats 12",
      description: "AV-ready boardroom for client sessions and team reviews.",
      image: "/kyalami/hero-boardroom.jpg",
      hotspots: [
        { x: 25, y: 65, label: "Private offices →", toSpaceId: "kyalami-office-a" },
      ],
    },
    {
      id: "kyalami-office-a",
      name: "Private Office A",
      category: "office",
      capacity: "Fits 2–4",
      description: "A furnished, lockable office — yours from day one.",
      image: "/kyalami/available-private-office-a.jpg",
      hotspots: [
        { x: 70, y: 60, label: "Office B →", toSpaceId: "kyalami-office-b" },
      ],
    },
    {
      id: "kyalami-office-b",
      name: "Private Office B",
      category: "office",
      capacity: "Fits 3–6",
      description: "A slightly larger office for a growing team.",
      image: "/kyalami/available-private-office-b.jpg",
    },
    {
      id: "kyalami-office-c",
      name: "Private Office C",
      category: "office",
      capacity: "Fits 4–8",
      description: "Corner office with natural light and storage.",
      image: "/kyalami/available-private-office-c.jpg",
    },
    {
      id: "kyalami-office-209",
      name: "Private Office 209",
      category: "office",
      capacity: "Fits 2–4",
      description: "Second-floor office with a quieter outlook.",
      image: "/kyalami/office-209.jpg",
    },
  ],
};

/* ------------------------------------------------------------------ */
/* ROSEBANK — its own distinct spaces                                  */
/* ------------------------------------------------------------------ */
const rosebank: Tour = {
  id: "rosebank",
  branchName: "Rosebank",
  tagline: "Private offices and shared workspace in Rosebank.",
  address: "Rosebank, Johannesburg",
  coverImage: rosebankImg,
  spaces: [
    {
      id: "rosebank-lounge",
      name: "Shared Lounge",
      category: "shared",
      capacity: "Open seating",
      description: "The social heart of the branch — coffee, couches, conversation.",
      image: rosebankImg,
      hotspots: [
        { x: 55, y: 60, label: "Meeting room →", toSpaceId: "rosebank-meeting" },
      ],
    },
    {
      id: "rosebank-meeting",
      name: "Meeting Room",
      category: "meeting",
      capacity: "Seats 8",
      description: "A glass-walled room for team stand-ups and client calls.",
      image: rosebankImg,
      hotspots: [
        { x: 40, y: 55, label: "Private office →", toSpaceId: "rosebank-office" },
      ],
    },
    {
      id: "rosebank-office",
      name: "Private Office",
      category: "office",
      capacity: "Fits 2–5",
      description: "Furnished, lockable office off the shared corridor.",
      image: rosebankImg,
    },
  ],
};

/* ------------------------------------------------------------------ */
/* UNION STATION — events only                                         */
/* ------------------------------------------------------------------ */
const unionStation: Tour = {
  id: "union-station",
  branchName: "Union Station",
  tagline: "A distinctive venue for company events.",
  address: "Johannesburg",
  coverImage: "/union-station/grand-hall.jpg",
  spaces: [
    {
      id: "us-grand-hall",
      name: "Grand Hall",
      category: "event",
      capacity: "Up to 120 guests",
      description: "A grand room for conferences, launches and dinners.",
      image: "/union-station/grand-hall.jpg",
      hotspots: [
        { x: 70, y: 60, label: "Garden patio →", toSpaceId: "us-garden" },
      ],
    },
    {
      id: "us-garden",
      name: "Garden Patio",
      category: "event",
      capacity: "Up to 60 guests",
      description: "An outdoor space for receptions and breaks.",
      image: "/union-station/garden-patio.jpg",
      hotspots: [
        { x: 30, y: 55, label: "Dining room →", toSpaceId: "us-dining" },
      ],
    },
    {
      id: "us-dining",
      name: "Event Dining",
      category: "event",
      capacity: "Seats 40",
      description: "A dining setup for celebrations and long tables.",
      image: "/union-station/event-dining.jpg",
      hotspots: [
        { x: 60, y: 55, label: "Intimate dining →", toSpaceId: "us-intimate" },
      ],
    },
    {
      id: "us-intimate",
      name: "Dining Room",
      category: "event",
      capacity: "Seats 12",
      description: "An intimate room for board dinners and small gatherings.",
      image: "/union-station/dining-room.jpg",
    },
  ],
};

export const tours: Record<Tour["id"], Tour> = {
  kyalami,
  rosebank,
  "union-station": unionStation,
};
