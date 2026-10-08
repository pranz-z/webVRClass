# VR.ified Classroom

A browser-first learning space for teachers and students. It supports courses, course join codes, written lessons, announcements, lesson progress, and an original interactive 3D classroom. A compatible headset can enter a WebXR immersive VR session; mouse, touch, and keyboard controls remain available in desktop mode. Live voice/video, multiplayer synchronization, chat, and collaborative whiteboard features are not included.

## Run the demo

Requirements: Node.js 20.9 or newer and npm.

```powershell
npm install
npm run dev
```

Open `http://localhost:3000`. With no Supabase settings, the app opens in **Demo mode**. Choose a sample student or teacher from Log in. Demo changes are stored only in this browser's local storage; they are not sent to Supabase. The sample student can join the sample astronomy course with code `ORBIT7`.

To reset demo data, sign out and remove the `vrified-classroom-demo-v1` item from the browser's local storage, then reload the page.

## Configure Supabase

1. Create a Supabase project.
2. Open the Supabase SQL Editor and run [`supabase/schema.sql`](supabase/schema.sql). This creates the tables, profile trigger, course-code join function, grants, and row-level security policies.
3. Copy `.env.example` to `.env.local`, then fill in the project URL and publishable key from the Supabase project Connect dialog:

   ```text
   NEXT_PUBLIC_SUPABASE_URL=
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
   ```

   These are the only client configuration values needed. Do not add a service-role/secret key to this app.

4. Set the Supabase Auth site URL to `http://localhost:3000` for local work. Email confirmation depends on the project's Auth email settings.
5. Run `npm run dev` again. Supabase variables are read when Next.js starts/builds; restart the dev server or rebuild after changing them.
6. Create accounts through Sign up. New accounts are students by default. Teacher roles are not accepted from signup form data. To grant teacher access, locate the user's UUID in Supabase Auth and run this as a project administrator in the SQL Editor:

   ```sql
   update public.profiles
   set role = 'teacher'
   where id = '<auth user UUID>';
   ```

Teachers can then create courses, add and reorder lessons, share join codes, post announcements, and view enrolled students' progress. Students can join by code, read lessons, and save completion progress. Database row-level security enforces these role and ownership rules.

## Enter the 3D classroom

Open a course to preview the room as its teacher or continue learning as an enrolled student. Open a lesson and select **Open this lesson in the 3D classroom** to carry that lesson into the room. The same course and lesson data powers the lesson text and presentation board.

The classroom models are built locally from Three.js geometry; there are no external model or texture URLs. Drag with a mouse or touch screen to look around and tap/click objects for feedback. Use Tab and Enter to operate accessible lesson controls; focus the 3D scene and use arrow keys or A/D to navigate lessons. In VR, point either controller at the board controls and press its trigger. The browser's headset controls and the in-room **Exit VR** control end the session.

WebXR availability depends on the browser, headset, permissions, and a secure context. Localhost is suitable for local development; deployed sites need HTTPS. If immersive VR is unavailable, the 3D room and lesson controls still work in ordinary browser mode.

## Useful commands

```powershell
npm run dev        # local development
npm test           # validation, route access, demo-permission, and WebXR helper tests
npm run typecheck  # TypeScript check
npm run build      # production build
npm start          # serve a completed production build
```

Three.js and its TypeScript declarations are the only added packages for the 3D scene. `three/addons/controls/OrbitControls.js` supplies mouse/touch camera controls; Three.js `WebGLRenderer` and `WebXRManager` render the local scene and connect immersive sessions and controllers.

There is no in-app reset for a connected Supabase database. Manage real records through the Supabase dashboard and back up data before making administrative changes.

## Security note

The old root PHP/Node registration sources have been retired. A database credential was present in that previous source and must be rotated by its owner; this repository cannot rotate the external database credential. `VR-Classroom.zip` is retained only as a historical reference and is not used by the app or deployed by Next.js. Do not distribute that archive; it may also contain copies of the old prototype configuration.
