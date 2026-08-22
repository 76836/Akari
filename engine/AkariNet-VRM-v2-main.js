import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';

const params = new URLSearchParams(window.location.search);
const CONFIG = { modelUrl: '', debug: true };
if (params.has('modelUrl')) CONFIG.modelUrl = params.get('modelUrl');
if (params.has('debug')) {
    const val = params.get('debug').toLowerCase();
    CONFIG.debug = (val === 'true' || val === '1');
}

const PARAMS = {
    performance: { pixelRatio: window.devicePixelRatio || 0.5, antialias: true },
    motion: { lookSpeed: 1.2, idleTimeout: 1.5, maxNeckY: 0.8, maxNeckX: 0.4, maxSpineY: 0.25 },
    eye: { minIntensity: 0.125, maxIntensity: 0.248, minSpeed: 0.1, maxSpeed: 2.0, limit: 0.5 },
    idle: { rangeX: 0.6, rangeY: 0.35, minHold: 2.0, maxHold: 5.0, transitionSpeed: [0.1, 0.8] },
    speak: { holdUser: true, microRangeX: 0.08, microRangeY: 0.05, eyeMultiplier: 0.1, eyeSpeed: 0.9, lookSpeed: 1.6, microHold: 1.4 },
    sway: { intensity: 0.032, baseFrequency: 0.4, armRelaxation: 1.375 },
    hair: { gravityPower: 0.01, stiffness: 0.25, drag: 2.5, physicsDeltaLimit: 0.05 }
};

const EMOTIONS = {
    neutral: { neutral: 1.0 },
    happy: { ih: 0.8, aa: 0.2, relaxed: 0.2, blink: 0.0 },
    sad: { sad: 0.8, lookDown: 0.2, blink: 0.0 },
    angry: { angry: 1.0, lookDown: 0.1, blink: 0.0 },
    fear: { surprised: 0.5, sad: 0.5, happy: 0, blink: 0.0 },
    surprise: { surprised: 1.0, blink: 0.0 },
    confused: { angry: 0.2, sad: 0.3, neutral: 0.5, blink: 0.0 },
    love: { happy: 0.3, ou: 0.4, sad: 0.1 },
    disgust: { angry: 0.6, sad: 0.2, happy: 0, blink: 0.0 },
    trust: { neutral: 1.0, angry: 0.2, aa: 0.1, ou: 0.6 },
    anticipation: { surprised: 0.3, ee: 0.0, ih: 0.5, happy: 0.1, blink: 0.0 },
    contempt: { happy: 0.0, angry: 0.7, relaxed: 0.3, blink: 0.0 },
    bored: { neutral: 0.6, sad: 0.3, lookDown: 0.6, relaxed: 0.1 },
    pride: { ee: 0.3, relaxed: 0.7, neutral: 0.1 },
    shame: { angry: 0.2, sad: 0.6, lookDown: 0.8, blink: 0.2 },
    curious: { surprised: 0.3, neutral: 0.4, ih: 0.3, blink: 0.0 },
    embarrassed: { surprised: 0.3, sad: 0.2, relaxed: 0.7, lookDown: 0.7, happy: 0.1, blink: 0.0 }
};

let scene, camera, renderer, currentVrm;
const mouse = new THREE.Vector2();
let lastMouseMoveTime = 0, lastFrameTime = 0, totalElapsed = 0;

const state = {
    idleTargetX: 0, idleTargetY: 1.45, nextIdleSwitch: 0,
    lookAtPos: new THREE.Vector3(0, 1.45, 1),
    eyePos: new THREE.Vector2(0, 0),
    currentIdleSpeed: 0.5, currentEyeMultiplier: 0.2, currentEyeSpeed: 1.0,
    currentEmotionName: 'neutral', emoAa: 0, emoIh: 0,
    lipMouth: 0, blinkBlocked: false, requestedBlink: 0,
    speakMicroX: 0, speakMicroY: 0, nextSpeakMicro: 0, isVrm1: false
};

const TELEPORT = {
    MAX_FRONT: 48, MAX_BACK: 12,
    buildDuration: 0.55, holdDuration: 0.35, drainDuration: 0.9,
    buildSpawnStart: 0.08, buildSpawnEnd: 0.012,
    buildCountStart: 1, buildCountEnd: 4,
    buildSpeedStart: 0.6, buildSpeedEnd: 1.4,
    drainSpawnStart: 0.02, drainSpawnEnd: 0.12,
    drainCountStart: 3, drainCountEnd: 0,
    drainSpeedStart: 1.2, drainSpeedEnd: 0.5,
    drainDenseTime: 0.25,
    backSpawnChance: 0.35, backHeightScale: 0.7, backSpeed: 0.55
};
const TELEPORT_MAX = TELEPORT.MAX_FRONT + TELEPORT.MAX_BACK;
const teleport = {
    active: false, phase: 0, t: 0, intensity: 0, flash: 0,
    spawnAcc: 0, vrmHidden: true, vrmReady: false,
    meshFront: null, meshBack: null, flashMesh: null,
    data: null, free: null,
    direction: 'in', hibernating: false, pendingWakeEmote: null
};

function initTeleport(parentScene) {
    const geo = new THREE.PlaneGeometry(0.08, 1);
    const matFront = new THREE.ShaderMaterial({
        transparent: true, depthTest: true, depthWrite: false,
        uniforms: { uColor: { value: new THREE.Color(0xffee55) }, uOpacity: { value: 1 } },
        vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.0); }`,
        fragmentShader: `uniform vec3 uColor; uniform float uOpacity; varying vec2 vUv; void main(){ float a=smoothstep(0.0,0.15,vUv.y)*smoothstep(1.0,0.85,vUv.y)*uOpacity; gl_FragColor=vec4(uColor,a); }`
    });
    const meshFront = new THREE.InstancedMesh(geo, matFront, TELEPORT.MAX_FRONT);
    meshFront.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    meshFront.count = 0;
    meshFront.frustumCulled = false;
    parentScene.add(meshFront);
    teleport.meshFront = meshFront;
    const matBack = matFront.clone();
    matBack.uniforms = { uColor: { value: new THREE.Color(0xffee55) }, uOpacity: { value: 0.55 } };
    matBack.depthTest = true;
    const meshBack = new THREE.InstancedMesh(geo, matBack, TELEPORT.MAX_BACK);
    meshBack.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    meshBack.count = 0;
    meshBack.frustumCulled = false;
    meshBack.renderOrder = -1;
    parentScene.add(meshBack);
    teleport.meshBack = meshBack;
    teleport.data = new Array(TELEPORT_MAX);
    teleport.free = [];
    for (let i = 0; i < TELEPORT_MAX; i++) {
        teleport.data[i] = { alive: false, x: 0, y: 0, z: 0, h: 1, speed: 1, life: 0, maxLife: 1, behind: false };
        teleport.free.push(i);
    }
    const flashGeo = new THREE.PlaneGeometry(20, 20);
    const flashMat = new THREE.ShaderMaterial({
        transparent: true, depthTest: false, depthWrite: false,
        uniforms: { uFlash: { value: 0 }, uVeil: { value: 0 } },
        vertexShader: `void main(){ gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
        fragmentShader: `uniform float uFlash; uniform float uVeil; void main(){ float a=max(uFlash*0.85,uVeil*0.92); gl_FragColor=vec4(1.0,0.95,0.3,a); }`
    });
    const flashMesh = new THREE.Mesh(flashGeo, flashMat);
    flashMesh.position.z = -0.5;
    flashMesh.visible = false;
    flashMesh.renderOrder = 10;
    parentScene.add(flashMesh);
    teleport.flashMesh = flashMesh;
}
function spawnPill(speedMul, forceBehind) {
    if (teleport.free.length === 0) return;
    const i = teleport.free.pop();
    const d = teleport.data[i];
    d.alive = true;
    const behind = forceBehind === true || (forceBehind !== false && Math.random() < TELEPORT.backSpawnChance * 0.15);
    d.behind = behind;
    d.h = (0.15 + Math.random() * 0.95) * (behind ? TELEPORT.backHeightScale : 1);
    const spd = behind ? TELEPORT.backSpeed * (0.7 + Math.random() * 0.5) : speedMul;
    d.speed = spd * (0.7 + Math.random() * 0.6);
    d.life = 0;
    d.maxLife = 0.4 + Math.random() * 0.5;
    d.x = (Math.random() - 0.5) * 2.4;
    d.y = -1.2 - Math.random() * 0.4;
    d.z = behind ? -0.35 : 0;
}
function clearAllPills() {
    for (let i = 0; i < TELEPORT_MAX; i++) {
        const d = teleport.data[i];
        if (d.alive) { d.alive = false; teleport.free.push(i); }
    }
    if (teleport.meshFront) teleport.meshFront.count = 0;
    if (teleport.meshBack) teleport.meshBack.count = 0;
}
function startTeleportPart1() {
    teleport.active = true; teleport.direction = 'in'; teleport.phase = 1; teleport.t = 0;
    teleport.intensity = 0; teleport.flash = 0; teleport.spawnAcc = 0;
    teleport.vrmHidden = true; teleport.vrmReady = false;
    clearAllPills();
    if (teleport.flashMesh) {
        teleport.flashMesh.visible = true;
        teleport.flashMesh.material.uniforms.uFlash.value = 0;
        teleport.flashMesh.material.uniforms.uVeil.value = 0;
    }
    if (currentVrm) currentVrm.scene.visible = false;
}
function startTeleportPart2() {
    if (teleport.direction === 'out') return;
    teleport.vrmReady = true;
    if (teleport.phase === 1) {
        teleport.intensity = Math.max(teleport.intensity, 0.85);
        teleport.flash = Math.max(teleport.flash, 0.7);
    }
    if (teleport.phase <= 1) {
        teleport.phase = 2; teleport.t = 0; teleport.spawnAcc = 0;
    }
}
function startTeleportOut() {
    if (teleport.hibernating || (teleport.active && teleport.direction === 'out')) return;
    teleport.direction = 'out'; teleport.active = true; teleport.phase = 1; teleport.t = 0;
    teleport.intensity = 0; teleport.flash = 0; teleport.spawnAcc = 0; teleport.vrmReady = true;
    clearAllPills();
    if (teleport.flashMesh) {
        teleport.flashMesh.visible = true;
        teleport.flashMesh.material.uniforms.uFlash.value = 0;
        teleport.flashMesh.material.uniforms.uVeil.value = 0;
    }
    if (currentVrm) currentVrm.scene.visible = true;
    teleport.vrmHidden = false;
}
function freezeHibernate() {
    teleport.hibernating = true; teleport.vrmHidden = true;
    if (currentVrm) currentVrm.scene.visible = false;
    const dbg = document.getElementById('debug');
    if (dbg) dbg.innerText = 'STATUS: HIBERNATE';
}
function wakeFromHibernate() {
    if (!teleport.hibernating) return;
    if (teleport.active && teleport.direction === 'in') return;
    teleport.hibernating = false;
    startTeleportPart1();
    setTimeout(() => { startTeleportPart2(); }, 250);
}
function revealUI() {
    const ui = document.getElementById('ui'); const dbg = document.getElementById('debug');
    if (ui) ui.classList.add('revealed');
    if (dbg) dbg.classList.add('revealed');
    if (currentVrm) currentVrm.scene.visible = true;
    teleport.vrmHidden = false;
    if (!currentVrm && !CONFIG.modelUrl) {
        const dz = document.getElementById('dropZone');
        if (dz) dz.classList.add('shown');
    }
}
function lerp(a, b, t) { return a + (b - a) * t; }
function updateTeleport(dt) {
    if (!teleport.active || !teleport.meshFront) return;
    const cam = camera;
    const frontZ = cam.position.z - 0.75, backZ = -0.35;
    const halfHFront = Math.tan(THREE.MathUtils.degToRad(cam.fov * 0.5)) * (cam.position.z - frontZ);
    const halfWFront = halfHFront * cam.aspect;
    const halfHBack = Math.tan(THREE.MathUtils.degToRad(cam.fov * 0.5)) * (cam.position.z - backZ);
    const halfWBack = halfHBack * cam.aspect;
    teleport.t += dt;
    if (teleport.phase === 1) 