import kyalamiSoundtrack from "../../welcomemedia/soundtracks/Aylex - Okay Energy (freetouse.com).mp3";
import rosebankSoundtrack from "../../welcomemedia/soundtracks/Dagored - Urban Timelapse (freetouse.com).mp3";
import unionStationSoundtrack from "../../welcomemedia/soundtracks/Aylex - Summer Sound (freetouse.com).mp3";

export type SpaceCategory = "office" | "meeting" | "shared" | "event" | "reception" | "workspace";

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
  images?: string[];          // additional views of the same space
  panorama?: string;          // optional 360° equirect (Tier B)
  hotspots?: TourHotspot[];
  isClosingFrame?: boolean;
};

export type Tour = {
  id: "kyalami" | "rosebank" | "union-station";
  branchName: string;
  tagline: string;
  address: string;
  coverImage: string;
  soundtrack: string;
  spaces: TourSpace[];
};

const kyalamiPhotos = import.meta.glob<string>("../assets/virtual-tour/kyalami/*.jpg", {
  eager: true,
  query: "?url",
  import: "default",
});
const kyalamiVacantPhotos = import.meta.glob<string>("../assets/virtual-tour/kyalami-vacant/office-*/*.jpg", {
  eager: true,
  query: "?url",
  import: "default",
});
const rosebankPhotos = import.meta.glob<string>("../assets/virtual-tour/rosebank/*.jpg", {
  eager: true,
  query: "?url",
  import: "default",
});
const unionStationPhotos = import.meta.glob<string>("../assets/virtual-tour/union-station/*.jpg", {
  eager: true,
  query: "?url",
  import: "default",
});

function photoUrl(photos: Record<string, string>, filename: string) {
  const image = Object.entries(photos).find(([path]) => path.endsWith(`/${filename}.jpg`))?.[1];
  if (!image) throw new Error(`Missing virtual tour photo: ${filename}`);
  return image;
}

function additionalSpaces(
  tourId: Tour["id"],
  branchName: string,
  photos: Record<string, string>,
  usedPhotos: Set<string>,
): TourSpace[] {
  return Object.entries(photos)
    .sort(([a], [b]) => a.localeCompare(b))
    .filter(([path]) => !usedPhotos.has(path.split("/").pop()?.replace(/\.jpg$/i, "") ?? ""))
    .map(([path, image], index) => {
      const filename = path.split("/").pop()?.replace(/\.jpg$/i, "") ?? `${index + 1}`;
      const idSuffix = filename.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
      return {
        id: `${tourId}-${idSuffix}`,
        name: `${branchName} space ${String(index + 1).padStart(2, "0")}`,
        category: "workspace",
        description: `Explore another view of the Office & Co ${branchName} workspace.`,
        image,
      };
    });
}

function vacantKyalamiSpaces(): TourSpace[] {
  const allowedOfficeNumbers = new Set(["202", "209", "210", "211", "317", "318", "320", "323"]);
  const imagesByOffice = new Map<string, string[]>();

  for (const [path, image] of Object.entries(kyalamiVacantPhotos).sort(([a], [b]) => a.localeCompare(b))) {
    const officeNumber = path.match(/\/office-(\d+)\//)?.[1];
    if (!officeNumber || !allowedOfficeNumbers.has(officeNumber)) continue;
    imagesByOffice.set(officeNumber, [...(imagesByOffice.get(officeNumber) ?? []), image]);
  }

  return [...imagesByOffice.entries()]
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([officeNumber, images]) => ({
      id: `kyalami-vacant-office-${officeNumber}`,
      name: `Vacant Office ${officeNumber}`,
      category: "office",
      description: "Explore this available Kyalami office from multiple views.",
      image: images[0],
      images,
    }));
}

/* ------------------------------------------------------------------ */
/* KYALAMI — private offices, boardrooms, shared space                 */
/* ------------------------------------------------------------------ */
const kyalami: Tour = {
  id: "kyalami",
  branchName: "Kyalami",
  tagline: "Private offices, boardrooms and shared space.",
  address: "Kyalami Business Park, Midrand",
  coverImage: photoUrl(kyalamiPhotos, "_IGN3172"),
  soundtrack: kyalamiSoundtrack,
  spaces: [
    {
      id: "kyalami-reception",
      name: "Reception",
      category: "reception",
      description: "A calm first impression for your visitors.",
      image: photoUrl(kyalamiPhotos, "_IGN3293"),
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
      image: photoUrl(kyalamiPhotos, "_IGN3275"),
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
      image: photoUrl(kyalamiPhotos, "_IGN3195"),
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
      image: photoUrl(kyalamiPhotos, "_IGN3235"),
    },
    {
      id: "kyalami-office-c",
      name: "Private Office C",
      category: "office",
      capacity: "Fits 4–8",
      description: "Corner office with natural light and storage.",
      image: photoUrl(kyalamiPhotos, "_IGN3368"),
    },
    ...vacantKyalamiSpaces(),
    ...additionalSpaces(
      "kyalami",
      "Kyalami",
      kyalamiPhotos,
      new Set(["_IGN3172", "_IGN3293", "_IGN3275", "_IGN3195", "_IGN3235", "_IGN3368", "_IGN3398"]),
    ),
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
  coverImage: photoUrl(rosebankPhotos, "_IGN3163"),
  soundtrack: rosebankSoundtrack,
  spaces: [
    {
      id: "rosebank-lounge",
      name: "Shared Lounge",
      category: "shared",
      capacity: "Open seating",
      description: "The social heart of the branch — coffee, couches, conversation.",
      image: photoUrl(rosebankPhotos, "_IGN3053"),
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
      image: photoUrl(rosebankPhotos, "_IGN3066"),
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
      image: photoUrl(rosebankPhotos, "_IGN3107"),
    },
    ...additionalSpaces(
      "rosebank",
      "Rosebank",
      rosebankPhotos,
      new Set(["_IGN3163", "_IGN3053", "_IGN3066", "_IGN3107"]),
    ),
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
  coverImage: photoUrl(unionStationPhotos, "_IGN3339"),
  soundtrack: unionStationSoundtrack,
  spaces: [
    {
      id: "us-grand-hall",
      name: "Grand Hall",
      category: "event",
      capacity: "Up to 120 guests",
      description: "A grand room for conferences, launches and dinners.",
      image: photoUrl(unionStationPhotos, "_IGN3328"),
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
      image: photoUrl(unionStationPhotos, "_IGN3322"),
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
      image: photoUrl(unionStationPhotos, "_IGN3304"),
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
      image: photoUrl(unionStationPhotos, "_IGN3303"),
    },
    ...additionalSpaces(
      "union-station",
      "Union Station",
      unionStationPhotos,
      new Set(["_IGN3339", "_IGN3328", "_IGN3322", "_IGN3304", "_IGN3303"]),
    ),
  ],
};

export const tours: Record<Tour["id"], Tour> = {
  kyalami,
  rosebank,
  "union-station": unionStation,
};
