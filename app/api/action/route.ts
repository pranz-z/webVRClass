import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { validateAnnouncement, validateCourseCode, validateCourseInput, validateLessonInput } from "@/lib/validation";

type ActionBody = { action?: unknown; payload?: unknown };

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function failure(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: NextRequest) {
  if (!isSupabaseConfigured()) return failure("Supabase is not configured; this app is in demo mode.", 503);

  let body: ActionBody;
  try {
    body = await request.json() as ActionBody;
  } catch {
    return failure("The request body must be valid JSON.");
  }

  const action = typeof body.action === "string" ? body.action : "";
  const payload = objectValue(body.payload);
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  const user = userData.user;
  if (userError || !user) return failure("Please sign in to continue.", 401);

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  const isTeacher = profile?.role === "teacher";

  if (action === "course.join") {
    const parsed = validateCourseCode(payload.code);
    if (!parsed.ok) return failure(parsed.error);
    const { data, error } = await supabase.rpc("join_course_by_code", { p_code: parsed.value });
    if (error) return failure(error.message.includes("not found") ? "We couldn't find that course code." : "You couldn't join this course. Check the code and try again.", 400);
    return NextResponse.json({ courseId: data });
  }

  if (action === "progress.complete") {
    if (profile?.role !== "student") return failure("Only students can record lesson progress.", 403);
    const lessonId = typeof payload.lesson_id === "string" ? payload.lesson_id : "";
    if (!lessonId) return failure("Choose a lesson first.");
    const { error } = await supabase.from("lesson_progress").upsert({
      student_id: user.id,
      lesson_id: lessonId,
      completed_at: new Date().toISOString(),
    }, { onConflict: "student_id,lesson_id" });
    if (error) return failure("Couldn't save progress. Make sure you are enrolled in this course.", 403);
    return NextResponse.json({ saved: true });
  }

  if (!isTeacher) return failure("Only teachers can manage courses and lessons.", 403);

  if (action === "course.create") {
    const parsed = validateCourseInput(payload);
    if (!parsed.ok) return failure(parsed.error);
    const { data, error } = await supabase.from("courses").insert({
      ...parsed.value,
      owner_id: user.id,
      join_code: randomBytes(3).toString("hex").toUpperCase(),
    }).select("id").single();
    if (error) return failure("Couldn't create the course. Please try again.", 400);
    return NextResponse.json({ courseId: data.id }, { status: 201 });
  }

  if (action === "course.update") {
    const id = typeof payload.id === "string" ? payload.id : "";
    const parsed = validateCourseInput(payload);
    if (!id) return failure("Choose a course to edit.");
    if (!parsed.ok) return failure(parsed.error);
    const { data, error } = await supabase.from("courses").update(parsed.value).eq("id", id).select("id").maybeSingle();
    if (error || !data) return failure("Course not found or you don't have permission to edit it.", 403);
    return NextResponse.json({ courseId: data.id });
  }

  if (action === "course.archive") {
    const id = typeof payload.id === "string" ? payload.id : "";
    if (!id) return failure("Choose a course to archive.");
    const { data, error } = await supabase.from("courses").update({ is_archived: true }).eq("id", id).select("id").maybeSingle();
    if (error || !data) return failure("Course not found or you don't have permission to archive it.", 403);
    return NextResponse.json({ courseId: data.id });
  }

  if (action === "lesson.create" || action === "lesson.update") {
    const parsed = validateLessonInput(payload);
    if (!parsed.ok) return failure(parsed.error);
    const order = Number(payload.sort_order);
    const sortOrder = Number.isInteger(order) && order >= 0 && order <= 500 ? order : 0;
    if (action === "lesson.create") {
      const courseId = typeof payload.course_id === "string" ? payload.course_id : "";
      if (!courseId) return failure("Choose a course for this lesson.");
      const { data, error } = await supabase.from("lessons").insert({
        course_id: courseId,
        ...parsed.value,
        sort_order: sortOrder,
      }).select("id").single();
      if (error) return failure("Couldn't add the lesson. Check that you own this course.", 403);
      return NextResponse.json({ lessonId: data.id }, { status: 201 });
    }

    const id = typeof payload.id === "string" ? payload.id : "";
    if (!id) return failure("Choose a lesson to edit.");
    const { data, error } = await supabase.from("lessons").update({ ...parsed.value, sort_order: sortOrder }).eq("id", id).select("id").maybeSingle();
    if (error || !data) return failure("Lesson not found or you don't have permission to edit it.", 403);
    return NextResponse.json({ lessonId: data.id });
  }

  if (action === "announcement.create") {
    const courseId = typeof payload.course_id === "string" ? payload.course_id : "";
    const parsed = validateAnnouncement(payload.body);
    if (!courseId) return failure("Choose a course first.");
    if (!parsed.ok) return failure(parsed.error);
    const { data, error } = await supabase.from("announcements").insert({
      course_id: courseId,
      author_id: user.id,
      body: parsed.value,
    }).select("id").single();
    if (error) return failure("Couldn't post the announcement. Check that you own this course.", 403);
    return NextResponse.json({ announcementId: data.id }, { status: 201 });
  }

  return failure("That action isn't supported.", 404);
}
