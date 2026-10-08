import type { Announcement, Course, Lesson, Membership, Progress, Profile } from "@/lib/types";

export type DemoUser = Profile;

export type DemoState = {
  user: DemoUser | null;
  courses: Course[];
  lessons: Lesson[];
  memberships: Membership[];
  progress: Progress[];
  announcements: Announcement[];
  profiles: Profile[];
};

const teacher: Profile = { id: "demo-teacher", full_name: "Jordan Lee", role: "teacher" };
const student: Profile = { id: "demo-student", full_name: "Mia Santos", role: "student" };

export function createDemoState(user: DemoUser | null = null): DemoState {
  const courses: Course[] = [
    {
      id: "course-biology",
      owner_id: teacher.id,
      title: "Foundations of Biology",
      subject: "Life science",
      description: "Explore the building blocks of life, from cells to ecosystems.",
      join_code: "CELL24",
      is_archived: false,
      created_at: "2026-09-10T09:00:00.000Z",
    },
    {
      id: "course-space",
      owner_id: teacher.id,
      title: "A Field Guide to Space",
      subject: "Astronomy",
      description: "A guided tour of our solar system and the stars beyond.",
      join_code: "ORBIT7",
      is_archived: false,
      created_at: "2026-09-12T09:00:00.000Z",
    },
  ];
  const lessons: Lesson[] = [
    { id: "lesson-cells", course_id: courses[0].id, title: "A closer look at cells", content: "Cells are the smallest units of life. In this lesson, compare plant and animal cells, identify their major structures, and think about how each part supports the whole organism.\n\nAs you read, notice how cell walls, membranes, and nuclei have different jobs. When you are ready, mark the lesson complete to save your progress.", sort_order: 0 },
    { id: "lesson-energy", course_id: courses[0].id, title: "How living things use energy", content: "Living things need energy to grow, repair, and respond to the world. Plants capture sunlight through photosynthesis, while animals get energy from food.\n\nWrite down one question you have about energy in living systems, then mark this lesson complete.", sort_order: 1 },
    { id: "lesson-solar", course_id: courses[1].id, title: "Our solar neighborhood", content: "Our solar system includes the Sun, eight planets, dwarf planets, moons, and countless small objects. The planets are very different in size, temperature, and composition.\n\nLook for patterns in which planets are rocky and which are gas or ice giants. Mark the lesson complete when you have finished.", sort_order: 0 },
  ];
  const memberships: Membership[] = [
    { course_id: courses[0].id, student_id: student.id, enrolled_at: "2026-09-15T09:00:00.000Z" },
  ];
  const progress: Progress[] = [
    { lesson_id: lessons[0].id, student_id: student.id, completed_at: "2026-09-16T12:00:00.000Z" },
  ];
  const announcements: Announcement[] = [
    { id: "announcement-welcome", course_id: courses[0].id, author_id: teacher.id, body: "Welcome to biology! Start with the cells lesson and bring one question to our next class.", created_at: "2026-09-15T10:00:00.000Z" },
  ];

  const profiles = [teacher, student];
  if (user && !profiles.some((profile) => profile.id === user.id)) profiles.push(user);
  return { user, courses, lessons, memberships, progress, announcements, profiles };
}

export const DEMO_STORAGE_KEY = "vrified-classroom-demo-v1";

export function loadDemoState(): DemoState {
  if (typeof window === "undefined") return createDemoState();
  try {
    const raw = window.localStorage.getItem(DEMO_STORAGE_KEY);
    if (!raw) return createDemoState();
    const parsed = JSON.parse(raw) as Partial<DemoState>;
    return { ...createDemoState(), ...parsed };
  } catch {
    return createDemoState();
  }
}

export function saveDemoState(state: DemoState): void {
  if (typeof window !== "undefined") window.localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(state));
}

export function signOutDemo(state: DemoState): DemoState {
  return { ...state, user: null };
}

export function clearDemoState(): void {
  if (typeof window !== "undefined") window.localStorage.removeItem(DEMO_STORAGE_KEY);
}
