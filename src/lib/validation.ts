export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

export type CourseInput = {
  title: string;
  subject: string;
  description: string;
};

export type LessonInput = {
  title: string;
  content: string;
};

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function validateCourseInput(input: unknown): ValidationResult<CourseInput> {
  const data = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const value = {
    title: text(data.title),
    subject: text(data.subject),
    description: text(data.description),
  };

  if (value.title.length < 2 || value.title.length > 80) {
    return { ok: false, error: "Add a course title (2–80 characters)." };
  }
  if (value.subject.length < 2 || value.subject.length > 50) {
    return { ok: false, error: "Add a subject (2–50 characters)." };
  }
  if (value.description.length > 500) {
    return { ok: false, error: "Keep the course description under 500 characters." };
  }

  return { ok: true, value };
}

export function validateLessonInput(input: unknown): ValidationResult<LessonInput> {
  const data = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const value = { title: text(data.title), content: text(data.content) };

  if (value.title.length < 2 || value.title.length > 100 || value.content.length < 10 || value.content.length > 10000) {
    return { ok: false, error: "Add a title and lesson content (at least 10 characters)." };
  }

  return { ok: true, value };
}

export function validateCourseCode(input: unknown): ValidationResult<string> {
  const code = text(input).replace(/\s+/g, "").toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(code)) {
    return { ok: false, error: "Enter a 6-character course code." };
  }
  return { ok: true, value: code };
}

export function validateAnnouncement(input: unknown): ValidationResult<string> {
  const body = text(input);
  if (body.length < 2 || body.length > 1000) {
    return { ok: false, error: "Write an announcement between 2 and 1,000 characters." };
  }
  return { ok: true, value: body };
}
