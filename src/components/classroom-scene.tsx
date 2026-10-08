"use client";

import { useEffect, useRef, useState } from "react";
import type { OrbitControls as OrbitControlsType } from "three/addons/controls/OrbitControls.js";
import { buildClassroomWorld, type ClassroomAction, type ClassroomPresentation } from "@/lib/classroom-models";
import { detectImmersiveVrSupport, vrSessionError, type WebXRSystem } from "@/lib/webxr";

type BrowserXRSession = EventTarget & { end: () => Promise<void> };
type BrowserXRSystem = WebXRSystem & {
  requestSession: (mode: "immersive-vr", options?: { optionalFeatures?: string[] }) => Promise<BrowserXRSession>;
};

type Props = ClassroomPresentation & {
  onAction: (action: ClassroomAction) => void;
};

export default function ClassroomScene(props: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<import("three").WebGLRenderer | null>(null);
  const worldRef = useRef<ReturnType<typeof buildClassroomWorld> | null>(null);
  const propsRef = useRef(props);
  const [loading, setLoading] = useState(true);
  const [renderError, setRenderError] = useState("");
  const [vrSupported, setVrSupported] = useState<boolean | null>(null);
  const [vrError, setVrError] = useState("");
  const [inVr, setInVr] = useState(false);
  const [sceneMessage, setSceneMessage] = useState("Look around the room. Select the board, a desk, or the globe to explore.");

  propsRef.current = props;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const container = host;
    let disposed = false;
    let scene: import("three").Scene | null = null;
    let renderer: import("three").WebGLRenderer | null = null;
    let world: ReturnType<typeof buildClassroomWorld> | null = null;
    let controls: OrbitControlsType | null = null;
    let resizeObserver: ResizeObserver | null = null;
    const controllerLines: Array<{ geometry: import("three").BufferGeometry; material: import("three").Material }> = [];

    async function initialize() {
      try {
        const [THREE, { OrbitControls }, { RoundedBoxGeometry }] = await Promise.all([
          import("three"),
          import("three/addons/controls/OrbitControls.js"),
          import("three/addons/geometries/RoundedBoxGeometry.js"),
        ]);
        if (disposed) return;

        const width = Math.max(container.clientWidth, 320);
        const height = Math.max(container.clientHeight, 360);
        world = buildClassroomWorld(THREE, RoundedBoxGeometry, propsRef.current);
        scene = world.scene;
        worldRef.current = world;

        const camera = new THREE.PerspectiveCamera(48, width / height, 0.1, 50);
        camera.position.set(0, 1.75, 8.5);
        camera.lookAt(0, 1.85, -0.25);

        renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
        renderer.setSize(width, height);
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.12;
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        renderer.xr.enabled = true;
        renderer.xr.setReferenceSpaceType("local-floor");
        renderer.domElement.className = "classroom-canvas";
        renderer.domElement.tabIndex = 0;
        renderer.domElement.setAttribute("aria-label", "Interactive 3D classroom. Use mouse or touch to look around; focus and press Enter to select an object.");
        renderer.domElement.setAttribute("role", "img");
        container.prepend(renderer.domElement);
        rendererRef.current = renderer;

        controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.065;
        controls.target.set(0, 1.7, -0.35);
        controls.minDistance = 3.3;
        controls.maxDistance = 12.5;
        controls.maxPolarAngle = Math.PI * 0.49;
        controls.update();

        const raycaster = new THREE.Raycaster();
        const pointer = new THREE.Vector2();
        const targetFromCamera = () => {
          raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
          return raycaster.intersectObjects(world?.interactive ?? [], true)[0]?.object ?? null;
        };
        const actionOf = (object: import("three").Object3D | null): ClassroomAction | null => {
          let current: import("three").Object3D | null = object;
          while (current) {
            const action = current.userData.classroomAction as ClassroomAction | undefined;
            if (action) return action;
            current = current.parent;
          }
          return null;
        };
        const performAction = (action: ClassroomAction) => {
          const current = propsRef.current;
          if (action === "previous" && !current.canGoPrevious) {
            setSceneMessage("You’re at the first lesson.");
            return;
          }
          if (action === "next" && !current.canGoNext) {
            setSceneMessage("You’re at the last lesson.");
            return;
          }
          if (action === "complete" && (!current.canComplete || current.completed)) {
            setSceneMessage(current.completed ? "This lesson is already complete." : "Sign in as an enrolled student to save lesson progress.");
            return;
          }
          if (action === "board") setSceneMessage("The presentation board shows the selected lesson. Use its controls or the accessible lesson controls below.");
          else if (action === "desk") setSceneMessage("Student desk selected. Use the lesson controls below to move through the learning path.");
          else if (action === "globe") setSceneMessage("Learning globe selected. Use the lesson controls below to continue exploring.");
          else if (action === "exit") {
            const session = renderer?.xr.getSession();
            if (session) void session.end().catch(() => setVrError("The headset could not close the VR session. Use the headset’s system exit control."));
            return;
          }
          current.onAction(action);
        };

        let pointerDown: { x: number; y: number } | null = null;
        const pointerMove = (event: PointerEvent) => {
          const bounds = renderer!.domElement.getBoundingClientRect();
          pointer.set(((event.clientX - bounds.left) / bounds.width) * 2 - 1, -((event.clientY - bounds.top) / bounds.height) * 2 + 1);
          raycaster.setFromCamera(pointer, camera);
          const hit = raycaster.intersectObjects(world!.interactive, true)[0]?.object ?? null;
          renderer!.domElement.style.cursor = hit ? "pointer" : "grab";
        };
        const pointerStart = (event: PointerEvent) => { pointerDown = { x: event.clientX, y: event.clientY }; };
        const pointerEnd = (event: PointerEvent) => {
          if (!pointerDown || Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y) > 7) {
            pointerDown = null;
            return;
          }
          pointerDown = null;
          const bounds = renderer!.domElement.getBoundingClientRect();
          pointer.set(((event.clientX - bounds.left) / bounds.width) * 2 - 1, -((event.clientY - bounds.top) / bounds.height) * 2 + 1);
          raycaster.setFromCamera(pointer, camera);
          const hit = raycaster.intersectObjects(world!.interactive, true)[0]?.object ?? null;
          const action = actionOf(hit);
          if (action) performAction(action);
        };
        const pointerCancel = () => { pointerDown = null; };
        renderer.domElement.addEventListener("pointermove", pointerMove);
        renderer.domElement.addEventListener("pointerdown", pointerStart);
        renderer.domElement.addEventListener("pointerup", pointerEnd);
        renderer.domElement.addEventListener("pointercancel", pointerCancel);

        const keyDown = (event: KeyboardEvent) => {
          if (event.key === "Enter") {
            const action = actionOf(targetFromCamera());
            if (action) { event.preventDefault(); performAction(action); }
          } else if (event.key === "ArrowLeft" || event.key.toLowerCase() === "a") {
            event.preventDefault(); performAction("previous");
          } else if (event.key === "ArrowRight" || event.key.toLowerCase() === "d") {
            event.preventDefault(); performAction("next");
          } else if (event.key === "Escape" && renderer?.xr.getSession()) {
            event.preventDefault(); void renderer.xr.getSession()?.end();
          }
        };
        renderer.domElement.addEventListener("keydown", keyDown);
        renderer.domElement.addEventListener("webglcontextlost", (event) => {
          event.preventDefault();
          setRenderError("The graphics session stopped. Reload the page or use the lesson controls below.");
        });

        for (let index = 0; index < 2; index += 1) {
          const controller = renderer.xr.getController(index);
          const lineGeometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -2.2)]);
          const lineMaterial = new THREE.LineBasicMaterial({ color: "#d8edbd", transparent: true, opacity: 0.78 });
          const line = new THREE.Line(lineGeometry, lineMaterial);
          line.name = "controller pointing ray";
          controller.add(line);
          scene!.add(controller);
          controller.addEventListener("select", () => {
            if (!world) return;
            const matrix = new THREE.Matrix4().identity().extractRotation(controller.matrixWorld);
            raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
            raycaster.ray.direction.set(0, 0, -1).applyMatrix4(matrix);
            const hit = raycaster.intersectObjects(world.interactive, true)[0]?.object ?? null;
            const action = actionOf(hit);
            if (action) performAction(action);
          });
          controllerLines.push({ geometry: lineGeometry, material: lineMaterial });
        }

        const resize = () => {
          if (!renderer) return;
          const nextWidth = Math.max(container.clientWidth, 320);
          const nextHeight = Math.max(container.clientHeight, 360);
          camera.aspect = nextWidth / nextHeight;
          camera.updateProjectionMatrix();
          renderer.setSize(nextWidth, nextHeight);
          renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
        };
        resizeObserver = new ResizeObserver(resize);
        resizeObserver.observe(container);
        renderer.setAnimationLoop(() => {
          controls?.update();
          renderer?.render(scene!, camera);
        });

        const xr = (navigator as Navigator & { xr?: BrowserXRSystem }).xr;
        const supported = await detectImmersiveVrSupport(xr);
        if (!disposed) {
          setVrSupported(supported);
          setLoading(false);
        }
      } catch (error) {
        if (!disposed) {
          setLoading(false);
          setRenderError(error instanceof Error ? error.message : "The 3D classroom could not be drawn on this device.");
          setVrSupported(false);
        }
      }
    }

    void initialize();

    return () => {
      disposed = true;
      resizeObserver?.disconnect();
      if (renderer) {
        const session = renderer.xr.getSession();
        if (session) void session.end().catch(() => undefined);
        renderer.setAnimationLoop(null);
      }
      controls?.dispose();
      world?.dispose();
      controllerLines.forEach(({ geometry, material }) => { geometry.dispose(); material.dispose(); });
      renderer?.dispose();
      renderer?.domElement.remove();
      rendererRef.current = null;
      worldRef.current = null;
    };
  }, []);

  useEffect(() => {
    worldRef.current?.updatePresentation(props);
  }, [props.courseTitle, props.subject, props.lessonTitle, props.lessonContent, props.lessonNumber, props.lessonCount, props.canGoPrevious, props.canGoNext, props.completed, props.canComplete]);

  async function enterVr() {
    const renderer = rendererRef.current;
    const xr = (navigator as Navigator & { xr?: BrowserXRSystem }).xr;
    if (!renderer || !xr || !vrSupported) return;
    setVrError("");
    try {
      const session = await xr.requestSession("immersive-vr", { optionalFeatures: ["local-floor"] });
      await renderer.xr.setSession(session as Parameters<typeof renderer.xr.setSession>[0]);
      session.addEventListener("end", () => setInVr(false), { once: true });
      setInVr(true);
    } catch (error) {
      setVrError(vrSessionError(error));
    }
  }

  async function exitVr() {
    try {
      await rendererRef.current?.xr.getSession()?.end();
      setInVr(false);
    } catch {
      setVrError("The headset could not close the VR session. Use the headset’s system exit control.");
    }
  }

  return (
    <section className="classroom-scene-card" aria-label="Interactive classroom scene">
      <div className="classroom-scene-topline">
        <div><span className={`classroom-status-dot ${inVr ? "is-live" : ""}`} />{inVr ? "Headset session active" : "Interactive 3D classroom"}</div>
        {vrSupported === true ? <button className={`classroom-xr-button ${inVr ? "is-exit" : ""}`} onClick={inVr ? exitVr : enterVr} disabled={loading || Boolean(renderError)}>{loading ? "Preparing…" : inVr ? "Exit VR" : "Enter VR ↗"}</button> : <span className="classroom-xr-unavailable">VR unavailable here · desktop mode is ready</span>}
      </div>
      <div className="classroom-scene-host" ref={hostRef}>
        {loading && <div className="classroom-scene-overlay"><span className="loader" />Building your classroom…</div>}
        {renderError && <div className="classroom-scene-overlay classroom-scene-error" role="status"><b>3D scene unavailable</b><span>{renderError}</span><small>Your lesson and controls below still work.</small></div>}
      </div>
      <div className="classroom-scene-footer">
        <p aria-live="polite">{vrError || sceneMessage || (vrSupported === false ? "WebXR isn’t supported by this browser or device. Use the 3D scene with mouse, touch, or keyboard instead." : "")}</p>
        <span>Focus the scene: Enter selects, arrows/A/D change lessons · Mouse/touch: drag to look and select · Tab/Enter: lesson controls · VR: point and squeeze trigger</span>
      </div>
    </section>
  );
}
