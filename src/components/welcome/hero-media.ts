import welcomeKyalamiVideo from "../../../welcomemedia/office_co_kyalami_hero_90s.mp4";

export type WelcomeSlide = { src: string; alt: string };

export const welcomeSlides: WelcomeSlide[] = [
  { src: welcomeKyalamiVideo, alt: "Office & Co Kyalami workspace video" },
];

export const heroCaptions = [
  "A considered place for your team to work.",
  "We make room for people who make room for others",
  "Space that Inspire",
] as const;
