import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';

const PARAMS = {
    performance: { antialias: true, pixelRatio: Math.min(window.devicePixelRatio, 2) },
    camera: { fov: 30, near: 0.1, far: 20, position: [0, 1.4, 3.5] },
    lights: { ambient: 0.8 },
    teleport: { buildDuration: 0.6, holdDuration: 0.15, drainDuration: 0.7 }
};

let renderer, scene, camera, clock, vrm = null;
let currentVrmUrl = null;
let lookAtTarget = new THREE.Object3D();
let isTalking = false;
let mouthOpen = 0;
let hibernateFrozen = false;

const TELEPORT = {
    group: null,
    bars: null,
    flash: null,
    intensi: 0,
    phase: 'idle',
    t: 0
};

function init() {
    const container = document.getElementById('container');
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(PARAMS.camera.fov, window.innerWidth / window.innerHeight, PARAMS.camera.near, PARAMS.camera.far);
    camera.position.set(...PARAMS.camera.position);
    renderer = new THREE.WebGLRenderer({ antialias: PARAMS.performance.antialias, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(PARAMS.performance.pixelRatio);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);
    scene.add(new THREE.AmbientLight(0xffffff, PARAMS.lights.ambient));
    const dir = new THREE.DirectionalLight(0xffffff, 0.6);
    dir.position.set(1, 2, 1);
    scene.add(dir);
    clock = new THREE.Clock();
    lookAtTarget.position.set(0, 1.4, 0);
    scene.add(lookAtTarget);
    window.addEventListener('resize', onResize);
    setupTeleport();
    setupInput();
    animate();
    const params = new URLSearchParams(location.search);
    if (params.has('modelUrl')) loadVRM(params.get('modelUrl'));
    else showDropZone();
}

function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function setupTeleport() {
    TELEPORT.group = new THREE.Group();
    scene.add(TELEPORT.group);
    const geo = new THREE.BoxGeometry(0.08, 1.6, 0.08);
    const matFront = new THREE.MeshBasicMaterial({ color: 0xffff00, transparent: true, opacity: 0.92, depthTest: false, depthWrite: false, toneMapped: false });
    const matBack = new THREE.MeshBasicMaterial({ color: 0xffff00, transparent: true, opacity: 0.75, depthTest: true, depthWrite: false, toneMapped: false });
    const count = 24;
    TELEPORT.bars = new THREE.InstancedMesh(geo, matFront, count);
    TELEPORT.bars.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    TELEPORT.group.add(TELEPORT.bars);
    const flashGeo = new THREE.PlaneGeometry(4, 4);
    const flashMat = new THREE.ShaderMaterial({
        transparent: true, depthTest: false, depthWrite: false, toneMapped: false,
        uniforms: { uIntensity: { value: 0 } },
        vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
        fragmentShader: 'uniform float uIntensity; varying vec2 vUv; void main(){ float d=length(vUv-0.5); float a=smoothstep(0.5,0.0,d)*uIntensity; gl_FragColor=vec4(1.0,1.0,0.3,a); }'
    });
    TELEPORT.flash = new THREE.Mesh(flashGeo, flashMat);
    TELEPORT.flash.position.z = 0.5;
    TELEPORT.group.add(TELEPORT.flash);
    TELEPORT.group.visible = false;
}

function playTeleport(dir) {
    TELEPORT.phase = dir === 'out' ? 'build' : 'drain';
    TELEPORT.t = 0;
    TELEPORT.group.visible = true;
}

function updateTeleport(dt) {
    if (TELEPORT.phase === 'idle') return;
    TELEPORT.t += dt;
    const p = Math.min(1, TELEPORT.t / TELEPORT.buildDuration);
    const pe = p * p;
    TELEPORT.intensi