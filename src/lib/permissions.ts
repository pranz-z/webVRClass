import type { Role } from "@/lib/types";

const teacherActions = new Set(["course.create", "course.update", "course.archive", "lesson.create", "lesson.update", "announcement.create"]);
const studentActions = new Set(["course.join", "progress.complete"]);

export function canPerformDemoAction(role: Role, action: string): boolean {
  return role === "teacher" ? teacherActions.has(action) : studentActions.has(action);
}
