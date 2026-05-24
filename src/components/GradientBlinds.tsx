import { useEffect, useRef, type CSSProperties } from 'react';
import { Mesh, Program, Renderer, Triangle } from 'ogl';
import './GradientBlinds.css';

export type GradientBlindsProps = {
  angle?: number;
  blindCount?: number;
  blindMinWidth?: number;
  className?: string;
  color1?: string;
  color2?: string;
  distortAmount?: number;
  dpr?: number;
  gradientColors?: readonly string[];
  mirrorGradient?: boolean;
  mixBlendMode?: CSSProperties['mixBlendMode'];
  mouseDampening?: number;
  noise?: number;
  paused?: boolean;
  shineDirection?: 'left' | 'right';
  spotlightOpacity?: number;
  spotlightRadius?: number;
  spotlightSoftness?: number;
};

type AnimationControls = {
  renderFrame: () => void;
  sync: () => void;
};

type GradientUniforms = {
  iMouse: { value: [number, number] };
  iResolution: { value: [number, number, number] };
  iTime: { value: number };
  uAngle: { value: number };
  uBlindCount: { value: number };
  uColor0: { value: [number, number, number] };
  uColor1: { value: [number, number, number] };
  uColor2: { value: [number, number, number] };
  uColor3: { value: [number, number, number] };
  uColor4: { value: [number, number, number] };
  uColor5: { value: [number, number, number] };
  uColor6: { value: [number, number, number] };
  uColor7: { value: [number, number, number] };
  uColorCount: { value: number };
  uDistort: { value: number };
  uMirror: { value: number };
  uNoise: { value: number };
  uShineFlip: { value: number };
  uSpotlightOpacity: { value: number };
  uSpotlightRadius: { value: number };
  uSpotlightSoftness: { value: number };
};

const MAX_COLORS = 8;
const DEFAULT_COLORS = ['#FF9FFC', '#5227FF'] as const;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function hexToRgb(hex: string): [number, number, number] {
  const trimmed = hex.trim().replace(/^#/, '');
  const expanded =
    trimmed.length === 3
      ? trimmed
          .split('')
          .map((character) => character + character)
          .join('')
      : trimmed;
  const value = expanded.padEnd(6, '0').slice(0, 6);

  if (!/^[\da-f]{6}$/i.test(value)) {
    return [1, 1, 1];
  }

  return [
    parseInt(value.slice(0, 2), 16) / 255,
    parseInt(value.slice(2, 4), 16) / 255,
    parseInt(value.slice(4, 6), 16) / 255,
  ];
}

function resolveColorStops(
  gradientColors?: readonly string[],
  color1?: string,
  color2?: string,
) {
  if (gradientColors?.length) {
    return gradientColors.slice(0, MAX_COLORS);
  }

  const legacyStops = [color1, color2].filter((value): value is string => Boolean(value));

  return legacyStops.length ? legacyStops.slice(0, MAX_COLORS) : [...DEFAULT_COLORS];
}

function prepStops(stops: readonly string[]) {
  const base = stops.slice(0, MAX_COLORS);

  if (base.length === 1) {
    base.push(base[0]);
  }

  while (base.length < MAX_COLORS) {
    base.push(base[base.length - 1]);
  }

  const colors = base.map(hexToRgb) as [
    [number, number, number],
    [number, number, number],
    [number, number, number],
    [number, number, number],
    [number, number, number],
    [number, number, number],
    [number, number, number],
    [number, number, number],
  ];
  const count = Math.max(2, Math.min(MAX_COLORS, stops.length));

  return { colors, count };
}

function getBlindCount(width: number, blindCount: number, blindMinWidth: number) {
  const requestedCount = Math.max(1, blindCount);

  if (blindMinWidth <= 0) {
    return requestedCount;
  }

  return Math.max(1, Math.min(requestedCount, Math.floor(width / blindMinWidth)));
}

const vertexShader = `
attribute vec2 position;
attribute vec2 uv;
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

const fragmentShader = `
#ifdef GL_ES
precision mediump float;
#endif

uniform vec3  iResolution;
uniform vec2  iMouse;
uniform float iTime;

uniform float uAngle;
uniform float uNoise;
uniform float uBlindCount;
uniform float uSpotlightRadius;
uniform float uSpotlightSoftness;
uniform float uSpotlightOpacity;
uniform float uMirror;
uniform float uDistort;
uniform float uShineFlip;
uniform vec3  uColor0;
uniform vec3  uColor1;
uniform vec3  uColor2;
uniform vec3  uColor3;
uniform vec3  uColor4;
uniform vec3  uColor5;
uniform vec3  uColor6;
uniform vec3  uColor7;
uniform int   uColorCount;

varying vec2 vUv;

float rand(vec2 co){
  return fract(sin(dot(co, vec2(12.9898,78.233))) * 43758.5453);
}

vec2 rotate2D(vec2 p, float a){
  float c = cos(a);
  float s = sin(a);
  return mat2(c, -s, s, c) * p;
}

vec3 getGradientColor(float t){
  float tt = clamp(t, 0.0, 1.0);
  int count = uColorCount;
  if (count < 2) count = 2;
  float scaled = tt * float(count - 1);
  float seg = floor(scaled);
  float f = fract(scaled);

  if (seg < 1.0) return mix(uColor0, uColor1, f);
  if (seg < 2.0 && count > 2) return mix(uColor1, uColor2, f);
  if (seg < 3.0 && count > 3) return mix(uColor2, uColor3, f);
  if (seg < 4.0 && count > 4) return mix(uColor3, uColor4, f);
  if (seg < 5.0 && count > 5) return mix(uColor4, uColor5, f);
  if (seg < 6.0 && count > 6) return mix(uColor5, uColor6, f);
  if (seg < 7.0 && count > 7) return mix(uColor6, uColor7, f);
  if (count > 7) return uColor7;
  if (count > 6) return uColor6;
  if (count > 5) return uColor5;
  if (count > 4) return uColor4;
  if (count > 3) return uColor3;
  if (count > 2) return uColor2;
  return uColor1;
}

void mainImage(out vec4 fragColor, in vec2 fragCoord)
{
  vec2 uv0 = fragCoord.xy / iResolution.xy;
  float aspect = iResolution.x / iResolution.y;
  vec2 p = uv0 * 2.0 - 1.0;
  p.x *= aspect;
  vec2 pr = rotate2D(p, uAngle);
  pr.x /= aspect;
  vec2 uv = pr * 0.5 + 0.5;

  vec2 uvMod = uv;
  if (uDistort > 0.0) {
    float a = uvMod.y * 6.0;
    float b = uvMod.x * 6.0;
    float w = 0.01 * uDistort;
    uvMod.x += sin(a) * w;
    uvMod.y += cos(b) * w;
  }

  float t = uvMod.x;
  if (uMirror > 0.5) {
    t = 1.0 - abs(1.0 - 2.0 * fract(t));
  }

  vec3 base = getGradientColor(t);
  vec2 offset = vec2(iMouse.x / iResolution.x, iMouse.y / iResolution.y);
  float d = length(uv0 - offset);
  float r = max(uSpotlightRadius, 1e-4);
  float dn = d / r;
  float spot = (1.0 - 2.0 * pow(dn, uSpotlightSoftness)) * uSpotlightOpacity;
  vec3 cir = vec3(spot);
  float stripe = fract(uvMod.x * max(uBlindCount, 1.0));

  if (uShineFlip > 0.5) stripe = 1.0 - stripe;

  vec3 ran = vec3(stripe);
  vec3 col = cir + base - ran;
  col += (rand(gl_FragCoord.xy + iTime) - 0.5) * uNoise;
  fragColor = vec4(col, 1.0);
}

void main() {
  vec4 color;
  mainImage(color, vUv * iResolution.xy);
  gl_FragColor = color;
}
`;

export default function GradientBlinds({
  angle = 0,
  blindCount = 16,
  blindMinWidth = 60,
  className = '',
  color1,
  color2,
  distortAmount = 0,
  dpr,
  gradientColors,
  mirrorGradient = false,
  mixBlendMode = 'lighten',
  mouseDampening = 0.15,
  noise = 0.3,
  paused = false,
  shineDirection = 'left',
  spotlightOpacity = 1,
  spotlightRadius = 0.5,
  spotlightSoftness = 1,
}: GradientBlindsProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const firstResizeRef = useRef(true);
  const geometryRef = useRef<Triangle | null>(null);
  const lastTimeRef = useRef(0);
  const meshRef = useRef<Mesh<Triangle, Program> | null>(null);
  const blindCountRef = useRef(blindCount);
  const blindMinWidthRef = useRef(blindMinWidth);
  const mouseTargetRef = useRef<[number, number]>([0, 0]);
  const mouseDampeningRef = useRef(mouseDampening);
  const pausedRef = useRef(paused);
  const programRef = useRef<Program | null>(null);
  const rafRef = useRef<number | null>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const animationRef = useRef<AnimationControls | null>(null);
  const uniformsRef = useRef<GradientUniforms | null>(null);
  const colorStopsKey = resolveColorStops(gradientColors, color1, color2).join('|');

  useEffect(() => {
    const container = containerRef.current;

    if (!container) {
      return;
    }

    const renderer = new Renderer({
      alpha: true,
      antialias: false,
      depth: false,
      /* DPR reduced to 0.6 — since this is a completely soft, blurred ambient gradient background, shading fewer pixels saves massive GPU cycles with zero quality degradation */
      dpr: dpr ?? Math.min(window.devicePixelRatio || 1, 0.6),
      powerPreference: 'high-performance',
      stencil: false,
    });
    const gl = renderer.gl;
    const canvas = gl.canvas;
    const { colors, count } = prepStops(colorStopsKey.split('|'));

    rendererRef.current = renderer;
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    container.appendChild(canvas);

    const uniforms: GradientUniforms = {
      iResolution: { value: [gl.drawingBufferWidth, gl.drawingBufferHeight, 1] },
      iMouse: { value: [0, 0] },
      iTime: { value: 0 },
      uAngle: { value: (angle * Math.PI) / 180 },
      uNoise: { value: noise },
      uBlindCount: { value: Math.max(1, blindCount) },
      uSpotlightRadius: { value: spotlightRadius },
      uSpotlightSoftness: { value: spotlightSoftness },
      uSpotlightOpacity: { value: spotlightOpacity },
      uMirror: { value: mirrorGradient ? 1 : 0 },
      uDistort: { value: distortAmount },
      uShineFlip: { value: shineDirection === 'right' ? 1 : 0 },
      uColor0: { value: colors[0] },
      uColor1: { value: colors[1] },
      uColor2: { value: colors[2] },
      uColor3: { value: colors[3] },
      uColor4: { value: colors[4] },
      uColor5: { value: colors[5] },
      uColor6: { value: colors[6] },
      uColor7: { value: colors[7] },
      uColorCount: { value: count },
    };
    uniformsRef.current = uniforms;

    const program = new Program(gl, { vertex: vertexShader, fragment: fragmentShader, uniforms });
    const geometry = new Triangle(gl);
    const mesh = new Mesh(gl, { geometry, program });

    programRef.current = program;
    geometryRef.current = geometry;
    meshRef.current = mesh;

    let isIntersecting = true;
    let isPageVisible = document.visibilityState === 'visible';
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    let prefersReducedMotion = motionQuery.matches;
    let isScrolling = false;
    let scrollTimeout: number | undefined;

    const shouldAnimate = () =>
      isIntersecting && isPageVisible && !prefersReducedMotion && !pausedRef.current && !isScrolling;

    const renderFrame = (time = performance.now()) => {
      uniforms.iTime.value = time * 0.001;

      if (mouseDampeningRef.current > 0) {
        if (!lastTimeRef.current) {
          lastTimeRef.current = time;
        }

        const delta = (time - lastTimeRef.current) / 1000;
        const factor = Math.min(
          1,
          1 - Math.exp(-delta / Math.max(0.0001, mouseDampeningRef.current)),
        );
        const target = mouseTargetRef.current;
        const current = uniforms.iMouse.value;

        lastTimeRef.current = time;
        current[0] += (target[0] - current[0]) * factor;
        current[1] += (target[1] - current[1]) * factor;
      } else {
        lastTimeRef.current = time;
      }

      renderer.render({ scene: mesh });
    };

    const stopAnimation = () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };

    const TARGET_FPS = 30;
    const frameInterval = 1000 / TARGET_FPS;
    let lastRenderTime = 0;

    const loop = (time: number) => {
      rafRef.current = null;

      if (!shouldAnimate()) {
        return;
      }

      if (time - lastRenderTime < frameInterval) {
        rafRef.current = requestAnimationFrame(loop);
        return;
      }
      lastRenderTime = time;

      renderFrame(time);
      rafRef.current = requestAnimationFrame(loop);
    };

    const syncAnimation = () => {
      if (shouldAnimate()) {
        if (rafRef.current === null) {
          rafRef.current = requestAnimationFrame(loop);
        }
      } else {
        stopAnimation();

        if (isIntersecting && isPageVisible) {
          renderFrame();
        }
      }
    };

    animationRef.current = {
      renderFrame: () => {
        if (isIntersecting && isPageVisible) {
          renderFrame();
        }
      },
      sync: syncAnimation,
    };

    const resize = () => {
      const rect = container.getBoundingClientRect();
      const width = Math.max(1, rect.width);
      const height = Math.max(1, rect.height);

      renderer.setSize(width, height);
      uniforms.iResolution.value = [gl.drawingBufferWidth, gl.drawingBufferHeight, 1];
      uniforms.uBlindCount.value = getBlindCount(
        width,
        blindCountRef.current,
        blindMinWidthRef.current,
      );

      if (firstResizeRef.current) {
        firstResizeRef.current = false;
        const center: [number, number] = [gl.drawingBufferWidth / 2, gl.drawingBufferHeight / 2];
        uniforms.iMouse.value = center;
        mouseTargetRef.current = center;
      }

      animationRef.current?.renderFrame();
    };

    const onPointerMove = (event: PointerEvent) => {
      const rect = container.getBoundingClientRect();

      if (rect.width <= 0 || rect.height <= 0) {
        return;
      }

      const localX = clamp(event.clientX - rect.left, 0, rect.width);
      const localY = clamp(event.clientY - rect.top, 0, rect.height);
      const x = localX * (gl.drawingBufferWidth / rect.width);
      const y = (rect.height - localY) * (gl.drawingBufferHeight / rect.height);

      mouseTargetRef.current = [x, y];

      if (mouseDampeningRef.current <= 0) {
        uniforms.iMouse.value = [x, y];
      }

      if (!shouldAnimate() && isIntersecting && isPageVisible) {
        renderFrame();
      }
    };

    const onVisibilityChange = () => {
      isPageVisible = document.visibilityState === 'visible';
      syncAnimation();
    };

    const onMotionPreferenceChange = (event: MediaQueryListEvent) => {
      prefersReducedMotion = event.matches;
      syncAnimation();
    };

    const onScroll = () => {
      if (!isScrolling) {
        isScrolling = true;
        syncAnimation();
      }
      if (scrollTimeout) {
        clearTimeout(scrollTimeout);
      }
      scrollTimeout = window.setTimeout(() => {
        isScrolling = false;
        syncAnimation();
      }, 100);
    };

    resize();
    const resizeObserver = new ResizeObserver(resize);
    const intersectionObserver = new IntersectionObserver(([entry]) => {
      isIntersecting = entry?.isIntersecting ?? true;
      syncAnimation();
    });

    resizeObserver.observe(container);
    intersectionObserver.observe(container);
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('scroll', onScroll, { passive: true });
    motionQuery.addEventListener('change', onMotionPreferenceChange);
    syncAnimation();

    return () => {
      stopAnimation();
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('scroll', onScroll);
      if (scrollTimeout) {
        clearTimeout(scrollTimeout);
      }
      motionQuery.removeEventListener('change', onMotionPreferenceChange);
      intersectionObserver.disconnect();
      resizeObserver.disconnect();

      if (canvas.parentElement === container) {
        container.removeChild(canvas);
      }

      programRef.current?.remove();
      geometryRef.current?.remove();
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      animationRef.current = null;
      uniformsRef.current = null;
      meshRef.current = null;
      rendererRef.current = null;
      programRef.current = null;
      geometryRef.current = null;
      firstResizeRef.current = true;
      lastTimeRef.current = 0;
    };
  }, [dpr]);

  useEffect(() => {
    pausedRef.current = paused;
    animationRef.current?.sync();
  }, [paused]);

  useEffect(() => {
    blindCountRef.current = blindCount;
    blindMinWidthRef.current = blindMinWidth;
  }, [blindCount, blindMinWidth]);

  useEffect(() => {
    mouseDampeningRef.current = Math.max(0, mouseDampening);
  }, [mouseDampening]);

  useEffect(() => {
    const uniforms = uniformsRef.current;
    const container = containerRef.current;

    if (!uniforms) {
      return;
    }

    const { colors, count } = prepStops(colorStopsKey.split('|'));
    uniforms.uAngle.value = (angle * Math.PI) / 180;
    uniforms.uNoise.value = noise;
    uniforms.uSpotlightRadius.value = spotlightRadius;
    uniforms.uSpotlightSoftness.value = spotlightSoftness;
    uniforms.uSpotlightOpacity.value = spotlightOpacity;
    uniforms.uMirror.value = mirrorGradient ? 1 : 0;
    uniforms.uDistort.value = distortAmount;
    uniforms.uShineFlip.value = shineDirection === 'right' ? 1 : 0;
    uniforms.uColor0.value = colors[0];
    uniforms.uColor1.value = colors[1];
    uniforms.uColor2.value = colors[2];
    uniforms.uColor3.value = colors[3];
    uniforms.uColor4.value = colors[4];
    uniforms.uColor5.value = colors[5];
    uniforms.uColor6.value = colors[6];
    uniforms.uColor7.value = colors[7];
    uniforms.uColorCount.value = count;

    if (container) {
      uniforms.uBlindCount.value = getBlindCount(
        Math.max(1, container.getBoundingClientRect().width),
        blindCount,
        blindMinWidth,
      );
    } else {
      uniforms.uBlindCount.value = Math.max(1, blindCount);
    }

    animationRef.current?.renderFrame();
  }, [
    angle,
    blindCount,
    blindMinWidth,
    colorStopsKey,
    distortAmount,
    mirrorGradient,
    noise,
    shineDirection,
    spotlightOpacity,
    spotlightRadius,
    spotlightSoftness,
  ]);

  return (
    <div
      ref={containerRef}
      className={`gradient-blinds-container ${className}`.trim()}
      style={mixBlendMode ? { mixBlendMode } : undefined}
    />
  );
}
