import type { Course, Membership, Profile } from "@/lib/types";

export function courseIdFromPath(pathname: string): string | null {
  return pathname.match(/(?:^|\/)courses\/([^/]+)/)?.[1] ?? null;
}

export function lessonIdFromPath(pathname: string): string | null {
  return pathname.match(/^\/lessons\/([^/]+)(?:\/classroom)?\/?$/)?.[1] ?? null;
}

export function canAccessCourse(user: Pick<Profile, "id" | "role"> | null, course: Pick<Course, "id" | "owner_id">, memberships: Membership[]): boolean {
  if (!user) return false;
  if (user.role === "teacher") return course.owner_id === user.id;
  return memberships.some((membership) => membership.course_id === course.id && membership.student_id === user.id);
}
