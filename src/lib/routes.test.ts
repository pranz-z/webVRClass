import { describe, expect, it } from "vitest";
import { canAccessCourse, courseIdFromPath, lessonIdFromPath } from "@/lib/routes";

describe("courseIdFromPath", () => {
  it("finds a course on the student route", () => {
    expect(courseIdFromPath("/courses/course-123")).toBe("course-123");
  });

  it("finds a course on the teacher management route", () => {
    expect(courseIdFromPath("/teacher/courses/course-123/edit")).toBe("course-123");
  });

  it("returns null when there is no course route", () => {
    expect(courseIdFromPath("/teacher")).toBeNull();
  });

  it("finds the lesson on its reading and classroom routes", () => {
    expect(lessonIdFromPath("/lessons/lesson-123")).toBe("lesson-123");
    expect(lessonIdFromPath("/lessons/lesson-123/classroom")).toBe("lesson-123");
    expect(lessonIdFromPath("/courses/course-123/classroom")).toBeNull();
  });

  it("allows only the owning teacher or an enrolled student into a course", () => {
    const course = { id: "course-123", owner_id: "teacher-1" };
    const memberships = [{ course_id: "course-123", student_id: "student-1", enrolled_at: "" }];

    expect(canAccessCourse({ id: "teacher-1", role: "teacher" }, course, memberships)).toBe(true);
    expect(canAccessCourse({ id: "teacher-2", role: "teacher" }, course, memberships)).toBe(false);
    expect(canAccessCourse({ id: "student-1", role: "student" }, course, memberships)).toBe(true);
    expect(canAccessCourse({ id: "student-2", role: "student" }, course, memberships)).toBe(false);
    expect(canAccessCourse(null, course, memberships)).toBe(false);
  });
});
