"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import type { Course, Lesson, Profile } from "@/lib/types";
import type { ClassroomAction } from "@/lib/classroom-models";

const ClassroomScene = dynamic(() => import("@/components/classroom-scene"), {
  ssr: false,
  loading: () => <div className="classroom-scene-loading"><span className="loader" />Preparing the 3D classroom…</div>,
});

type Props = {
  course: Course;
  lessons: Lesson[];
  initialLessonId: string | null;
  completedLessonIds: string[];
  user: Profile;
  busy: boolean;
  onComplete: (action: string, payload: Record<string, unknown>, successMessage: string) => Promise<boolean>;
};

export function ClassroomView({ course, lessons, initialLessonId, completedLessonIds, user, busy, onComplete }: Props) {
  const orderedLessons = useMemo(() => [...lessons].sort((a, b) => a.sort_order - b.sort_order), [lessons]);
  const [selectedIndex, setSelectedIndex] = useState(() => Math.max(0, orderedLessons.findIndex((lesson) => lesson.id === initialLessonId)));
  const lesson = orderedLessons[selectedIndex] ?? null;
  const completed = Boolean(lesson && completedLessonIds.includes(lesson.id));
  const canGoPrevious = selectedIndex > 0;
  const canGoNext = selectedIndex < orderedLessons.length - 1;
  const canComplete = Boolean(lesson && user.role === "student" && !completed && !busy);

  function act(action: ClassroomAction) {
    if (action === "previous" && canGoPrevious) setSelectedIndex((index) => Math.max(0, index - 1));
    if (action === "next" && canGoNext) setSelectedIndex((index) => Math.min(orderedLessons.length - 1, index + 1));
    if (action === "complete" && lesson && canComplete) {
      void onComplete("progress.complete", { lesson_id: lesson.id }, "Progress saved. Nice work!");
    }
  }

  const presentation = {
    courseTitle: course.title,
    subject: course.subject,
    lessonTitle: lesson?.title ?? "Your classroom is ready",
    lessonContent: lesson?.content ?? "Your teacher can add the first lesson from the course workspace.",
    lessonNumber: lesson ? selectedIndex + 1 : 0,
    lessonCount: orderedLessons.length,
    canGoPrevious,
    canGoNext,
    completed,
    canComplete,
    onAction: act,
  };

  return (
    <main className="immersive-classroom-page">
      <div className="immersive-classroom-shell">
        <a className="back-link" href={`/courses/${course.id}`}>← Return to {course.title}</a>
        <header className="immersive-classroom-heading">
          <div><div className="eyebrow">{user.role === "teacher" ? "TEACHER PREVIEW" : "YOUR LEARNING SPACE"}</div><h1>{course.title}<span> / classroom</span></h1><p>Explore a calm, open classroom. VR is optional; your lesson stays available below.</p></div>
          <span className="classroom-headset-tag">✳ Headset optional</span>
        </header>

        <ClassroomScene {...presentation} />

        <section className="classroom-lesson-panel" aria-labelledby="classroom-lesson-heading">
          <div className="classroom-lesson-copy">
            <div className="eyebrow">{lesson ? `${course.subject} · LESSON ${selectedIndex + 1} OF ${orderedLessons.length}` : "COURSE PREVIEW"}</div>
            <h2 id="classroom-lesson-heading">{lesson?.title ?? "Your classroom is ready"}</h2>
            {lesson ? lesson.content.split(/\n\s*\n/).map((paragraph, index) => <p key={index}>{paragraph}</p>) : <p>Your teacher can add the first lesson from the course workspace.</p>}
            {user.role === "teacher" && <p className="classroom-teacher-note">Teacher preview · lesson completion won’t change student progress.</p>}
            {user.role === "student" && completed && <p className="classroom-completed-note">✓ You’ve completed this lesson.</p>}
          </div>
          <nav className="classroom-lesson-controls" aria-label="Classroom lesson controls">
            <button className="button button-secondary" onClick={() => act("previous")} disabled={!canGoPrevious}>← Previous</button>
            {user.role === "student" && lesson && <button className="button button-primary" onClick={() => act("complete")} disabled={!canComplete}>{busy ? "Saving…" : completed ? "Lesson complete ✓" : "Mark complete ✓"}</button>}
            <button className="button button-primary" onClick={() => act("next")} disabled={!canGoNext}>Next lesson →</button>
          </nav>
        </section>
      </div>
    </main>
  );
}
