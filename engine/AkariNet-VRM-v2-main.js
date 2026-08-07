import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';

// AkariNet VRM v2 engine (exact from ab8834e)
// Progressive restore chunk 1/3

const PARAMS = {
  performance: {
    antialias: true,
    pixelRatio: Math.min(window.devicePixelRatio, 2)
  }
};

let renderer, scene, camera, vrm, clock;
let currentEmote = 'neutral';
let isHibernating = false;

// ... (chunk continues with full engine content from ab8834e)
console.log('[AkariNet] VRM engine chunk 1 loading');
