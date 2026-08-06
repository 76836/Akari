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
    eyePos: new THREE.Vector2(0, 1.45),
    currentEyeMultiplier: 0.3, currentEyeSpeed: 2.0, currentIdleSpeed: 0.1,
    currentEmotionName: 'neutral', blinkBlocked: false, requestedBlink: 0, isVrm1: false,
    lipMouth: 0, emoAa: 0, emoIh: 0,
    speakMicroX: 0, speakMicroY: 0, nextSpeakMicro: 0
};

const TELEPORT = {
    MAX_FRONT: 28, MAX_BACK: 8,
    buildDuration: 1.1, buildSpawnStart: 0.18, buildSpawnEnd: 0.028,
    buildCountStart: 2, buildCountEnd: 6, buildSpeedStart: 5.0, buildSpeedEnd: 14.0,
    holdDuration: 0.55, drainDuration: 1.35, drainDenseTime: 0.22,
    drainSpawnStart: 0.04, drainSpawnEnd: 0.40, drainCountStart: 5, drainCountEnd: 1, drainSpeed: 12.0,
    backSpeed: 3.2, backSpawnChance: 0.35, backHeightScale: 0.7
};
const TELEPORT_MAX = TELEPORT.MAX_FRONT + TELEPORT.MAX_BACK;

const teleport = {
    active: false, phase: 0, t: 0, intensity: 0, flash: 0, spawnAcc: 0,
    meshFront: null, meshBack: null, flashMesh: null,
    dummy: new THREE.Object3D(), data: null, free: [],
    vrmHidden: true, vrmReady: false,
    direction: 'in', hibernating: false, pendingWakeEmote: null
};

function initTeleport(parentScene) {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const matFront = new THREE.MeshBasicMaterial({ color: 0xffff00, transparent: true, opacity: 0.92, depthTest: false, depthWrite: false, toneMapped: false });
    const meshFront = new THREE.InstancedMesh(geo, matFront, TELEPORT.MAX_FRONT);
    meshFront.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    meshFront.frustumCulled = false; meshFront.renderOrder = 999; meshFront.count = 0;
    parentScene.add(meshFront); teleport.meshFront = meshFront;

    const matBack = new THREE.MeshBasicMaterial({ color: 0xffff00, transparent: true, opacity: 0.75, depthTest: true, depthWrite: false, toneMapped: false });
    const meshBack = new THREE.InstancedMesh(geo, matBack, TELEPORT.MAX_BACK);
    meshBack.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    meshBack.frustumCulled = false; meshBack.renderOrder = 1; meshBack.count = 0;
    parentScene.add(meshBack); teleport.meshBack = meshBack;

    teleport.data = new Array(TELEPORT_MAX);
    teleport.free = [];
    for (let i = 0; i < TELEPORT_MAX; i++) {
        teleport.data[i] = { alive: false, x: 0, y: 0, h: 1, speed: 1, life: 0, maxLife: 1, behind: false };
        teleport.free.push(i);
    }

    const flashMat = new THREE.ShaderMaterial({
        transparent: true, depthTest: false, depthWrite: false, toneMapped: false,
        uniforms: { uFlash: { value: 0 }, uVeil: { value: 0 }, uColor: { value: new THREE.Color(0xffff00) } },
        vertexShader: 'void main(){gl_Position=vec4(position.xy,0.0,1.0);}',
        fragmentShader: 'uniform float uFlash;uniform float uVeil;uniform vec3 uColor;void main(){float a=max(uFlash,uVeil*0.2);gl_FragColor=vec4(uColor,a);}'
    });
    const flashMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), flashMat);
    flashMesh.frustumCulled = false; flashMesh.renderOrder = 1000; flashMesh.visible = false;
    parentScene.add(flashMesh); teleport.flashMesh = flashMesh;
}

function spawnPill(speedMul, forceBehind) {
    if (teleport.free.length === 0) return;
    const i = teleport.free.pop();
    const d = teleport.data[i];
    d.alive = true;
    d.x = (Math.random() * 2 - 1) * 1.2;
    d.y = -1.3;
    const behind = forceBehind === true || (forceBehind !== false && Math.random() < TELEPORT.backSpawnChance * 0.15);
    d.behind = behind;
    d.h = (0.15 + Math.random() * 0.95) * (behind ? TELEPORT.backHeightScale : 1);
    const spd = behind ? TELEPORT.backSpeed * (0.7 + Math.random() * 0.5) : speedMul;
    const duration = (1.4 + Math.random() * 0.6) / Math.max(0.8, spd);
    d.maxLife = duration; d.life = 0;
    d.speed = (behind ? 1.6 : 2.8) / duration;
}

function clearAllPills() {
    for (let i = 0; i < TELEPORT_MAX; i++) {
        if (teleport.data[i].alive) { teleport.data[i].alive = false; teleport.free.push(i); }
    }
    if (teleport.meshFront) teleport.meshFront.count = 0;
    if (teleport.meshBack) teleport.meshBack.count = 0;
}

function startTeleportPart1() {
    teleport.active = true; teleport.direction = 'in'; teleport.phase = 1; teleport.t = 0;
    teleport.intensity = 0; teleport.flash = 0; teleport.spawnAcc = 0;
    teleport.vrmHidden = true; teleport.vrmReady = false; clearAllPills();
    if (teleport.flashMesh) {
        teleport.flashMesh.visible = true;
        teleport.flashMesh.material.uniforms.uFlash.value = 0;
        teleport.flashMesh.material.uniforms.uVeil.value = 0;
    }
    if (currentVrm) currentVrm.scene.visible = false;
    const ui = document.getElementById('ui'); const dbg = document.getElementById('debug');
    if (ui) ui.classList.remove('revealed');
    if (dbg) dbg.classList.remove('revealed');
}

function startTeleportPart2() {
    if (teleport.direction === 'out') return;
    teleport.vrmReady = true;
    if (teleport.phase === 1) {
        teleport.intensity = Math.max(teleport.intensity, 0.85);
        teleport.flash = Math.max(teleport.flash, 0.7);
    }
    if (teleport.phase <= 1) { teleport.phase = 2; teleport.t = 0; teleport.spawnAcc = 0; }
    if (currentVrm) { currentVrm.scene.visible = true; teleport.vrmHidden = false; }
}
window.startPart2 = startTeleportPart2;

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

    if (teleport.phase === 1) {
        const p = Math.min(1, teleport.t / TELEPORT.buildDuration);
        const pe = p * p;
        teleport.intensity = pe;
        teleport.flash = Math.max(0, (pe - 0.55) / 0.45);
        const interval = lerp(TELEPORT.buildSpawnStart, TELEPORT.buildSpawnEnd, pe);
        const countMax = Math.round(lerp(TELEPORT.buildCountStart, TELEPORT.buildCountEnd, pe));
        const speedMul = lerp(TELEPORT.buildSpeedStart, TELEPORT.buildSpeedEnd, pe);
        teleport.spawnAcc += dt;
        while (teleport.spawnAcc >= interval) {
            teleport.spawnAcc -= interval;
            const n = TELEPORT.buildCountStart + Math.floor(Math.random() * (countMax - TELEPORT.buildCountStart + 1));
            for (let k = 0; k < n; k++) spawnPill(speedMul, false);
        }
        if (p >= 1 && teleport.vrmReady) {
            teleport.phase = 2; teleport.t = 0; teleport.spawnAcc = 0;
            if (currentVrm) { currentVrm.scene.visible = true; teleport.vrmHidden = false; }
        } else if (p >= 1 && !teleport.vrmReady) {
            teleport.t = TELEPORT.buildDuration; teleport.flash = 1; teleport.intensity = 1;
        }
    } else if (teleport.phase === 2) {
        teleport.flash = 1; teleport.intensity = 1;
        teleport.spawnAcc += dt;
        while (teleport.spawnAcc >= 0.045) {
            teleport.spawnAcc -= 0.045;
            spawnPill(TELEPORT.buildSpeedEnd, false);
        }
        if (teleport.t >= TELEPORT.holdDuration) {
            teleport.phase = 3; teleport.t = 0; teleport.spawnAcc = 0;
            teleport.flash = 0; teleport.intensity = 1;
            if (teleport.flashMesh) {
                teleport.flashMesh.material.uniforms.uFlash.value = 0;
                teleport.flashMesh.material.uniforms.uVeil.value = 0;
                teleport.flashMesh.visible = false;
            }
            if (teleport.direction === 'out') freezeHibernate();
            else {
                revealUI();
                for (let k = 0; k < 4; k++) spawnPill(TELEPORT.backSpeed, true);
            }
        }
    } else if (teleport.phase === 3) {
        teleport.flash = 0;
        const p = Math.min(1, teleport.t / TELEPORT.drainDuration);
        teleport.spawnAcc += dt;
        if (p < 0.85) {
            const dense = p < (TELEPORT.drainDenseTime / TELEPORT.drainDuration);
            const interval = dense ? TELEPORT.drainSpawnStart : lerp(TELEPORT.drainSpawnStart, TELEPORT.drainSpawnEnd, (p - 0.15) / 0.7);
            const count = dense ? TELEPORT.drainCountStart : Math.max(1, Math.round(lerp(TELEPORT.drainCountStart, TELEPORT.drainCountEnd, p)));
            while (teleport.spawnAcc >= interval) {
                teleport.spawnAcc -= interval;
                for (let k = 0; k < count; k++) {
                    const behind = !dense && Math.random() < TELEPORT.backSpawnChance;
                    spawnPill(behind ? TELEPORT.backSpeed : TELEPORT.drainSpeed, behind);
                }
            }
        }
        teleport.intensity = 1 - Math.max(0, (p - 0.2) / 0.8);
        if (p >= 1) {
            teleport.phase = 4; teleport.active = false; clearAllPills();
            if (teleport.direction === 'out') freezeHibernate();
        }
    }

    const dummy = teleport.dummy;
    let liveF = 0, liveB = 0;
    for (let i = 0; i < TELEPORT_MAX; i++) {
        const d = teleport.data[i];
        if (!d.alive) continue;
        d.life += dt; d.y += d.speed * dt;
        if (d.life >= d.maxLife || d.y > 1.45) { d.alive = false; teleport.free.push(i); continue; }
        const halfW = d.behind ? halfWBack : halfWFront;
        const halfH = d.behind ? halfHBack : halfHFront;
        const z = d.behind ? backZ : frontZ;
        const worldH = d.h * halfH * 2;
        const worldW = (d.behind ? 0.022 : 0.03) * halfW * 2;
        dummy.position.set(d.x * halfW, cam.position.y + d.y * halfH + worldH * 0.5, z);
        dummy.scale.set(worldW, worldH, 0.02);
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        if (d.behind) {
            if (liveB < TELEPORT.MAX_BACK) { teleport.meshBack.setMatrixAt(liveB, dummy.matrix); liveB++; }
        } else if (liveF < TELEPORT.MAX_FRONT) {
            teleport.meshFront.setMatrixAt(liveF, dummy.matrix); liveF++;
        }
    }
    teleport.meshFront.count = liveF; teleport.meshBack.count = liveB;
    if (liveF > 0) teleport.meshFront.instanceMatrix.needsUpdate = true;
    if (liveB > 0) teleport.meshBack.instanceMatrix.needsUpdate = true;
    teleport.meshFront.material.opacity = 0.72 + teleport.intensity * 0.26;
    teleport.meshBack.material.opacity = 0.55 + teleport.intensity * 0.2;
    if (teleport.flashMesh && teleport.flashMesh.visible) {
        teleport.flashMesh.material.uniforms.uFlash.value = teleport.flash;
        teleport.flashMesh.material.uniforms.uVeil.value = teleport.intensity;
    }
}

const loader = new GLTFLoader();
loader.register((parser) => new VRMLoaderPlugin(parser));

function init() {
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(30, window.innerWidth / window.innerHeight, 0.1, 20);
    camera.position.set(0, 1.4, 3.5);
    renderer = new THREE.WebGLRenderer({ antialias: PARAMS.performance.antialias, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(PARAMS.performance.pixelRatio);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    document.getElementById('container').appendChild(renderer.domElement);
    scene.add(new THREE.AmbientLight(0xffffff, 0.8));
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
    dirLight.position.set(1, 2, 3);
    scene.add(dirLight);
    initTeleport(scene);
    startTeleportPart1();
    window.addEventListener('resize', onResize);
    window.addEventListener('mousemove', onMouseMove, { passive: true });
    setupFileHandling();
    if (CONFIG.modelUrl) loadVRM(CONFIG.modelUrl);
    requestAnimationFrame(animate);
}

function loadVRM(url) {
    document.getElementById('loading').style.display = 'block';
    document.getElementById('dropZone').classList.add('hidden');
    document.getElementById('dropZone').classList.remove('shown');
    loader.load(url, (gltf) => {
        const vrm = gltf.userData.vrm;
        if (currentVrm) { scene.remove(currentVrm.scene); VRMUtils.deepDispose(currentVrm.scene); }
        currentVrm = vrm;
        vrm.scene.visible = false;
        scene.add(vrm.scene);
        const metaVersion = vrm.meta.metaVersion;
        vrm.scene.rotation.y = (metaVersion === '0' || metaVersion === undefined) ? Math.PI : 0;
        state.isVrm1 = String(metaVersion).startsWith('1');
        requestAnimationFrame(() => { requestAnimationFrame(() => window.startPart2()); });
        if (vrm.lookAt) vrm.lookAt.autoUpdate = false;
        applyPhysicsSettings(vrm);
        relaxArms(vrm, state.isVrm1);
        document.getElementById('loading').style.display = 'none';
        if (!CONFIG.debug) {
            ['loading', 'ui', 'debug'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.style.display = 'none';
            });
        }
    }, undefined, (error) => {
        console.error(error);
        document.getElementById('loading').innerText = 'LOAD ERROR';
        document.getElementById('dropZone').classList.remove('hidden');
        document.getElementById('dropZone').classList.add('shown');
    });
}

function relaxArms(vrm, isVrm1) {
    const lA = vrm.humanoid.getNormalizedBoneNode('leftUpperArm');
    const rA = vrm.humanoid.getNormalizedBoneNode('rightUpperArm');
    let angle = PARAMS.sway.armRelaxation;
    if (isVrm1) angle = -angle;
    if (lA) lA.rotation.z = angle;
    if (rA) rA.rotation.z = -angle;
}

function applyPhysicsSettings(vrm) {
    if (!vrm.springBoneManager) return;
    vrm.springBoneManager.springBones.forEach(spring => {
        if (spring.stiffnessForce) spring.stiffnessForce *= PARAMS.hair.stiffness;
        if (spring.dragForce) spring.dragForce *= PARAMS.hair.drag;
        if (spring.gravityDir) spring.gravityPower = PARAMS.hair.gravityPower;
    });
}

function updateEmotions(dt) {
    if (!currentVrm || !currentVrm.expressionManager) return;
    const key = (localStorage.getItem('v2emote') || 'neutral').toLowerCase().trim();
    if (key === 'hibernate') {
        if (!teleport.hibernating && !(teleport.active && teleport.direction === 'out')) {
            state.currentEmotionName = 'hibernate';
            startTeleportOut();
        }
        return;
    }
    if (teleport.hibernating || (teleport.active && teleport.direction === 'out')) {
        if (teleport.hibernating) { state.currentEmotionName = key; wakeFromHibernate(); }
        else teleport.pendingWakeEmote = key;
        return;
    }
    if (state.currentEmotionName !== key) {
        state.currentEmotionName = key;
        const dbg = document.getElementById('debug');
        if (dbg) dbg.innerText = 'STATUS: ' + key.toUpperCase();
    }
    const targetMap = EMOTIONS[key] || EMOTIONS.neutral;
    state.emoAa = targetMap.aa || 0;
    state.emoIh = targetMap.ih || 0;
    const targetBlink = targetMap.blink || targetMap.happy || 0;
    state.blinkBlocked = targetBlink > 0.01;
    state.requestedBlink = 0;
    const speaking = state.lipMouth > 0.04;
    const trackableMorphs = ['neutral','aa','ih','ou','ee','oh','joy','angry','sorrow','fun','sad','happy','relaxed','surprised','confused','blinkLeft','blinkRight','lookUp','lookDown','lookLeft','lookRight'];
    trackableMorphs.forEach(morphName => {
        if (speaking && (morphName === 'aa' || morphName === 'ih')) return;
        if (speaking && (morphName === 'ou' || morphName === 'ee' || morphName === 'oh')) {
            const cur = currentVrm.expressionManager.getValue(morphName) || 0;
            currentVrm.expressionManager.setValue(morphName, THREE.MathUtils.lerp(cur, 0, 6 * dt));
            return;
        }
        const targetValue = targetMap[morphName] || 0;
        const currentValue = currentVrm.expressionManager.getValue(morphName) || 0;
        currentVrm.expressionManager.setValue(morphName, THREE.MathUtils.lerp(currentValue, targetValue, 5.0 * dt));
    });
}

function updateLipsync(dt) {
    if (!currentVrm || !currentVrm.expressionManager) return;
    let target = 0;
    try {
        const raw = localStorage.getItem('akari:lipsync');
        if (raw) {
            const data = JSON.parse(raw);
            if (data && typeof data.mouth === 'number' && Date.now() - (data.t || 0) < 500) {
                target = Math.max(0, Math.min(1, data.mouth));
            }
        }
    } catch (e) {}
    state.lipMouth = THREE.MathUtils.lerp(state.lipMouth, target, Math.min(1, 14 * dt));
    const m = state.lipMouth;
    const em = currentVrm.expressionManager;
    if (m < 0.03) return;
    const W = 0.90;
    em.setValue('ih', THREE.MathUtils.lerp(em.getValue('ih') || 0, state.emoIh * (1 - W) + Math.min(0.7, m * 0.95) * W, Math.min(1, 16 * dt)));
    em.setValue('aa', THREE.MathUtils.lerp(em.getValue('aa') || 0, state.emoAa * (1 - W) + Math.min(0.38, m * 0.95) * W, Math.min(1, 16 * dt)));
}

function animate(now) {
    requestAnimationFrame(animate);
    let dt = (now - lastFrameTime) / 1000;
    lastFrameTime = now;
    const safeDt = Math.min(dt, 0.05);
    totalElapsed += safeDt;
    updateTeleport(safeDt);
    if (!teleport.active && teleport.hibernating && teleport.pendingWakeEmote) {
        const wakeEmo = teleport.pendingWakeEmote;
        teleport.pendingWakeEmote = null;
        try { localStorage.setItem('v2emote', wakeEmo); } catch (e) {}
        state.currentEmotionName = wakeEmo;
        wakeFromHibernate();
    }
    if (teleport.hibernating && !teleport.active) {
        renderer.render(scene, camera);
        return;
    }
    if (currentVrm) {
        updateEmotions(safeDt);
        updateLipsync(safeDt);
        const speaking = state.lipMouth > 0.04;
        const timeSinceMouse = (now - lastMouseMoveTime) / 1000;
        let tx, ty, currentSpeed = PARAMS.motion.lookSpeed;
        if (speaking && PARAMS.speak.holdUser) {
            if (totalElapsed > state.nextSpeakMicro) {
                state.speakMicroX = (Math.random() - 0.5) * 2 * PARAMS.speak.microRangeX;
                state.speakMicroY = (Math.random() - 0.5) * 2 * PARAMS.speak.microRangeY;
                state.nextSpeakMicro = totalElapsed + PARAMS.speak.microHold * (0.7 + Math.random() * 0.6);
            }
            tx = state.speakMicroX; ty = 1.45 + state.speakMicroY;
            currentSpeed = PARAMS.speak.lookSpeed;
            state.currentEyeMultiplier = PARAMS.speak.eyeMultiplier;
            state.currentEyeSpeed = PARAMS.speak.eyeSpeed;
        } else if (timeSinceMouse < PARAMS.motion.idleTimeout) {
            tx = mouse.x;
            ty = 1.45 + (mouse.y * (state.isVrm1 ? 0.5 : -0.5));
        } else {
            if (totalElapsed > state.nextIdleSwitch) {
                state.idleTargetX = (Math.random() - 0.5) * 2 * PARAMS.idle.rangeX;
                state.idleTargetY = 1.45 + (Math.random() - 0.5) * 2 * PARAMS.idle.rangeY;
                state.nextIdleSwitch = totalElapsed + PARAMS.idle.minHold + Math.random() * (PARAMS.idle.maxHold - PARAMS.idle.minHold);
                const [minSpd, maxSpd] = PARAMS.idle.transitionSpeed;
                state.currentIdleSpeed = minSpd + Math.random() * (maxSpd - minSpd);
                state.currentEyeMultiplier = PARAMS.eye.minIntensity + Math.random() * (PARAMS.eye.maxIntensity - PARAMS.eye.minIntensity);
                state.currentEyeSpeed = PARAMS.eye.minSpeed + Math.random() * (PARAMS.eye.maxSpeed - PARAMS.eye.minSpeed);
            }
            tx = state.idleTargetX; ty = state.idleTargetY; currentSpeed = state.currentIdleSpeed;
        }
        tx = THREE.MathUtils.clamp(tx, -1, 1);
        ty = THREE.MathUtils.clamp(ty, 0.5, 2.5);
        const eyeAlpha = 1 - Math.pow(0.0001, safeDt * state.currentEyeSpeed);
        state.eyePos.x = THREE.MathUtils.lerp(state.eyePos.x, tx, eyeAlpha);
        state.eyePos.y = THREE.MathUtils.lerp(state.eyePos.y, ty, eyeAlpha);
        const finalEyeX = THREE.MathUtils.clamp(state.eyePos.x * state.currentEyeMultiplier, -PARAMS.eye.limit, PARAMS.eye.limit);
        const finalEyeY = THREE.MathUtils.clamp(-(state.eyePos.y - 1.45) * state.currentEyeMultiplier, -PARAMS.eye.limit, PARAMS.eye.limit);
        if (currentVrm.expressionManager) {
            currentVrm.expressionManager.setValue('lookLeft', finalEyeX > 0 ? finalEyeX : 0);
            currentVrm.expressionManager.setValue('lookRight', finalEyeX < 0 ? Math.abs(finalEyeX) : 0);
            currentVrm.expressionManager.setValue('lookUp', finalEyeY > 0 ? finalEyeY : 0);
            currentVrm.expressionManager.setValue('lookDown', finalEyeY < 0 ? Math.abs(finalEyeY) : 0);
        }
        const leftEye = currentVrm.humanoid.getNormalizedBoneNode('leftEye');
        const rightEye = currentVrm.humanoid.getNormalizedBoneNode('rightEye');
        if (leftEye && rightEye) {
            leftEye.rotation.y = finalEyeX; leftEye.rotation.x = finalEyeY;
            rightEye.rotation.y = finalEyeX; rightEye.rotation.x = finalEyeY;
        }
        const lerpAlpha = 1 - Math.pow(0.001, safeDt * currentSpeed);
        state.lookAtPos.x = THREE.MathUtils.lerp(state.lookAtPos.x, tx, lerpAlpha);
        state.lookAtPos.y = THREE.MathUtils.lerp(state.lookAtPos.y, ty, lerpAlpha);
        const spine = currentVrm.humanoid.getNormalizedBoneNode('spine');
        const neck = currentVrm.humanoid.getNormalizedBoneNode('neck');
        const swayVal = Math.sin(totalElapsed * PARAMS.sway.baseFrequency) * PARAMS.sway.intensity;
        if (spine) {
            spine.rotation.z = swayVal;
            const sY = THREE.MathUtils.clamp(state.lookAtPos.x * 0.15, -PARAMS.motion.maxSpineY, PARAMS.motion.maxSpineY);
            spine.rotation.y = THREE.MathUtils.lerp(spine.rotation.y, sY, lerpAlpha * 0.5);
        }
        if (neck) {
            const nY = THREE.MathUtils.clamp(state.lookAtPos.x * 0.45, -PARAMS.motion.maxNeckY, PARAMS.motion.maxNeckY);
            const nX = THREE.MathUtils.clamp(-(state.lookAtPos.y - 1.45) * 0.45, -PARAMS.motion.maxNeckX, PARAMS.motion.maxNeckX);
            neck.rotation.y = THREE.MathUtils.lerp(neck.rotation.y, nY, lerpAlpha);
            neck.rotation.x = THREE.MathUtils.lerp(neck.rotation.x, nX, lerpAlpha);
        }
        if (currentVrm.expressionManager) {
            const blinkCycle = totalElapsed % 4.0;
            const bVal = blinkCycle < 0.15 ? Math.sin((blinkCycle / 0.15) * Math.PI) : 0;
            const curB = currentVrm.expressionManager.getValue('blink') || 0;
            if (!state.blinkBlocked) {
                currentVrm.expressionManager.setValue('blink', Math.max(bVal, THREE.MathUtils.lerp(curB, 0, 2.5 * safeDt)));
            } else {
                currentVrm.expressionManager.setValue('blink', THREE.MathUtils.lerp(curB, state.requestedBlink || 0, 5 * safeDt));
            }
        }
        currentVrm.update(Math.min(safeDt, PARAMS.hair.physicsDeltaLimit));
    }
    renderer.render(scene, camera);
}

function onMouseMove(e) {
    mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    lastMouseMoveTime = performance.now();
}
function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}
function setupFileHandling() {
    const dz = document.getElementById('dropZone');
    document.getElementById('fileInput').addEventListener('change', (e) => {
        const f = e.target.files[0]; if (f) loadVRM(URL.createObjectURL(f));
    });
    window.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('active'); });
    window.addEventListener('dragleave', () => dz.classList.remove('active'));
    window.addEventListener('drop', (e) => {
        e.preventDefault(); dz.classList.remove('active');
        const f = e.dataTransfer.files[0];
        if (f && f.name.toLowerCase().endsWith('.vrm')) loadVRM(URL.createObjectURL(f));
    });
}

init();
