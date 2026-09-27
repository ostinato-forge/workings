import { useEffect, useState } from "react";
import type { LessonPlayerProps } from "../../platform/LessonFlow";
import { parseAgentLesson, type AgentLesson } from "../../training/agent-package";
import { AgentLessonView } from "./AgentLesson";

const previewComplete = () => {};

export default function AgentDraftPreview(props: LessonPlayerProps) {
  const [lesson, setLesson] = useState<AgentLesson | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const abort = new AbortController();
    fetch("/__workings_draft", { signal: abort.signal }).then(async (response) => {
      if (!response.ok) throw new Error("Choose a validated draft with the training preview command.");
      setLesson(parseAgentLesson(await response.json()));
    }).catch((problem) => { if (!abort.signal.aborted) setError(String(problem)); });
    return () => abort.abort();
  }, []);
  if (error) return <main><h1>Draft preview unavailable</h1><p role="alert">{error}</p><a href="#/courses">All courses</a></main>;
  if (!lesson) return <main><p role="status">Loading draft...</p></main>;
  return <AgentLessonView {...props} lesson={lesson} onComplete={previewComplete} />;
}
