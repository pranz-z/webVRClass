export type Role = "student" | "teacher";

export type Profile = {
  id: string;
  full_name: string;
  role: Role;
};

export type Course = {
  id: string;
  owner_id: string;
  title: string;
  subject: string;
  description: string;
  join_code: string;
  is_archived: boolean;
  created_at: string;
};

export type Lesson = {
  id: string;
  course_id: string;
  title: string;
  content: string;
  sort_order: number;
};

export type Membership = {
  course_id: string;
  student_id: string;
  enrolled_at: string;
};

export type Progress = {
  lesson_id: string;
  student_id: string;
  completed_at: string;
};

export type Announcement = {
  id: string;
  course_id: string;
  author_id: string;
  body: string;
  created_at: string;
};

export type ClassroomData = {
  profile: Profile;
  courses: Course[];
  lessons: Lesson[];
  memberships: Membership[];
  progress: Progress[];
  announcements: Announcement[];
  profiles: Profile[];
};
