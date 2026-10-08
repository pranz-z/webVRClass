"use client";

import { useEffect, useMemo, useState } from "react";
import type { ButtonHTMLAttributes, FormEvent, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createDemoState, loadDemoState, saveDemoState, signOutDemo, type DemoState } from "@/lib/demo";
import { canPerformDemoAction } from "@/lib/permissions";
import { canAccessCourse, courseIdFromPath, lessonIdFromPath } from "@/lib/routes";
import type { Announcement, Course, Lesson, Membership, Profile, Progress, Role } from "@/lib/types";
import { ClassroomView } from "@/components/classroom-view";

type Notice = { kind: "success" | "error"; message: string } | null;
type ActionResponse = { error?: string; courseId?: string; lessonId?: string; saved?: boolean };

function progressForCourse(course: Course, lessons: Lesson[], progress: Progress[], studentId: string): number {
  const courseLessons = lessons.filter((lesson) => lesson.course_id === course.id);
  if (!courseLessons.length) return 0;
  const complete = courseLessons.filter((lesson) => progress.some((item) => item.lesson_id === lesson.id && item.student_id === studentId)).length;
  return Math.round((complete / courseLessons.length) * 100);
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Recently" : date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function isProtected(path: string): boolean {
  return /^\/(dashboard|teacher|courses|lessons)(\/|$)/.test(path);
}

async function loadRealWorkspace(client: ReturnType<typeof createClient>, user: { id: string }): Promise<DemoState> {
  const [profileResult, coursesResult, membershipsResult, lessonsResult, progressResult, announcementsResult] = await Promise.all([
    client.from("profiles").select("id,full_name,role").eq("id", user.id).single(),
    client.from("courses").select("*").eq("is_archived", false).order("created_at", { ascending: false }),
    client.from("course_memberships").select("course_id,student_id,enrolled_at"),
    client.from("lessons").select("*").order("sort_order", { ascending: true }),
    client.from("lesson_progress").select("lesson_id,student_id,completed_at"),
    client.from("announcements").select("*").order("created_at", { ascending: false }),
  ]);
  if (profileResult.error || !profileResult.data) throw new Error("Your profile is not ready yet. Ask the workspace administrator to check the Supabase setup.");
  if (coursesResult.error || membershipsResult.error || lessonsResult.error || progressResult.error || announcementsResult.error) {
    throw new Error("We couldn't load your classroom data. Check the database setup and try again.");
  }

  const profile = profileResult.data as Profile;
  const memberships = membershipsResult.data as Membership[];
  let profiles: Profile[] = [profile];
  if (profile.role === "teacher") {
    const studentIds = [...new Set(memberships.map((membership) => membership.student_id))];
    if (studentIds.length) {
      const { data } = await client.from("profiles").select("id,full_name,role").in("id", studentIds);
      if (data) profiles = [profile, ...(data as Profile[])];
    }
  }

  return {
    user: profile,
    courses: coursesResult.data as Course[],
    memberships,
    lessons: lessonsResult.data as Lesson[],
    progress: progressResult.data as Progress[],
    announcements: announcementsResult.data as Announcement[],
    profiles,
  };
}

function Button({ children, kind = "primary", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { kind?: "primary" | "secondary" | "quiet" | "danger" }) {
  return <button className={`button button-${kind}`} {...props}>{children}</button>;
}

function Field({ label, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return <label className="field"><span>{label}</span><input {...props} /></label>;
}

function TextArea({ label, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string }) {
  return <label className="field"><span>{label}</span><textarea {...props} /></label>;
}

function Stat({ value, label }: { value: string | number; label: string }) {
  return <div className="stat"><strong>{value}</strong><span>{label}</span></div>;
}

export function ClassroomApp() {
  const router = useRouter();
  const pathname = usePathname();
  const demoMode = !isSupabaseConfigured();
  const [data, setData] = useState<DemoState>(() => createDemoState());
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [activeLesson, setActiveLesson] = useState<string | null>(null);
  const [authError, setAuthError] = useState("");

  useEffect(() => {
    let alive = true;
    async function boot() {
      if (demoMode) {
        const stored = loadDemoState();
        if (alive) setData(stored);
      } else {
        try {
          const client = createClient();
          const { data: authData } = await client.auth.getUser();
          if (authData.user) {
            const workspace = await loadRealWorkspace(client, authData.user);
            if (alive) setData(workspace);
          }
        } catch (error) {
          if (alive) setAuthError(error instanceof Error ? error.message : "Couldn't connect to your account.");
        }
      }
      if (alive) setReady(true);
    }
    void boot();
    return () => { alive = false; };
  }, [demoMode]);

  useEffect(() => {
    if (demoMode && ready) saveDemoState(data);
  }, [data, demoMode, ready]);

  useEffect(() => {
    if (ready && isProtected(pathname) && !data.user) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    if (ready && pathname.startsWith("/teacher") && data.user?.role === "student") router.replace("/dashboard");
    if (ready && pathname.startsWith("/dashboard") && data.user?.role === "teacher") router.replace("/teacher");
  }, [data.user, pathname, ready, router]);

  const currentUser = data.user;
  const selectedCourse = useMemo(() => {
    const id = courseIdFromPath(pathname);
    return id ? data.courses.find((course) => course.id === id) ?? null : null;
  }, [data.courses, pathname]);
  const lessonId = useMemo(() => lessonIdFromPath(pathname), [pathname]);
  const selectedLesson = useMemo(() => lessonId ? data.lessons.find((lesson) => lesson.id === lessonId) ?? null : null, [data.lessons, lessonId]);
  const isClassroomRoute = pathname.endsWith("/classroom");
  const classroomCourse = selectedLesson ? data.courses.find((course) => course.id === selectedLesson.course_id) ?? null : selectedCourse;
  const classroomLessons = classroomCourse ? data.lessons.filter((lesson) => lesson.course_id === classroomCourse.id) : [];
  const classroomAccess = Boolean(currentUser && classroomCourse && canAccessCourse(currentUser, classroomCourse, data.memberships));

  async function reloadWorkspace() {
    if (demoMode) return;
    const client = createClient();
    const { data: authData } = await client.auth.getUser();
    if (authData.user) setData(await loadRealWorkspace(client, authData.user));
  }

  async function sendAction(action: string, payload: Record<string, unknown>): Promise<ActionResponse> {
    const response = await fetch("/api/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, payload }),
    });
    const result = await response.json() as ActionResponse;
    if (!response.ok) throw new Error(result.error || "That action couldn't be completed.");
    return result;
  }

  function demoAction(action: string, payload: Record<string, unknown>): string | void {
    if (!currentUser) throw new Error("Choose a demo profile first.");
    if (!canPerformDemoAction(currentUser.role, action)) throw new Error("This action isn't available for your account type.");

    if (action === "course.create") {
      const code = Math.random().toString(36).slice(2, 8).toUpperCase().padEnd(6, "X");
      const course: Course = {
        id: `demo-course-${crypto.randomUUID()}`, owner_id: currentUser.id,
        title: String(payload.title), subject: String(payload.subject), description: String(payload.description || ""),
        join_code: code, is_archived: false, created_at: new Date().toISOString(),
      };
      setData((state) => ({ ...state, courses: [course, ...state.courses] }));
      return course.id;
    }
    if (action === "course.update") {
      if (!data.courses.some((course) => course.id === payload.id && course.owner_id === currentUser.id)) throw new Error("Course not found or you don't have permission to edit it.");
      setData((state) => ({ ...state, courses: state.courses.map((course) => course.id === payload.id ? { ...course, title: String(payload.title), subject: String(payload.subject), description: String(payload.description || "") } : course) }));
      return String(payload.id);
    }
    if (action === "course.archive") {
      if (!data.courses.some((course) => course.id === payload.id && course.owner_id === currentUser.id)) throw new Error("Course not found or you don't have permission to archive it.");
      setData((state) => ({ ...state, courses: state.courses.map((course) => course.id === payload.id ? { ...course, is_archived: true } : course) }));
      return String(payload.id);
    }
    if (action === "lesson.create") {
      if (!data.courses.some((course) => course.id === payload.course_id && course.owner_id === currentUser.id)) throw new Error("Course not found or you don't have permission to add a lesson.");
      const lesson: Lesson = { id: `demo-lesson-${crypto.randomUUID()}`, course_id: String(payload.course_id), title: String(payload.title), content: String(payload.content), sort_order: Number(payload.sort_order) || 0 };
      setData((state) => ({ ...state, lessons: [...state.lessons, lesson] }));
      return lesson.id;
    }
    if (action === "lesson.update") {
      const existing = data.lessons.find((lesson) => lesson.id === payload.id);
      if (!existing || !data.courses.some((course) => course.id === existing.course_id && course.owner_id === currentUser.id)) throw new Error("Lesson not found or you don't have permission to edit it.");
      setData((state) => ({ ...state, lessons: state.lessons.map((lesson) => lesson.id === payload.id ? { ...lesson, title: String(payload.title), content: String(payload.content), sort_order: Number(payload.sort_order) || 0 } : lesson) }));
    }
    if (action === "course.join") {
      if (currentUser.role !== "student") throw new Error("Only students can join courses.");
      const code = String(payload.code).trim().toUpperCase();
      const course = data.courses.find((item) => item.join_code === code && !item.is_archived);
      if (!course) throw new Error("We couldn't find that course code. Try CELL24 or ORBIT7.");
      if (data.memberships.some((membership) => membership.course_id === course.id && membership.student_id === currentUser.id)) throw new Error("You're already in this course.");
      setData((state) => ({ ...state, memberships: [...state.memberships, { course_id: course.id, student_id: currentUser.id, enrolled_at: new Date().toISOString() }] }));
      return course.id;
    }
    if (action === "progress.complete") {
      if (currentUser.role !== "student") throw new Error("Only students can record lesson progress.");
      setData((state) => ({ ...state, progress: [...state.progress.filter((item) => !(item.lesson_id === payload.lesson_id && item.student_id === currentUser.id)), { lesson_id: String(payload.lesson_id), student_id: currentUser.id, completed_at: new Date().toISOString() }] }));
    }
    if (action === "announcement.create") {
      if (!data.courses.some((course) => course.id === payload.course_id && course.owner_id === currentUser.id)) throw new Error("Course not found or you don't have permission to post an announcement.");
      const announcement: Announcement = { id: `demo-announcement-${crypto.randomUUID()}`, course_id: String(payload.course_id), author_id: currentUser.id, body: String(payload.body), created_at: new Date().toISOString() };
      setData((state) => ({ ...state, announcements: [announcement, ...state.announcements] }));
    }
  }

  async function perform(action: string, payload: Record<string, unknown>, successMessage: string) {
    setBusy(true);
    setNotice(null);
    try {
      if (demoMode) demoAction(action, payload);
      else await sendAction(action, payload);
      if (!demoMode) await reloadWorkspace();
      setNotice({ kind: "success", message: successMessage });
      return true;
    } catch (error) {
      setNotice({ kind: "error", message: error instanceof Error ? error.message : "Something went wrong." });
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setAuthError("");
    const form = new FormData(event.currentTarget);
    try {
      const client = createClient();
      const { error } = await client.auth.signInWithPassword({ email: String(form.get("email") || ""), password: String(form.get("password") || "") });
      if (error) throw error;
      const next = new URLSearchParams(window.location.search).get("next");
      window.location.assign(next?.startsWith("/") && !next.startsWith("//") ? next : "/dashboard");
    } catch (error) { setAuthError(error instanceof Error ? error.message : "We couldn't sign you in."); }
    finally { setBusy(false); }
  }

  async function signUp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setAuthError("");
    const form = new FormData(event.currentTarget);
    const fullName = String(form.get("name") || "").trim();
    const email = String(form.get("email") || "").trim();
    const password = String(form.get("password") || "");
    if (fullName.length < 2 || fullName.length > 100 || password.length < 8) {
      setAuthError("Use a name of 2–100 characters and a password with at least 8 characters."); setBusy(false); return;
    }
    if (demoMode) {
      const user: Profile = { id: `demo-student-${crypto.randomUUID()}`, full_name: fullName, role: "student" };
      const initial = createDemoState(user);
      setData(initial);
      saveDemoState(initial);
      window.location.assign("/dashboard");
      return;
    }
    try {
      const client = createClient();
      const { data: result, error } = await client.auth.signUp({ email, password, options: { data: { full_name: fullName } } });
      if (error) throw error;
      if (result.session) window.location.assign("/dashboard");
      else setAuthError("Check your email to confirm your account, then sign in. New accounts start as students; ask your administrator to enable teacher access.");
    } catch (error) { setAuthError(error instanceof Error ? error.message : "We couldn't create your account."); }
    finally { setBusy(false); }
  }

  async function signOut() {
    if (demoMode) {
      const signedOut = signOutDemo(data);
      setData(signedOut);
      saveDemoState(signedOut);
      window.location.assign("/");
      return;
    }
    await createClient().auth.signOut();
    window.location.assign("/");
  }

  function enterDemo(role: Role) {
    const state = loadDemoState();
    const user = state.profiles.find((profile) => profile.id === (role === "teacher" ? "demo-teacher" : "demo-student"));
    const next = { ...state, user: user || null };
    saveDemoState(next); setData(next);
    window.location.assign(role === "teacher" ? "/teacher" : "/dashboard");
  }

  const activeLessons = data.lessons.filter((lesson) => lesson.course_id === selectedCourse?.id).sort((a, b) => a.sort_order - b.sort_order);
  const routeSegments = pathname.split("/").filter(Boolean);
  const isAuthRoute = pathname === "/login" || pathname === "/signup";

  if (!ready && pathname !== "/" && pathname !== "/features" && pathname !== "/how-it-works") {
    return <div className="loading-screen"><span className="loader" />Loading your classroom…</div>;
  }

  return (
    <div className="app-frame">
      <header className="site-header">
        <a className="brand" href="/" aria-label="VR.ified Classroom home">
          <img src="/images/vrified-logo.png" alt="" />
          <span>VR.ified <b>CLASSROOM</b></span>
        </a>
        <nav className="main-nav" aria-label="Main navigation">
          <a className={pathname === "/features" ? "active" : ""} href="/features">Features</a>
          <a className={pathname === "/how-it-works" ? "active" : ""} href="/how-it-works">How it works</a>
          {currentUser && <a className={isProtected(pathname) ? "active" : ""} href={currentUser.role === "teacher" ? "/teacher" : "/dashboard"}>My classroom</a>}
        </nav>
        <div className="header-actions">
          {currentUser ? <><span className="header-user">{currentUser.full_name.split(" ")[0]}</span><Button kind="quiet" onClick={signOut}>Sign out</Button></> : <><a className="login-link" href="/login">Log in</a><a className="button button-primary header-cta" href="/signup">Get started <span aria-hidden="true">↗</span></a></>}
        </div>
      </header>

      {demoMode && ready && <div className="demo-banner"><span className="demo-dot" /> Demo mode <span>Sample data stays in this browser and is not sent to Supabase.</span></div>}
      {notice && <div className={`notice notice-${notice.kind}`} role="status">{notice.message}<button aria-label="Dismiss message" onClick={() => setNotice(null)}>×</button></div>}

      {pathname === "/" && <main>
        <section className="hero-section">
          <div className="hero-copy">
            <div className="eyebrow"><span className="eyebrow-mark">✳</span> LEARNING, A LITTLE MORE HUMAN</div>
            <h1>Big ideas feel closer <em>in the right classroom.</em></h1>
            <p>VR.ified gives teachers and students one calm place to share lessons, follow progress, and learn together — right in the browser.</p>
            <div className="hero-actions"><a className="button button-primary button-large" href={currentUser ? "/dashboard" : "/signup"}>Explore your classroom <span aria-hidden="true">→</span></a><a className="text-link" href="/how-it-works">See how it works</a></div>
            <div className="hero-note"><span className="note-check">✓</span> Works on the device you already have <span className="note-separator">·</span> VR is optional</div>
          </div>
          <div className="hero-visual" role="img" aria-label="Illustration of a bright classroom ready for a lesson">
            <div className="visual-shape visual-shape-one" /><div className="visual-shape visual-shape-two" />
            <div className="classroom-card"><div className="classroom-card-top"><span className="live-pill"><i /> YOUR LEARNING SPACE</span><span className="card-dots">•••</span></div><div className="classroom-art"><div className="art-window"><span /><span /><span /></div><div className="art-board"><b>LEARN</b><span>together</span><i>✳</i></div><div className="art-desk" /><div className="art-plant">♧</div></div><div className="classroom-card-bottom"><span><b>01</b> A place to explore</span><span className="bottom-arrow">↗</span></div></div>
            <div className="floating-note"><span className="note-avatar">J</span><span><b>A new lesson is ready</b><small>Foundations of Biology</small></span><span className="note-spark">✦</span></div>
          </div>
          <div className="hero-index">01 — 03 <span /></div>
        </section>
        <section className="home-proof"><span>MADE FOR HOW PEOPLE LEARN</span><div><b>Learn</b><i>✳</i><b>Share</b><i>✳</i><b>Grow</b><i>✳</i><b>Together</b></div><p>Thoughtful tools for the moments that make learning stick.</p></section>
        <section className="home-preview section-wrap"><div className="section-heading"><div><div className="eyebrow">A CLEARER WAY TO TEACH & LEARN</div><h2>Everything you need to<br /><em>keep learning in motion.</em></h2></div><a className="text-link" href="/features">Explore all features <span>→</span></a></div><FeatureCards /></section>
        <Callout currentUser={currentUser} />
      </main>}

      {pathname === "/features" && <PublicFeatures />}
      {pathname === "/how-it-works" && <HowItWorks />}

      {isAuthRoute && <main className="auth-page"><div className="auth-aside"><div className="eyebrow">YOUR NEXT CHAPTER STARTS HERE</div><h1>Good learning<br /><em>has room to grow.</em></h1><p>A welcoming space for the curious, the patient, the teachers, and the learners.</p><div className="auth-aside-art"><span>✳</span><b>Learn at<br />your pace.</b><small>Make it yours.</small></div></div><div className="auth-panel"><div className="auth-card"><div className="eyebrow">{pathname === "/signup" ? "A SEAT IS WAITING" : "WELCOME BACK"}</div><h2>{pathname === "/signup" ? "Create your account" : "Sign in to learn"}</h2><p className="auth-intro">{pathname === "/signup" ? "Start with a student account. Your administrator can enable teacher access." : "Pick up where your curiosity left off."}</p>{demoMode ? <div className="demo-auth"><p className="demo-auth-label">Choose a sample profile to explore</p><Button onClick={() => enterDemo("student")}><span className="role-icon student-icon">M</span><span className="role-copy"><b>Continue as a student</b><small>Mia Santos · view lessons and progress</small></span><span>→</span></Button><Button kind="secondary" onClick={() => enterDemo("teacher")}><span className="role-icon teacher-icon">J</span><span className="role-copy"><b>Continue as a teacher</b><small>Jordan Lee · build a course</small></span><span>→</span></Button><div className="demo-boundary">No password needed. Demo changes are saved only in this browser.</div>{pathname === "/signup" && <form className="demo-signup" onSubmit={signUp}><div className="divider"><span />or create a demo learner<span /></div><Field label="Your name" name="name" autoComplete="name" required minLength={2} maxLength={100} /><Field label="Email address" type="email" name="email" autoComplete="email" required /><Field label="Password" type="password" name="password" minLength={8} autoComplete="new-password" required /><Button disabled={busy}>{busy ? "Creating…" : "Create demo learner"}</Button></form>}</div> : <form className="auth-form" onSubmit={pathname === "/signup" ? signUp : signIn}>{pathname === "/signup" && <Field label="Your name" name="name" autoComplete="name" required minLength={2} maxLength={100} />}<Field label="Email address" type="email" name="email" autoComplete="email" required /><Field label="Password" type="password" name="password" autoComplete={pathname === "/signup" ? "new-password" : "current-password"} required minLength={pathname === "/signup" ? 8 : 1} />{authError && <p className="form-error" role="alert">{authError}</p>}<Button disabled={busy}>{busy ? "Please wait…" : pathname === "/signup" ? "Create account" : "Log in"}<span>→</span></Button><p className="auth-switch">{pathname === "/signup" ? <>Already have an account? <a href="/login">Log in</a></> : <>New to VR.ified? <a href="/signup">Create an account</a></>}</p></form>}</div></div></main>}

      {pathname === "/dashboard" && currentUser?.role === "student" && <StudentDashboard data={data} onJoin={perform} busy={busy} demoMode={demoMode} />}
      {pathname === "/teacher" && currentUser?.role === "teacher" && <TeacherDashboard data={data} />}
      {pathname === "/teacher/courses/new" && currentUser?.role === "teacher" && <CourseEditor onSubmit={perform} busy={busy} />}
      {pathname.startsWith("/teacher/courses/") && pathname.endsWith("/edit") && currentUser?.role === "teacher" && selectedCourse && <CourseManager course={selectedCourse} data={data} activeLesson={activeLesson} setActiveLesson={setActiveLesson} onAction={perform} busy={busy} />}
      {pathname.startsWith("/teacher/courses/") && pathname.endsWith("/edit") && currentUser?.role === "teacher" && !selectedCourse && <EmptyState title="This course isn't available" body="It may have been archived, or you may not own it." action={<a className="button button-secondary" href="/teacher">Back to your courses</a>} />}
      {isClassroomRoute && currentUser && classroomCourse && classroomAccess && <ClassroomView key={pathname} course={classroomCourse} lessons={classroomLessons} initialLessonId={selectedLesson?.id ?? null} completedLessonIds={data.progress.filter((item) => item.student_id === currentUser.id).map((item) => item.lesson_id)} user={currentUser} busy={busy} onComplete={perform} />}
      {isClassroomRoute && currentUser && (!classroomCourse || !classroomAccess) && <EmptyState title="This classroom isn't available" body="This course is missing, or your account isn't enrolled in it." action={<a className="button button-secondary" href={currentUser.role === "teacher" ? "/teacher" : "/dashboard"}>Back to my classroom</a>} />}
      {routeSegments[0] === "courses" && routeSegments.length === 2 && selectedCourse && <CourseRoom course={selectedCourse} data={data} onAction={perform} busy={busy} />}
      {routeSegments[0] === "lessons" && routeSegments.length === 2 && selectedLesson && <LessonRoom lesson={selectedLesson} data={data} onComplete={perform} busy={busy} />}
      {isProtected(pathname) && ready && (!currentUser || (pathname.startsWith("/teacher") && currentUser.role !== "teacher")) && <div className="empty-screen"><span className="loader" />Taking you to your classroom…</div>}
      {isProtected(pathname) && currentUser && !selectedCourse && routeSegments[0] === "courses" && routeSegments.length === 2 && <EmptyState title="This course isn't available" body="It may have been archived, or you may not be enrolled in it." action={<a className="button button-secondary" href={currentUser.role === "teacher" ? "/teacher" : "/dashboard"}>Back to my classroom</a>} />}
      {isProtected(pathname) && currentUser && !selectedLesson && routeSegments[0] === "lessons" && routeSegments.length === 2 && <EmptyState title="This lesson isn't available" body="It may have moved, or you may not be enrolled in its course." action={<a className="button button-secondary" href={currentUser.role === "teacher" ? "/teacher" : "/dashboard"}>Back to my classroom</a>} />}

      {pathname !== "/" && !isAuthRoute && <footer className="site-footer"><div><a className="brand footer-brand" href="/"><img src="/images/vrified-logo.png" alt="" /><span>VR.ified <b>CLASSROOM</b></span></a><p>Learn together, wherever you are.</p></div><div className="footer-links"><a href="/features">Features</a><a href="/how-it-works">How it works</a><a href="/signup">Get started</a></div><small>Browser-first learning · VR is optional</small></footer>}
    </div>
  );
}

function FeatureCards() {
  const features = [
    { img: "feature-classroom.png", n: "01", title: "A home for every course", copy: "Keep lessons and announcements together, so everyone knows where to begin." },
    { img: "feature-lessons.png", n: "02", title: "Learn one step at a time", copy: "Clear lesson lists and simple progress help students pick up where they left off." },
    { img: "feature-communication.png", n: "03", title: "Stay in the loop", copy: "Teachers can share course updates with the students who need them." },
  ];
  return <div className="feature-grid">{features.map((item) => <article className="feature-card" key={item.n}><div className="feature-image"><img src={`/images/${item.img}`} alt="" /><span>{item.n}</span></div><h3>{item.title}</h3><p>{item.copy}</p></article>)}</div>;
}

function PublicFeatures() {
  return <main className="public-page"><section className="public-hero"><div className="eyebrow">FEATURES THAT KEEP IT SIMPLE</div><h1>Less juggling.<br /><em>More learning.</em></h1><p>Small, thoughtful tools help teachers guide a class and help students see what comes next.</p></section><section className="section-wrap public-feature-list"><FeatureCards /><div className="feature-footnote"><span>✳</span><p>Everything here works in a regular browser. VR remains an optional direction, not a requirement.</p></div></section><Callout currentUser={null} /></main>;
}

function HowItWorks() {
  const steps = [
    { n: "01", title: "Find your course", body: "Students join with a short code shared by their teacher. Teachers create a course and invite learners." },
    { n: "02", title: "Open the next lesson", body: "Lessons live together in order, with clear titles and written content to guide the way." },
    { n: "03", title: "Save your progress", body: "Mark a lesson complete to see how far you've come and where to continue." },
    { n: "04", title: "Keep everyone in sync", body: "Teachers can post course announcements and check enrollment and lesson progress." },
  ];
  return <main className="public-page"><section className="public-hero how-hero"><div className="eyebrow">A SIMPLE PATH THROUGH EVERY SUBJECT</div><h1>From first hello<br /><em>to “I get it.”</em></h1><p>One course space for the materials, updates, and small wins that move learning forward.</p></section><section className="steps-wrap">{steps.map((step) => <article className="step-row" key={step.n}><span className="step-num">{step.n}</span><h2>{step.title}</h2><p>{step.body}</p></article>)}</section><section className="immersive-note"><div className="immersive-symbol">◉</div><div><div className="eyebrow">A NOTE ABOUT VR</div><h2>Start in the browser.<br /><em>Bring a headset when it adds something.</em></h2><p>The current classroom focuses on courses, written lessons, announcements, and progress. A live headset experience is not included in this MVP.</p></div></section><Callout currentUser={null} /></main>;
}

function Callout({ currentUser }: { currentUser: Profile | null }) {
  return <section className="callout"><div><div className="eyebrow">READY WHEN YOU ARE</div><h2>Make space for<br /><em>what comes next.</em></h2></div><a className="button button-light button-large" href={currentUser ? "/dashboard" : "/signup"}>Step inside <span>→</span></a><span className="callout-star">✳</span></section>;
}

function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return <main className="empty-state"><span className="empty-star">✳</span><h2>{title}</h2><p>{body}</p>{action}</main>;
}

function StudentDashboard({ data, onJoin, busy, demoMode }: { data: DemoState; onJoin: (action: string, payload: Record<string, unknown>, success: string) => Promise<boolean>; busy: boolean; demoMode: boolean }) {
  const user = data.user!;
  const courseIds = new Set(data.memberships.filter((membership) => membership.student_id === user.id).map((membership) => membership.course_id));
  const courses = data.courses.filter((course) => courseIds.has(course.id));
  const completed = data.progress.filter((item) => item.student_id === user.id);
  const recent = [...completed].sort((a, b) => b.completed_at.localeCompare(a.completed_at)).slice(0, 3);
  async function join(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    if (await onJoin("course.join", { code: form.get("code") }, "You joined the course. Let's learn!")) event.currentTarget.reset();
  }
  return <main className="dashboard-page"><div className="page-shell"><div className="dashboard-welcome"><div><div className="eyebrow">YOUR LEARNING SPACE</div><h1>Good to see you,<br /><em>{user.full_name.split(" ")[0]}.</em></h1><p>Choose a course and keep your curiosity moving.</p></div><div className="welcome-illustration"><span>✳</span><b>Today is a<br />good day to learn.</b></div></div><div className="stats-row"><Stat value={courses.length} label="courses" /><Stat value={completed.length} label="lessons finished" /><Stat value={courses.length ? `${Math.round(courses.reduce((sum, course) => sum + progressForCourse(course, data.lessons, data.progress, user.id), 0) / courses.length)}%` : "—"} label="average progress" /></div><div className="dashboard-columns"><section className="content-column"><div className="section-bar"><div><div className="eyebrow">PICK UP WHERE YOU LEFT OFF</div><h2>My courses</h2></div><span className="count-pill">{courses.length} active</span></div>{courses.length ? <div className="course-grid">{courses.map((course, index) => { const percent = progressForCourse(course, data.lessons, data.progress, user.id); const next = data.lessons.filter((lesson) => lesson.course_id === course.id).sort((a, b) => a.sort_order - b.sort_order).find((lesson) => !completed.some((item) => item.lesson_id === lesson.id)); return <article className={`course-card course-tone-${index % 3}`} key={course.id}><div className="course-card-top"><span className="course-subject">{course.subject}</span><span className="course-card-mark">✳</span></div><h3>{course.title}</h3><p>{course.description}</p><div className="progress-label"><span>{percent}% complete</span><span>{data.lessons.filter((lesson) => lesson.course_id === course.id).length} lessons</span></div><div className="progress-track"><span style={{ width: `${percent}%` }} /></div><a className="course-open" href={`/courses/${course.id}`}>{next ? `Continue · ${next.title}` : "Open course"}<span>→</span></a></article>; })}</div> : <EmptyState title="Your next idea starts here" body="Join a course with the code your teacher gave you, and your lessons will appear here." />}</section><aside className="dashboard-aside"><div className="join-card"><div className="eyebrow">GOT A CLASS CODE?</div><h3>Join a course</h3><p>Enter the 6-character code from your teacher.{demoMode && <><br /><small>Try ORBIT7 in demo mode.</small></>}</p><form onSubmit={join}><Field label="Course code" name="code" placeholder="e.g. CELL24" required minLength={6} maxLength={6} autoCapitalize="characters" /><Button disabled={busy}>{busy ? "Joining…" : "Join course"}<span>→</span></Button></form></div><div className="activity-card"><div className="eyebrow">A FEW RECENT WINS</div><h3>Recent activity</h3>{recent.length ? <ul className="activity-list">{recent.map((item) => { const lesson = data.lessons.find((entry) => entry.id === item.lesson_id); const course = data.courses.find((entry) => entry.id === lesson?.course_id); return <li key={item.lesson_id}><span className="activity-check">✓</span><span><b>{lesson?.title ?? "Lesson complete"}</b><small>{course?.title} · {formatDate(item.completed_at)}</small></span></li>; })}</ul> : <p className="muted-copy">Your completed lessons will show up here.</p>}<a className="text-link" href="/features">See how progress works →</a></div></aside></div></div></main>;
}

function TeacherDashboard({ data }: { data: DemoState }) {
  const user = data.user!;
  const courses = data.courses.filter((course) => course.owner_id === user.id && !course.is_archived);
  const studentIds = new Set(data.memberships.filter((membership) => courses.some((course) => course.id === membership.course_id)).map((membership) => membership.student_id));
  const totalLessons = data.lessons.filter((lesson) => courses.some((course) => course.id === lesson.course_id)).length;
  return <main className="dashboard-page"><div className="page-shell"><div className="dashboard-welcome teacher-welcome"><div><div className="eyebrow">YOUR TEACHING SPACE</div><h1>Welcome, <em>{user.full_name.split(" ")[0]}.</em></h1><p>Your courses, your learners, and the next small step.</p><a className="button button-primary" href="/teacher/courses/new">＋ Create a course</a></div><div className="teacher-illustration"><span>✦</span><b>Make room<br />for big ideas.</b><small>One lesson at a time.</small></div></div><div className="stats-row"><Stat value={courses.length} label="active courses" /><Stat value={studentIds.size} label="learners" /><Stat value={totalLessons} label="lessons created" /></div><section className="content-column"><div className="section-bar"><div><div className="eyebrow">YOUR COURSE LIBRARY</div><h2>Courses</h2></div><a className="text-link" href="/teacher/courses/new">Create course →</a></div>{courses.length ? <div className="course-grid teacher-course-grid">{courses.map((course, index) => { const members = data.memberships.filter((membership) => membership.course_id === course.id); const lessons = data.lessons.filter((lesson) => lesson.course_id === course.id); const completed = data.progress.filter((progress) => lessons.some((lesson) => lesson.id === progress.lesson_id)); return <article className={`course-card course-tone-${index % 3}`} key={course.id}><div className="course-card-top"><span className="course-subject">{course.subject}</span><span className="course-card-mark">✳</span></div><h3>{course.title}</h3><p>{course.description || "Add a short description to help learners know what this course is about."}</p><div className="teacher-card-meta"><span>{members.length} learners</span><span>{lessons.length} lessons</span><span>{completed.length} completions</span></div><a className="course-open" href={`/teacher/courses/${course.id}/edit`}>Manage course <span>→</span></a></article>; })}</div> : <EmptyState title="Your first course starts here" body="Create a course, add a few lessons, and share its join code with your students." action={<a className="button button-primary" href="/teacher/courses/new">Create your first course</a>} />}</section><p className="teacher-security-note"><span>✳</span> Courses are visible only to you and their enrolled students.</p></div></main>;
}

function CourseEditor({ onSubmit, busy }: { onSubmit: (action: string, payload: Record<string, unknown>, success: string) => Promise<boolean>; busy: boolean }) {
  const router = useRouter();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    const success = await onSubmit("course.create", { title: form.get("title"), subject: form.get("subject"), description: form.get("description") }, "Course created. Now add a lesson.");
    if (success) router.push("/teacher");
  }
  return <main className="editor-page"><div className="page-shell narrow-shell"><a className="back-link" href="/teacher">← Back to your courses</a><div className="editor-heading"><div className="eyebrow">A NEW SPACE TO LEARN</div><h1>Create a course</h1><p>Start with a clear name. You can add lessons and share the join code next.</p></div><form className="editor-card" onSubmit={submit}><Field label="Course title" name="title" placeholder="e.g. Foundations of Biology" minLength={2} maxLength={80} required /><Field label="Subject" name="subject" placeholder="e.g. Life science" minLength={2} maxLength={50} required /><TextArea label="Short description" name="description" placeholder="What will students explore in this course?" maxLength={500} rows={4} /><div className="editor-actions"><a className="text-link" href="/teacher">Cancel</a><Button disabled={busy}>{busy ? "Creating…" : "Create course"}<span>→</span></Button></div></form></div></main>;
}

function CourseManager({ course, data, activeLesson, setActiveLesson, onAction, busy }: { course: Course; data: DemoState; activeLesson: string | null; setActiveLesson: (id: string | null) => void; onAction: (action: string, payload: Record<string, unknown>, success: string) => Promise<boolean>; busy: boolean }) {
  const [copied, setCopied] = useState(false);
  const lessons = data.lessons.filter((lesson) => lesson.course_id === course.id).sort((a, b) => a.sort_order - b.sort_order);
  const selected = lessons.find((lesson) => lesson.id === activeLesson) ?? null;
  const students = data.memberships.filter((membership) => membership.course_id === course.id);
  const router = useRouter();

  async function editCourse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    await onAction("course.update", { id: course.id, title: form.get("title"), subject: form.get("subject"), description: form.get("description") }, "Course details saved.");
  }
  async function saveLesson(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    const id = selected?.id;
    const success = await onAction(id ? "lesson.update" : "lesson.create", {
      ...(id ? { id } : { course_id: course.id }), title: form.get("title"), content: form.get("content"), sort_order: selected?.sort_order ?? lessons.length,
    }, id ? "Lesson updated." : "Lesson added to the course.");
    if (success) setActiveLesson(null);
  }
  async function moveLesson(lesson: Lesson, offset: number) {
    const index = lessons.findIndex((item) => item.id === lesson.id);
    const target = lessons[index + offset];
    if (!target) return;
    await onAction("lesson.update", { id: lesson.id, title: lesson.title, content: lesson.content, sort_order: target.sort_order }, "Lesson order updated.");
    await onAction("lesson.update", { id: target.id, title: target.title, content: target.content, sort_order: lesson.sort_order }, "Lesson order updated.");
  }
  async function postAnnouncement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    if (await onAction("announcement.create", { course_id: course.id, body: form.get("body") }, "Announcement shared with your students.")) event.currentTarget.reset();
  }
  async function archive() {
    if (!window.confirm("Archive this course? Students will no longer see or join it, and its history will remain saved.")) return;
    if (await onAction("course.archive", { id: course.id }, "Course archived.")) router.push("/teacher");
  }

  return <main className="editor-page"><div className="page-shell"><a className="back-link" href="/teacher">← Back to your courses</a><div className="manage-title-row"><div className="editor-heading"><div className="eyebrow">COURSE WORKSPACE</div><h1>Manage course</h1><p>Organize the learning path and stay close to your class.</p></div><Button kind="danger" onClick={archive} disabled={busy}>Archive course</Button></div><div className="manage-layout"><div className="manage-main"><form className="editor-card" onSubmit={editCourse}><div className="card-kicker">COURSE DETAILS</div><Field label="Course title" name="title" defaultValue={course.title} minLength={2} maxLength={80} required /><Field label="Subject" name="subject" defaultValue={course.subject} minLength={2} maxLength={50} required /><TextArea label="Description" name="description" defaultValue={course.description} maxLength={500} rows={3} /><div className="editor-actions"><Button disabled={busy}>{busy ? "Saving…" : "Save details"}</Button></div></form>
      <section className="editor-card lessons-editor"><div className="card-kicker">YOUR LEARNING PATH <span>{lessons.length} lessons</span></div><h2>Lessons</h2>{lessons.length ? <ol className="lesson-manage-list">{lessons.map((lesson, index) => <li className={selected?.id === lesson.id ? "selected" : ""} key={lesson.id}><span className="lesson-order">{String(index + 1).padStart(2, "0")}</span><button className="lesson-select" onClick={() => setActiveLesson(lesson.id)}><b>{lesson.title}</b><small>{lesson.content.slice(0, 78)}{lesson.content.length > 78 ? "…" : ""}</small></button><div className="order-buttons"><button aria-label={`Move ${lesson.title} up`} disabled={index === 0 || busy} onClick={() => void moveLesson(lesson, -1)}>↑</button><button aria-label={`Move ${lesson.title} down`} disabled={index === lessons.length - 1 || busy} onClick={() => void moveLesson(lesson, 1)}>↓</button></div></li>)}</ol> : <p className="muted-copy">Add your first lesson to give students a clear place to begin.</p>}
        <form className="lesson-form" onSubmit={saveLesson}><h3>{selected ? `Edit “${selected.title}”` : "Add a lesson"}</h3><Field label="Lesson title" name="title" defaultValue={selected?.title ?? ""} placeholder="e.g. A closer look at cells" minLength={2} maxLength={100} required key={selected?.id ?? "new-title"} /><TextArea label="Lesson content" name="content" defaultValue={selected?.content ?? ""} placeholder="Write a short reading, activity, or set of steps…" rows={6} minLength={10} maxLength={10000} required key={selected?.id ?? "new-content"} /><div className="editor-actions">{selected && <Button type="button" kind="quiet" onClick={() => setActiveLesson(null)}>Cancel edit</Button>}<Button disabled={busy}>{busy ? "Saving…" : selected ? "Save lesson" : "Add lesson"}<span>→</span></Button></div></form>
      </section>
      <section className="editor-card announcement-editor"><div className="card-kicker">KEEP YOUR CLASS IN THE LOOP</div><h2>Post an announcement</h2><form onSubmit={postAnnouncement}><TextArea label="Message for students" name="body" placeholder="Share a reminder, a helpful link, or a note of encouragement…" rows={3} minLength={2} maxLength={1000} required /><div className="editor-actions"><Button disabled={busy}>{busy ? "Posting…" : "Share announcement"}<span>↗</span></Button></div></form></section></div>
    <aside className="manage-aside"><div className="join-code-card"><div className="eyebrow">INVITE LEARNERS</div><h3>{course.title}</h3><p>Students can join with this course code.</p><div className="join-code">{course.join_code}</div><button className="copy-code" onClick={async () => { try { await navigator.clipboard.writeText(course.join_code); setCopied(true); window.setTimeout(() => setCopied(false), 1800); } catch { setCopied(false); } }}>{copied ? "Copied to clipboard ✓" : "Copy code ↗"}</button><a className="text-link" href={`/courses/${course.id}`}>View student course page →</a></div><div className="roster-card"><div className="eyebrow">YOUR CLASS</div><h3>{students.length} {students.length === 1 ? "learner" : "learners"}</h3>{students.length ? <ul className="roster-list">{students.map((membership) => { const student = data.profiles.find((profile) => profile.id === membership.student_id); const percent = progressForCourse(course, lessons, data.progress, membership.student_id); const done = lessons.filter((lesson) => data.progress.some((item) => item.lesson_id === lesson.id && item.student_id === membership.student_id)).length; return <li key={membership.student_id}><span className="roster-avatar">{(student?.full_name || "S").slice(0, 1).toUpperCase()}</span><span className="roster-person"><b>{student?.full_name || "Student"}</b><small>{done}/{lessons.length} lessons · {percent}%</small></span><span className="roster-progress">{percent}%</span></li>; })}</ul> : <p className="muted-copy">Your student roster will appear when learners join.</p>}</div></aside></div></div></main>;
}

function CourseRoom({ course, data, onAction, busy }: { course: Course; data: DemoState; onAction: (action: string, payload: Record<string, unknown>, success: string) => Promise<boolean>; busy: boolean }) {
  const user = data.user!;
  const isOwner = course.owner_id === user.id;
  const lessons = data.lessons.filter((lesson) => lesson.course_id === course.id).sort((a, b) => a.sort_order - b.sort_order);
  const completed = new Set(data.progress.filter((item) => item.student_id === user.id).map((item) => item.lesson_id));
  const announcements = data.announcements.filter((item) => item.course_id === course.id);
  if (!canAccessCourse(user, course, data.memberships)) return <EmptyState title="Join this course first" body="Use the course code from your teacher to get access to lessons and announcements." action={<a className="button button-primary" href="/dashboard">Go to my dashboard</a>} />;
  const next = lessons.find((lesson) => !completed.has(lesson.id));
  const classroomPath = isOwner || !lessons.length ? `/courses/${course.id}/classroom` : `/lessons/${(next ?? lessons[0]).id}/classroom`;
  const classroomLabel = isOwner ? "Preview 3D classroom" : !lessons.length ? "Open 3D classroom" : next ? "Continue in 3D classroom" : "Revisit 3D classroom";
  const percent = isOwner ? 0 : progressForCourse(course, lessons, data.progress, user.id);
  return <main className="course-room-page"><div className="page-shell"><a className="back-link" href={user.role === "teacher" ? "/teacher" : "/dashboard"}>← Back to my classroom</a><section className="course-room-hero"><div><div className="eyebrow">{course.subject.toUpperCase()} · COURSE SPACE</div><h1>{course.title}</h1><p>{course.description}</p><div className="course-room-meta"><span>{lessons.length} lessons</span><span>{isOwner ? `${data.memberships.filter((item) => item.course_id === course.id).length} learners` : `${percent}% complete`}</span></div></div><div className="course-room-art"><span>✳</span><b>{isOwner ? "A space to teach" : "A space to explore"}</b></div></section><div className="room-columns"><section className="room-lessons"><div className="section-bar"><div><div className="eyebrow">YOUR LEARNING PATH</div><h2>Lessons</h2></div>{next && !isOwner && <a className="text-link" href={`/lessons/${next.id}`}>Resume learning →</a>}</div>{lessons.length ? <ol className="room-lesson-list">{lessons.map((lesson, index) => <li key={lesson.id}><a href={`/lessons/${lesson.id}`}><span className={`lesson-status ${completed.has(lesson.id) ? "is-done" : ""}`}>{completed.has(lesson.id) ? "✓" : String(index + 1).padStart(2, "0")}</span><span className="lesson-label"><b>{lesson.title}</b><small>{completed.has(lesson.id) ? "Completed" : "Open lesson"}</small></span><span className="lesson-arrow">→</span></a></li>)}</ol> : <EmptyState title="Lessons are on their way" body="Your teacher hasn't added a lesson yet." />}<a className="button button-primary room-manage" href={classroomPath}>{classroomLabel}<span> →</span></a>{isOwner && <a className="button button-secondary room-manage" href={`/teacher/courses/${course.id}/edit`}>Manage course <span>→</span></a>}</section><aside className="room-announcements"><div className="eyebrow">NOTES FROM YOUR TEACHER</div><h2>Announcements</h2>{announcements.length ? <ul className="announcement-list">{announcements.map((item) => <li key={item.id}><span className="announcement-star">✳</span><p>{item.body}</p><small>{formatDate(item.created_at)}</small></li>)}</ul> : <p className="muted-copy">Course updates will show up here.</p>}{isOwner && <a className="text-link" href={`/teacher/courses/${course.id}/edit`}>Post an update →</a>}</aside></div></div></main>;
}

function LessonRoom({ lesson, data, onComplete, busy }: { lesson: Lesson; data: DemoState; onComplete: (action: string, payload: Record<string, unknown>, success: string) => Promise<boolean>; busy: boolean }) {
  const user = data.user!;
  const course = data.courses.find((entry) => entry.id === lesson.course_id);
  if (!course) return <EmptyState title="This lesson isn't available" body="Its course is missing or unavailable to this account." action={<a className="button button-secondary" href={user.role === "teacher" ? "/teacher" : "/dashboard"}>Back to my classroom</a>} />;
  if (!canAccessCourse(user, course, data.memberships)) return <EmptyState title="Join this course first" body="Use your teacher’s course code before opening this lesson." action={<a className="button button-primary" href="/dashboard">Go to my dashboard</a>} />;
  const lessons = data.lessons.filter((entry) => entry.course_id === course.id).sort((a, b) => a.sort_order - b.sort_order);
  const index = lessons.findIndex((entry) => entry.id === lesson.id);
  const previous = lessons[index - 1]; const next = lessons[index + 1];
  const done = data.progress.some((item) => item.lesson_id === lesson.id && item.student_id === user.id);
  return <main className="lesson-page"><div className="page-shell narrow-shell"><a className="back-link" href={`/courses/${course.id}`}>← {course.title}</a><div className="lesson-progress-top"><span>LESSON {String(index + 1).padStart(2, "0")} OF {String(lessons.length).padStart(2, "0")}</span><span>{progressForCourse(course, lessons, data.progress, user.id)}% complete</span></div><div className="progress-track"><span style={{ width: `${progressForCourse(course, lessons, data.progress, user.id)}%` }} /></div><article className="lesson-content"><div className="eyebrow">{course.subject.toUpperCase()}</div><h1>{lesson.title}</h1>{lesson.content.split(/\n\s*\n/).map((paragraph, paragraphIndex) => <p key={paragraphIndex}>{paragraph}</p>)}</article><a className="button button-secondary lesson-classroom-link" href={`/lessons/${lesson.id}/classroom`}>Open this lesson in the 3D classroom <span>↗</span></a><div className="lesson-finish">{user.role === "student" ? done ? <div className="completed-note"><span>✓</span> You’ve completed this lesson.</div> : <Button disabled={busy} onClick={() => void onComplete("progress.complete", { lesson_id: lesson.id }, "Progress saved. Nice work!")}>{busy ? "Saving…" : "Mark lesson complete"}<span>✓</span></Button> : <span className="muted-copy">Teacher view · student progress remains unchanged.</span>}</div><nav className="lesson-pager" aria-label="Lesson navigation">{previous ? <a href={`/lessons/${previous.id}`}><small>← PREVIOUS</small><b>{previous.title}</b></a> : <span />}{next ? <a className="pager-next" href={`/lessons/${next.id}`}><small>NEXT LESSON →</small><b>{next.title}</b></a> : <a className="pager-next" href={`/courses/${course.id}`}><small>COURSE COMPLETE →</small><b>Back to course</b></a>}</nav></div></main>;
}
