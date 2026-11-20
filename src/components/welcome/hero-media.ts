import welcomeKyalamiVideo from "../../../welcomemedia/office_co_kyalami_timelapse_loop.mp4";

export type WelcomeSlide = { src: string; alt: string };

export function setWelcomeVideoPlaybackSpeed(video: HTMLVideoElement) {
  video.defaultPlaybackRate = 1.3;
  video.playbackRate = 1.3;
}

export const welcomeSlides: WelcomeSlide[] = [
  { src: welcomeKyalamiVideo, alt: "Office & Co Kyalami workspace video" },
];

export const heroCaptions = [
  "A considered place for your team to work.",
  "We make room for people who make room for others",
  "Spaces that Inspire",
] as const;
