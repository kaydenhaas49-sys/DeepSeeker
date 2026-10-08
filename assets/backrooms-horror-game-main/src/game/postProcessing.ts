// ============================================================================
// postProcessing.ts — VHS / found-footage post-processing stack.
// Uses a single fullscreen shader pass for performance: film grain,
// chromatic aberration, fisheye distortion, vignette, scanlines, and a
// subtle desaturation/contrast shift for the Backrooms look.
// ============================================================================

import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { POST } from './constants';

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform sampler2D tDiffuse;
  uniform float uTime;
  uniform float uGrain;
  uniform float uChromatic;
  uniform float uFisheye;
  uniform float uVignette;
  uniform float uScanline;
  uniform float uScanlineCount;
  uniform vec2  uResolution;
  varying vec2 vUv;

  float hash(vec2 p) {
    p = fract(p * vec2(443.897, 441.423));
    p += dot(p, p + 19.19);
    return fract(p.x * p.y);
  }

  void main() {
    vec2 uv = vUv;

    // ---- Fisheye distortion ----
    vec2 centered = uv - 0.5;
    float r = length(centered);
    float distort = 1.0 + uFisheye * (r * r);
    vec2 fisheyeUv = centered * distort + 0.5;

    // ---- Chromatic aberration (radial) ----
    float ca = uChromatic * (1.0 + r * 2.0);
    vec4 color;
    color.r = texture2D(tDiffuse, fisheyeUv + vec2(ca, 0.0)).r;
    color.g = texture2D(tDiffuse, fisheyeUv).g;
    color.b = texture2D(tDiffuse, fisheyeUv - vec2(ca, 0.0)).b;
    color.a = 1.0;

    // ---- Scanlines ----
    float scan = sin(uv.y * uScanlineCount) * 0.5 + 0.5;
    color.rgb *= 1.0 - uScanline * scan;

    // ---- Film grain ----
    float grain = hash(uv * uResolution + uTime * 1000.0) - 0.5;
    color.rgb += grain * uGrain;

    // ---- Vignette ----
    float vig = 1.0 - smoothstep(0.3, 0.85, r) * uVignette;
    color.rgb *= vig;

    // ---- Slight desaturation + contrast for found-footage feel ----
    float lum = dot(color.rgb, vec3(0.299, 0.587, 0.114));
    color.rgb = mix(vec3(lum), color.rgb, 0.82);
    color.rgb = (color.rgb - 0.5) * 1.18 + 0.5;

    // ---- Subtle yellow tint ----
    color.rgb *= vec3(1.02, 1.0, 0.92);

    gl_FragColor = color;
  }
`;

export class PostProcessing {
  composer: EffectComposer;
  renderPass: RenderPass;
  vhsPass: ShaderPass;
  private scene: THREE.Scene;
  private camera: THREE.Camera;
  private renderer: THREE.WebGLRenderer;

  constructor(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera
  ) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;

    this.composer = new EffectComposer(renderer);
    this.composer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));

    this.renderPass = new RenderPass(scene, camera);
    this.composer.addPass(this.renderPass);

    this.vhsPass = new ShaderPass({
      uniforms: {
        tDiffuse: { value: null },
        uTime: { value: 0 },
        uGrain: { value: POST.FILM_GRAIN_INTENSITY },
        uChromatic: { value: POST.CHROMATIC_ABERRATION },
        uFisheye: { value: POST.FISHEYE_STRENGTH },
        uVignette: { value: POST.VIGNETTE_DARKNESS },
        uScanline: { value: POST.SCANLINE_INTENSITY },
        uScanlineCount: { value: POST.SCANLINE_COUNT },
        uResolution: { value: new THREE.Vector2(1, 1) },
      },
      vertexShader,
      fragmentShader,
    });
    this.vhsPass.renderToScreen = true;
    this.composer.addPass(this.vhsPass);

    this.resize();
  }

  update(time: number) {
    this.vhsPass.uniforms.uTime.value = time;
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.composer.setSize(w, h);
    this.vhsPass.uniforms.uResolution.value.set(w, h);
  }

  render() {
    this.composer.render();
  }

  dispose() {
    this.composer.dispose();
  }
}
