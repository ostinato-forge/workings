import { samplingDialsLesson } from "../../lessons/sampling-dials";
import type { LessonPlayerProps } from "../../platform/LessonFlow";
import { LessonPlayer } from "../../workbench/LessonPlayer";

export default function SamplingLesson(props: LessonPlayerProps) {
  return <LessonPlayer {...props} lesson={samplingDialsLesson} />;
}
