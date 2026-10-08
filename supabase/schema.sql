-- Run this once in the Supabase SQL Editor for a new project.
-- Every browser-visible table has RLS and explicit authenticated-only grants.

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default 'Learner' check (char_length(full_name) between 1 and 100),
  role text not null default 'student' check (role in ('student', 'teacher')),
  created_at timestamptz not null default now()
);

create table if not exists public.courses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  title text not null check (char_length(title) between 2 and 80),
  subject text not null check (char_length(subject) between 2 and 50),
  description text not null default '' check (char_length(description) <= 500),
  join_code text not null unique check (join_code ~ '^[A-Z0-9]{6}$'),
  is_archived boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.course_memberships (
  course_id uuid not null references public.courses (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  enrolled_at timestamptz not null default now(),
  primary key (course_id, student_id)
);

create table if not exists public.lessons (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  title text not null check (char_length(title) between 2 and 100),
  content text not null check (char_length(content) between 10 and 10000),
  sort_order integer not null default 0 check (sort_order between 0 and 500),
  created_at timestamptz not null default now()
);

create table if not exists public.lesson_progress (
  student_id uuid not null references public.profiles (id) on delete cascade,
  lesson_id uuid not null references public.lessons (id) on delete cascade,
  completed_at timestamptz not null default now(),
  primary key (student_id, lesson_id)
);

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 2 and 1000),
  created_at timestamptz not null default now()
);

create index if not exists course_memberships_student_id_idx on public.course_memberships (student_id);
create index if not exists lessons_course_order_idx on public.lessons (course_id, sort_order);
create index if not exists lesson_progress_lesson_id_idx on public.lesson_progress (lesson_id);
create index if not exists announcements_course_date_idx on public.announcements (course_id, created_at desc);

create or replace function private.is_teacher()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = 'teacher'
  );
$$;

create or replace function private.is_course_owner(p_course_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.courses c
    where c.id = p_course_id and c.owner_id = (select auth.uid())
  );
$$;

create or replace function private.is_course_member(p_course_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.course_memberships m
    where m.course_id = p_course_id and m.student_id = (select auth.uid())
  );
$$;

create or replace function private.can_view_profile(p_profile_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.course_memberships m
    join public.courses c on c.id = m.course_id
    where m.student_id = p_profile_id and c.owner_id = (select auth.uid())
  );
$$;

revoke all on function private.is_teacher() from public, anon;
revoke all on function private.is_course_owner(uuid) from public, anon;
revoke all on function private.is_course_member(uuid) from public, anon;
revoke all on function private.can_view_profile(uuid) from public, anon;
grant execute on function private.is_teacher() to authenticated;
grant execute on function private.is_course_owner(uuid) to authenticated;
grant execute on function private.is_course_member(uuid) to authenticated;
grant execute on function private.can_view_profile(uuid) to authenticated;

create or replace function public.create_classroom_profile()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), 'Learner'),
    'student'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists create_classroom_profile on auth.users;
create trigger create_classroom_profile
after insert on auth.users
for each row execute function public.create_classroom_profile();
revoke all on function public.create_classroom_profile() from public, anon, authenticated;

-- A student can discover a course by its code without being able to list all
-- course codes. This function inserts only the caller's own membership.
create or replace function public.join_course_by_code(p_code text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  found_course_id uuid;
begin
  if current_user_id is null then
    raise exception 'Sign in is required';
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = current_user_id and p.role = 'student'
  ) then
    raise exception 'Only students can join courses';
  end if;

  select c.id into found_course_id
  from public.courses c
  where c.join_code = upper(trim(p_code)) and c.is_archived = false;

  if found_course_id is null then
    raise exception 'Course code not found or unavailable';
  end if;

  insert into public.course_memberships (course_id, student_id)
  values (found_course_id, current_user_id)
  on conflict (course_id, student_id) do nothing;

  return found_course_id;
end;
$$;

revoke all on function public.join_course_by_code(text) from public, anon;
grant execute on function public.join_course_by_code(text) to authenticated;

alter table public.profiles enable row level security;
alter table public.courses enable row level security;
alter table public.course_memberships enable row level security;
alter table public.lessons enable row level security;
alter table public.lesson_progress enable row level security;
alter table public.announcements enable row level security;

revoke all on public.profiles, public.courses, public.course_memberships,
  public.lessons, public.lesson_progress, public.announcements from anon, authenticated;
grant select on public.profiles, public.courses, public.course_memberships,
  public.lessons, public.lesson_progress, public.announcements to authenticated;
grant update (full_name) on public.profiles to authenticated;
grant insert, update on public.courses to authenticated;
grant insert, update on public.lessons to authenticated;
grant insert, update on public.lesson_progress to authenticated;
grant insert on public.announcements to authenticated;

drop policy if exists "profiles: self or course teacher" on public.profiles;
create policy "profiles: self or course teacher" on public.profiles
for select to authenticated
using (id = (select auth.uid()) or (select private.can_view_profile(id)));

drop policy if exists "profiles: update own name" on public.profiles;
create policy "profiles: update own name" on public.profiles
for update to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

drop policy if exists "courses: owner or member can read" on public.courses;
create policy "courses: owner or member can read" on public.courses
for select to authenticated
using (owner_id = (select auth.uid()) or (select private.is_course_member(id)));

drop policy if exists "courses: teachers create their own" on public.courses;
create policy "courses: teachers create their own" on public.courses
for insert to authenticated
with check (owner_id = (select auth.uid()) and (select private.is_teacher()));

drop policy if exists "courses: owner updates own" on public.courses;
create policy "courses: owner updates own" on public.courses
for update to authenticated
using (owner_id = (select auth.uid()) and (select private.is_teacher()))
with check (owner_id = (select auth.uid()) and (select private.is_teacher()));

drop policy if exists "memberships: student or course teacher reads" on public.course_memberships;
create policy "memberships: student or course teacher reads" on public.course_memberships
for select to authenticated
using (student_id = (select auth.uid()) or (select private.is_course_owner(course_id)));

drop policy if exists "lessons: course members read" on public.lessons;
create policy "lessons: course members read" on public.lessons
for select to authenticated
using ((select private.is_course_owner(course_id)) or (select private.is_course_member(course_id)));

drop policy if exists "lessons: course teacher adds" on public.lessons;
create policy "lessons: course teacher adds" on public.lessons
for insert to authenticated
with check ((select private.is_course_owner(course_id)) and (select private.is_teacher()));

drop policy if exists "lessons: course teacher edits" on public.lessons;
create policy "lessons: course teacher edits" on public.lessons
for update to authenticated
using ((select private.is_course_owner(course_id)) and (select private.is_teacher()))
with check ((select private.is_course_owner(course_id)) and (select private.is_teacher()));

drop policy if exists "progress: learner or course teacher reads" on public.lesson_progress;
create policy "progress: learner or course teacher reads" on public.lesson_progress
for select to authenticated
using (
  student_id = (select auth.uid())
  or exists (
    select 1 from public.lessons l
    where l.id = lesson_progress.lesson_id
      and (select private.is_course_owner(l.course_id))
  )
);

drop policy if exists "progress: learner records own work" on public.lesson_progress;
create policy "progress: learner records own work" on public.lesson_progress
for insert to authenticated
with check (
  student_id = (select auth.uid())
  and exists (
    select 1 from public.lessons l
    where l.id = lesson_progress.lesson_id
      and (select private.is_course_member(l.course_id))
  )
);

drop policy if exists "progress: learner updates own work" on public.lesson_progress;
create policy "progress: learner updates own work" on public.lesson_progress
for update to authenticated
using (student_id = (select auth.uid()))
with check (
  student_id = (select auth.uid())
  and exists (
    select 1 from public.lessons l
    where l.id = lesson_progress.lesson_id
      and (select private.is_course_member(l.course_id))
  )
);

drop policy if exists "announcements: members read" on public.announcements;
create policy "announcements: members read" on public.announcements
for select to authenticated
using ((select private.is_course_owner(course_id)) or (select private.is_course_member(course_id)));

drop policy if exists "announcements: course teacher posts" on public.announcements;
create policy "announcements: course teacher posts" on public.announcements
for insert to authenticated
with check (
  author_id = (select auth.uid())
  and (select private.is_course_owner(course_id))
  and (select private.is_teacher())
);

-- Teacher accounts are deliberately provisioned by an administrator, never
-- accepted from editable signup metadata. After signup, promote an account:
-- update public.profiles set role = 'teacher' where id = '<auth user UUID>';
