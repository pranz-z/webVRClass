import type * as THREE from "three";
import type { RoundedBoxGeometry as RoundedBox } from "three/addons/geometries/RoundedBoxGeometry.js";

export type ClassroomAction = "board" | "desk" | "globe" | "previous" | "next" | "complete" | "exit";

export type ClassroomPresentation = {
  courseTitle: string;
  subject: string;
  lessonTitle: string;
  lessonContent: string;
  lessonNumber: number;
  lessonCount: number;
  canGoPrevious: boolean;
  canGoNext: boolean;
  completed: boolean;
  canComplete: boolean;
};

type GeometryModule = typeof import("three");
type RoundedBoxConstructor = typeof RoundedBox;

export type ClassroomWorld = {
  scene: THREE.Scene;
  interactive: THREE.Object3D[];
  updatePresentation: (presentation: ClassroomPresentation) => void;
  dispose: () => void;
};

function makeCanvasTexture(THREE: GeometryModule, width: number, height: number, paint: (context: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas text rendering is unavailable.");
  paint(context);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function wrapText(context: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number, maxLines: number) {
  const words = text.split(/\s+/).filter(Boolean);
  let line = "";
  let lines = 0;
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (context.measureText(candidate).width > maxWidth && line) {
      context.fillText(line, x, y + lines * lineHeight);
      line = word;
      lines += 1;
      if (lines >= maxLines) break;
    } else line = candidate;
  }
  if (line && lines < maxLines) context.fillText(line, x, y + lines * lineHeight);
}

function presentationPaint(context: CanvasRenderingContext2D, presentation: ClassroomPresentation) {
  context.fillStyle = "#193a3a";
  context.fillRect(0, 0, 1024, 512);
  context.fillStyle = "#a8d7c2";
  context.font = "600 19px Arial, sans-serif";
  context.fillText(`${presentation.subject.toUpperCase()}  /  ${presentation.courseTitle.toUpperCase()}`, 68, 66);
  context.fillStyle = "#f6f1df";
  context.font = "600 43px Arial, sans-serif";
  wrapText(context, presentation.lessonTitle || "A welcoming place to learn", 68, 142, 880, 54, 2);
  context.fillStyle = "#d5e4d6";
  context.font = "24px Arial, sans-serif";
  const lessonCopy = presentation.lessonContent || "Your teacher can add the first lesson from the course workspace.";
  wrapText(context, lessonCopy.replace(/\s+/g, " "), 68, 267, 880, 38, 5);
  context.fillStyle = "#88b4a0";
  context.font = "600 18px Arial, sans-serif";
  context.fillText(presentation.lessonCount ? `LESSON ${presentation.lessonNumber} OF ${presentation.lessonCount}` : "COURSE PREVIEW", 68, 463);
  context.textAlign = "right";
  context.fillStyle = presentation.completed ? "#b5e4a8" : "#f4c27b";
  context.fillText(presentation.completed ? "✓  LESSON COMPLETE" : "✳  LEARN AT YOUR OWN PACE", 954, 463);
  context.textAlign = "left";
}

function buttonPaint(context: CanvasRenderingContext2D, title: string, color: string) {
  context.fillStyle = color;
  context.fillRect(0, 0, 320, 100);
  context.fillStyle = "#fff9e9";
  context.font = "700 34px Arial, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(title, 160, 50);
  context.textAlign = "left";
  context.textBaseline = "alphabetic";
}

export function buildClassroomWorld(
  THREE: GeometryModule,
  RoundedBoxGeometry: RoundedBoxConstructor,
  initialPresentation: ClassroomPresentation,
): ClassroomWorld {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#d9e4d9");
  scene.fog = new THREE.Fog("#d9e4d9", 15, 28);
  const interactive: THREE.Object3D[] = [];
  const boardCanvas = document.createElement("canvas");
  boardCanvas.width = 1024;
  boardCanvas.height = 512;
  const boardContext = boardCanvas.getContext("2d");
  if (!boardContext) throw new Error("Canvas text rendering is unavailable.");
  presentationPaint(boardContext, initialPresentation);
  const boardTexture = new THREE.CanvasTexture(boardCanvas);
  boardTexture.colorSpace = THREE.SRGBColorSpace;
  boardTexture.anisotropy = 4;

  const mat = (color: THREE.ColorRepresentation, roughness = 0.74, metalness = 0) =>
    new THREE.MeshStandardMaterial({ color, roughness, metalness });
  const materials = {
    wall: mat("#eee9da"),
    wallTrim: mat("#d4c9b0"),
    floor: mat("#b9855e"),
    floorLight: mat("#c7966c"),
    wood: mat("#9d6746"),
    woodLight: mat("#d7ad7b"),
    woodEdge: mat("#785344"),
    green: mat("#4e8065"),
    greenDark: mat("#244c43"),
    cream: mat("#f4eddc"),
    clay: mat("#c57759"),
    gold: mat("#e2b66f", 0.46, 0.12),
    metal: mat("#879b95", 0.38, 0.56),
    glass: new THREE.MeshPhysicalMaterial({ color: "#9ccac8", roughness: 0.22, metalness: 0.08, transmission: 0.08 }),
    bookBlue: mat("#526f83"),
    bookRose: mat("#bb705b"),
    bookOchre: mat("#d09b51"),
    pot: mat("#bc765a"),
    leaf: mat("#47785a"),
    leafLight: mat("#86a66a"),
    globe: mat("#547f9b", 0.4),
    globeLand: mat("#bdc58d", 0.68),
  };
  const toDispose: THREE.Texture[] = [boardTexture];

  function roundedBox(name: string, position: [number, number, number], size: [number, number, number], material: THREE.Material, radius = 0.06) {
    const shortest = Math.min(...size);
    const geometry = new RoundedBoxGeometry(...size, 3, Math.min(radius, shortest * 0.22));
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.position.set(...position);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    return mesh;
  }

  function addAction(object: THREE.Object3D, action: ClassroomAction) {
    object.userData.classroomAction = action;
    interactive.push(object);
    return object;
  }

  function cylinder(name: string, position: [number, number, number], top: number, bottom: number, height: number, material: THREE.Material, segments = 16) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(top, bottom, height, segments), material);
    mesh.name = name;
    mesh.position.set(...position);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    return mesh;
  }

  function sphere(name: string, position: [number, number, number], radius: number, material: THREE.Material, scale: [number, number, number] = [1, 1, 1]) {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 18, 14), material);
    mesh.name = name;
    mesh.position.set(...position);
    mesh.scale.set(...scale);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    return mesh;
  }

  function createDesk(x: number, z: number, name: string) {
    const top = addAction(roundedBox(`${name} desk top`, [x, 1.22, z], [1.72, 0.15, 1.06], materials.woodLight, 0.12), "desk");
    roundedBox(`${name} desk apron`, [x, 1.08, z], [1.4, 0.2, 0.78], materials.wood);
    for (const dx of [-0.63, 0.63]) for (const dz of [-0.34, 0.34]) {
      cylinder(`${name} rounded desk leg`, [x + dx, 0.55, z + dz], 0.055, 0.07, 1.05, materials.woodEdge, 10);
    }
    createChair(x, z + 1.02, name);
    return top;
  }

  function createChair(x: number, z: number, name: string) {
    roundedBox(`${name} chair seat`, [x, 0.68, z], [0.78, 0.14, 0.72], materials.green, 0.12);
    roundedBox(`${name} curved chair back`, [x, 1.08, z + 0.28], [0.78, 0.66, 0.14], materials.greenDark, 0.13);
    for (const dx of [-0.27, 0.27]) for (const dz of [-0.23, 0.23]) {
      cylinder(`${name} chair leg`, [x + dx, 0.34, z + dz], 0.035, 0.045, 0.65, materials.metal, 8);
    }
  }

  function createPlant(x: number, z: number) {
    const pot = new THREE.Mesh(new THREE.LatheGeometry([
      new THREE.Vector2(0.16, 0), new THREE.Vector2(0.25, 0.04), new THREE.Vector2(0.31, 0.38), new THREE.Vector2(0.29, 0.43), new THREE.Vector2(0.24, 0.43),
    ], 18), materials.pot);
    pot.name = "terracotta classroom planter";
    pot.position.set(x, 0, z);
    pot.castShadow = true;
    scene.add(pot);
    cylinder("planter soil", [x, 0.38, z], 0.25, 0.25, 0.05, mat("#493f31"));
    for (let index = 0; index < 7; index += 1) {
      const angle = (index / 7) * Math.PI * 2;
      const leaf = sphere("rounded classroom plant leaf", [x + Math.cos(angle) * 0.23, 0.77 + (index % 3) * 0.12, z + Math.sin(angle) * 0.2], 0.23, index % 2 ? materials.leaf : materials.leafLight, [0.48, 1.6, 0.42]);
      leaf.rotation.z = Math.cos(angle) * 0.5;
      leaf.rotation.x = Math.sin(angle) * 0.35;
    }
  }

  function createGlobe(x: number, y: number, z: number) {
    const globe = new THREE.Group();
    globe.name = "interactive learning globe";
    globe.position.set(x, y, z);
    scene.add(globe);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.18, 0.16, 18), materials.gold);
    base.position.y = -0.39;
    globe.add(base);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.3, 12), materials.metal);
    stem.position.y = -0.21;
    globe.add(stem);
    const sphereMesh = new THREE.Mesh(new THREE.SphereGeometry(0.32, 24, 18), materials.globe);
    sphereMesh.name = "globe surface";
    sphereMesh.castShadow = true;
    globe.add(sphereMesh);
    for (let index = 0; index < 5; index += 1) {
      const land = new THREE.Mesh(new THREE.SphereGeometry(0.33, 12, 8, index * 0.92, 0.65, 0.55, 0.75), materials.globeLand);
      land.scale.set(0.95, 0.82, 1);
      land.rotation.y = index * 1.08;
      globe.add(land);
    }
    return addAction(globe, "globe");
  }

  function makeBoardButton(x: number, y: number, label: string, action: ClassroomAction) {
    const texture = makeCanvasTexture(THREE, 320, 100, (context) => buttonPaint(context, label, action === "complete" ? "#bc7659" : "#3b6b5b"));
    toDispose.push(texture);
    const buttonMaterial = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.58, emissive: "#142b28", emissiveIntensity: 0.12 });
    const button = new THREE.Mesh(new RoundedBoxGeometry(0.88, 0.29, 0.14, 3, 0.055), buttonMaterial);
    button.name = `board ${label.toLowerCase()} control`;
    button.position.set(x, y, -5.28);
    button.castShadow = true;
    button.userData.classroomAction = action;
    scene.add(button);
    interactive.push(button);
    return button;
  }

  // Open-front room, with locally built wood floor and warm plaster walls.
  roundedBox("classroom floor", [0, -0.14, -0.2], [14, 0.28, 12], materials.floor, 0.08);
  for (let index = 0; index < 18; index += 1) {
    const plank = roundedBox("inlaid oak floor plank", [-6.15 + (index % 9) * 1.53, 0.008, -4.65 + Math.floor(index / 9) * 5.8], [1.42, 0.014, 5.65], index % 3 === 0 ? materials.floorLight : materials.floor, 0.018);
    plank.castShadow = false;
  }
  roundedBox("back classroom wall", [0, 2.85, -6.08], [14, 5.7, 0.22], materials.wall, 0.08);
  roundedBox("left side wall", [-7.05, 2.85, -0.2], [0.2, 5.7, 11.8], materials.wall, 0.08);
  roundedBox("right side wall", [7.05, 2.85, -0.2], [0.2, 5.7, 11.8], materials.wall, 0.08);
  roundedBox("back wall wood skirting", [0, 0.24, -5.92], [13.85, 0.34, 0.22], materials.wood, 0.05);
  roundedBox("back wall picture rail", [0, 5.48, -5.89], [13.8, 0.16, 0.22], materials.woodLight, 0.05);

  for (const x of [-5.15, 5.15]) {
    roundedBox("arched window frame", [x, 3.7, -5.91], [1.85, 2.15, 0.18], materials.woodLight, 0.16);
    roundedBox("soft blue glass window", [x, 3.7, -5.79], [1.58, 1.88, 0.05], materials.glass, 0.12);
    roundedBox("window center mullion", [x, 3.7, -5.73], [0.055, 1.84, 0.08], materials.cream, 0.02);
    roundedBox("window cross rail", [x, 3.7, -5.73], [1.54, 0.06, 0.08], materials.cream, 0.02);
  }

  roundedBox("wide rounded chalkboard frame", [0, 3.35, -5.74], [7.45, 2.95, 0.26], materials.wood, 0.16);
  addAction(roundedBox("digital lesson presentation board", [0, 3.35, -5.56], [7.1, 2.62, 0.09], new THREE.MeshStandardMaterial({ map: boardTexture, roughness: 0.8, emissive: "#142321", emissiveIntensity: 0.35 }), 0.09), "board");
  roundedBox("chalkboard lower ledge", [0, 1.82, -5.47], [7.5, 0.14, 0.35], materials.woodLight, 0.05);
  makeBoardButton(-2.1, 1.54, "PREVIOUS", "previous");
  makeBoardButton(-0.72, 1.54, "NEXT", "next");
  makeBoardButton(0.72, 1.54, "MARK DONE", "complete");
  makeBoardButton(2.1, 1.54, "EXIT VR", "exit");

  // Teacher station: shaped desk, book stack, globe, and a small plant.
  roundedBox("teacher desk rounded top", [-4.05, 1.22, 3.35], [3.8, 0.18, 1.3], materials.wood, 0.15);
  roundedBox("teacher desk front panel", [-4.05, 0.83, 3.83], [3.35, 0.62, 0.16], materials.woodLight, 0.1);
  for (const x of [-5.6, -2.5]) roundedBox("teacher desk sculpted pedestal", [x, 0.58, 3.35], [0.54, 1.05, 0.92], materials.woodEdge, 0.12);
  roundedBox("textbook in ochre cloth", [-5, 1.43, 3.15], [0.9, 0.13, 0.62], materials.bookOchre, 0.04);
  roundedBox("textbook in rose cloth", [-4.96, 1.56, 3.13], [0.86, 0.12, 0.58], materials.bookRose, 0.04);
  roundedBox("textbook in blue cloth", [-4.93, 1.68, 3.11], [0.8, 0.11, 0.54], materials.bookBlue, 0.04);
  createGlobe(-3.4, 1.88, 3.12);
  createPlant(-5.8, 3.25);

  createDesk(-2.25, 0.15, "left student");
  createDesk(2.25, 0.15, "right student");
  createDesk(-2.25, -2.0, "left back student");
  createDesk(2.25, -2.0, "right back student");
  createPlant(-5.8, -4.65);

  // Framed learning artwork and low-glare lamps make the room feel finished without heavy postprocessing.
  for (const [x, y, color, title] of [[-4.45, 2.35, materials.clay, "Observe"], [4.45, 2.35, materials.green, "Imagine"]] as const) {
    roundedBox(`${title} art frame`, [x, y, -5.84], [0.86, 0.9, 0.14], materials.woodLight, 0.08);
    roundedBox(`${title} learning print`, [x, y, -5.74], [0.72, 0.76, 0.035], color, 0.04);
    const sun = sphere(`${title} print sun`, [x, y + 0.12, -5.7], 0.17, materials.gold, [1, 0.8, 0.2]);
    sun.castShadow = false;
    roundedBox(`${title} print horizon`, [x, y - 0.19, -5.68], [0.58, 0.13, 0.025], materials.cream, 0.05);
  }

  const ambient = new THREE.HemisphereLight("#fff2d8", "#62756d", 2.15);
  scene.add(ambient);
  const sunlight = new THREE.DirectionalLight("#fff0d2", 2.2);
  sunlight.position.set(-4.5, 8, 5);
  sunlight.castShadow = true;
  sunlight.shadow.mapSize.set(1024, 1024);
  sunlight.shadow.camera.left = -10;
  sunlight.shadow.camera.right = 10;
  sunlight.shadow.camera.top = 10;
  sunlight.shadow.camera.bottom = -10;
  scene.add(sunlight);
  const boardGlow = new THREE.PointLight("#d2ead4", 2.3, 11, 2);
  boardGlow.position.set(0, 4.5, -4.25);
  scene.add(boardGlow);

  function updatePresentation(presentation: ClassroomPresentation) {
    presentationPaint(boardContext!, presentation);
    boardTexture.needsUpdate = true;
    updateActionTint("previous", presentation.canGoPrevious);
    updateActionTint("next", presentation.canGoNext);
    updateActionTint("complete", presentation.canComplete && !presentation.completed);
    updateActionTint("exit", true);
  }

  function updateActionTint(action: ClassroomAction, enabled: boolean) {
    for (const object of interactive) {
      if (object.userData.classroomAction !== action || !(object instanceof THREE.Mesh)) continue;
      const material = object.material as THREE.MeshStandardMaterial;
      if (material.map && action !== "exit") material.color.set(enabled ? "#ffffff" : "#7c8982");
      material.emissive.set(action === "exit" ? "#49302a" : enabled ? "#142b28" : "#29312d");
    }
  }

  updatePresentation(initialPresentation);

  function dispose() {
    const geometries = new Set<THREE.BufferGeometry>();
    const usedMaterials = new Set<THREE.Material>(Object.values(materials));
    scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      geometries.add(object.geometry);
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) usedMaterials.add(material);
    });
    geometries.forEach((geometry) => geometry.dispose());
    usedMaterials.forEach((material) => material.dispose());
    toDispose.forEach((texture) => texture.dispose());
  }

  return { scene, interactive, updatePresentation, dispose };
}
