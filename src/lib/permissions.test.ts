import { describe, expect, it } from "vitest";
import { canPerformDemoAction } from "@/lib/permissions";
import { createDemoState, signOutDemo } from "@/lib/demo";

describe("canPerformDemoAction", () => {
  it("lets a student join courses and record their own progress", () => {
    expect(canPerformDemoAction("student", "course.join")).toBe(true);
    expect(canPerformDemoAction("student", "progress.complete")).toBe(true);
  });

  it("keeps course and lesson management teacher-only", () => {
    expect(canPerformDemoAction("student", "course.create")).toBe(false);
    expect(canPerformDemoAction("student", "lesson.update")).toBe(false);
    expect(canPerformDemoAction("teacher", "course.create")).toBe(true);
    expect(canPerformDemoAction("teacher", "lesson.update")).toBe(true);
  });

  it("keeps student-only actions away from teacher profiles", () => {
    expect(canPerformDemoAction("teacher", "course.join")).toBe(false);
    expect(canPerformDemoAction("teacher", "progress.complete")).toBe(false);
  });

  it("clears the demo login but preserves demo course work on sign out", () => {
    const signedOut = signOutDemo(createDemoState({ id: "demo-student", full_name: "Mia Santos", role: "student" }));
    expect(signedOut.user).toBeNull();
    expect(signedOut.courses).toHaveLength(2);
    expect(signedOut.progress).toHaveLength(1);
  });

  it("includes a newly created demo learner in the teacher-visible profile list", () => {
    const state = createDemoState({ id: "demo-new-student", full_name: "Avery Park", role: "student" });
    expect(state.profiles.some((profile) => profile.id === "demo-new-student")).toBe(true);
  });
});
