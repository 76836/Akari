import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';

const params = new URLSearchParams(window.location.search);
const modelUrl = params.get('modelUrl');
const debug = params.get('debug') === 'true';

const PARAMS = {
  performance: {
    antialias: true,
    pixelRatio: Math.min(window.devicePixelRatio, 2)
  }
};

let renderer, scene, camera, clock, vrm;
let lookAtTarget = new THREE.Object3D();
let currentEmote = 'neutral';
let isHibernating = false;
let hibernateFrozen = false;

// Teleport system
const TELEPORT = {
  group: null,
  bars: null,
  flash: null,
  intensity: 0,
  phase: 'idle',
  t: 0,
  buildDuration: 0.55,
  holdDuration: 0.12,
  drainDuration: 0.65
};

function init() {
  const container = document.getElementById('container');
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(30, window.innerWidth / window.innerHeight, 0.1, 20);
  camera.position.set(0, 1.4, 3.5);
  renderer = new THREE.WebGLRenderer({ antialias: PARAMS.performance.antialias, alpha: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(PARAMS.performance.pixelRatio);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);
  scene.add(new THREE.AmbientLight(0xffffff, 0.8));
  const dirLight = new THREE.DirectionalLight(0xffffff, 0.6);
  dirLight.position.set(1, 2, 1);
  scene.add(dirLight);
  clock = new THREE.Clock();
  lookAtTarget.position.set(0, 1.4, 0);
  scene.add(lookAtTarget);
  window.addEventListener('resize', onWindowResize);
  setupTeleport();
  setupInputHandlers();
  animate();
  if (modelUrl) loadVRM(modelUrl);
  else showDropZone();
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function setupTeleport() {
  TELEPORT.group = new THREE.Group();
  scene.add(TELEPORT.group);
  const barGeo = new THREE.BoxGeometry(0.07, 1.8, 0.07);
  const mat = new THREE.MeshBasicMaterial({ color: 0xffff00, transparent: true, opacity: 0.9, depthTest: false, depthWrite: false, toneMapped: false });
  TELEPORT.bars = new THREE.InstancedMesh(barGeo, mat, 28);
  TELEPORT.bars.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  TELEPORT.group.add(TELEPORT.bars);
  const flashGeo = new THREE.PlaneGeometry(5, 5);
  const flashMat = new THREE.ShaderMaterial({
    transparent: true, depthTest: false, depthWrite: false, toneMapped: false,
    uniforms: { uFlash: { val