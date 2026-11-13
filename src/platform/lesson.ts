type TeachingCopy = {
  id: string;
  title: string;
  body: string;
  sections?: { title: string; body: string; code?: string }[];
};

export type TeachingBeat =
  | (TeachingCopy & { kind: "teach" })
  | (TeachingCopy & { kind: "recap" });

export type PlayBeatBase = { kind: "play"; id: string; navigationHint?: string };
export type FreePlayBeatBase = { kind: "free-play"; id: string; intro: string };

export type LessonBeat<Play extends PlayBeatBase, Free extends FreePlayBeatBase> =
  | TeachingBeat
  | Play
  | Free;

export type Lesson<Play extends PlayBeatBase, Free extends FreePlayBeatBase> = {
  id: string;
  title: string;
  beats: LessonBeat<Play, Free>[];
};
