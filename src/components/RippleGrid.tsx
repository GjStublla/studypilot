import { useEffect, useEffectEvent, useRef } from 'react';
import { Mesh, Program, Renderer, Triangle } from 'ogl';
import './RippleGrid.css';

type RippleGridProps = {
  enableRainbow?: boolean;
  fadeDistance?: number;
  glowIntensity?: number;
  gridColor?: string;
  gridRotation?: number;
  gridSize?: number;
  gridThickness?: number;
  mouseInteraction?: boolean;
  mouseInteractionRadius?: number;
  opacity?: number;
  rippleIntensity?: number;
  vignetteStrength?: number;
};

type RippleUniforms = {
  enableRainbow: { value: boolean };
  fadeDistance: { value: number };
  glowIntensity: { value: number };
  gridColor: { value: [number, number, number] };
  gridRotation: { value: number };
  gridSize: { value: number };
  gridThickness: { value: number };
  iResolution: { value: [number, number] };
  iTime: { value: number };
  mouseInfluence: { value: number };
  mouseInteraction: { value: boolean };
  mouseInteractionRadius: { value: number };
  mousePosition: { value: [number, number] };
  opacity: { value: number };
  rippleIntensity: { value: number };
  vignetteStrength: { value: number };
};

const vertexShader = `
attribute vec2 position;
varying vec2 vUv;

void main() {
  vUv = position * 0.5 + 0.5;
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

const fragmentShader = `
precision highp float;
uniform float iTime;
uniform vec2 iResolution;
uniform bool enableRainbow;
uniform vec3 gridColor;
uniform float rippleIntensity;
uniform float gridSize;
uniform float gridThickness;
uniform float fadeDistance;
uniform float vignetteStrength;
uniform float glowIntensity;
uniform float opacity;
uniform float gridRotation;
uniform bool mouseInteraction;
uniform vec2 mousePosition;
uniform float mouseInfluence;
uniform float mouseInteractionRadius;
varying vec2 vUv;

float pi = 3.141592;

mat2 rotate(float angle) {
  float s = sin(angle);
  float c = cos(angle);
  return mat2(c, -s, s, c);
}

void main() {
  vec2 uv = vUv * 2.0 - 1.0;
  uv.x *= iResolution.x / iResolution.y;

  if (gridRotation != 0.0) {
    uv = rotate(gridRotation * pi / 180.0) * uv;
  }

  float dist = length(uv);
  float func = sin(pi * (iTime - dist));
  vec2 rippleUv = uv + uv * func * rippleIntensity;

  if (mouseInteraction && mouseInfluence > 0.0) {
    vec2 mouseUv = mousePosition * 2.0 - 1.0;
    mouseUv.x *= iResolution.x / iResolution.y;
    float mouseDist = length(uv - mouseUv);
    float influence = mouseInfluence * exp(-mouseDist * mouseDist / (mouseInteractionRadius * mouseInteractionRadius));
    float mouseWave = sin(pi * (iTime * 2.0 - mouseDist * 3.0)) * influence;
    rippleUv += normalize(uv - mouseUv) * mouseWave * rippleIntensity * 0.3;
  }

  vec2 a = sin(gridSize * 0.5 * pi * rippleUv - pi / 2.0);
  vec2 b = abs(a);

  float aaWidth = 0.5;
  vec2 smoothB = vec2(
    smoothstep(0.0, aaWidth, b.x),
    smoothstep(0.0, aaWidth, b.y)
  );

  vec3 color = vec3(0.0);
  color += exp(-gridThickness * smoothB.x * (0.8 + 0.5 * sin(pi * iTime)));
  color += exp(-gridThickness * smoothB.y);
  color += 0.5 * exp(-(gridThickness / 4.0) * sin(smoothB.x));
  color += 0.5 * exp(-(gridThickness / 3.0) * smoothB.y);

  if (glowIntensity > 0.0) {
    color += glowIntensity * exp(-gridThickness * 0.5 * smoothB.x);
    color += glowIntensity * exp(-gridThickness * 0.5 * smoothB.y);
  }

  float distanceFade = exp(-2.0 * clamp(pow(dist, fadeDistance), 0.0, 1.0));
  vec2 vignetteCoords = vUv - 0.5;
  float vignetteDistance = length(vignetteCoords);
  float vignette = 1.0 - pow(vignetteDistance * 2.0, vignetteStrength);
  vignette = clamp(vignette, 0.0, 1.0);

  vec3 tint;
  if (enableRainbow) {
    tint = vec3(
      uv.x * 0.5 + 0.5 * sin(iTime),
      uv.y * 0.5 + 0.5 * cos(iTime),
      pow(cos(iTime), 4.0)
    ) + 0.5;
  } else {
    tint = gridColor;
  }

  float finalFade = distanceFade * vignette;
  float alpha = length(color) * finalFade * opacity;
  gl_FragColor = vec4(color * tint * finalFade * opacity, alpha);
}
`;

function hexToRgb(hex: string): [number, number, number] {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);

  if (!result) {
    return [1, 1, 1];
  }

  return [parseInt(result[1], 16) / 255, parseInt(result[2], 16) / 255, parseInt(result[3], 16) / 255];
}

export default function RippleGrid({
  enableRainbow = false,
  fadeDistance = 1.5,
  glowIntensity = 0.1,
  gridColor = '#ffffff',
  gridRotation = 0,
  gridSize = 10,
  gridThickness = 15,
  mouseInteraction = true,
  mouseInteractionRadius = 1,
  opacity = 1,
  rippleIntensity = 0.05,
  vignetteStrength = 2,
}: RippleGridProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const uniformsRef = useRef<RippleUniforms | null>(null);
  const mouseInteractionRef = useRef(mouseInteraction);

  useEffect(() => {
    mouseInteractionRef.current = mouseInteraction;
  }, [mouseInteraction]);

  const initializeWebGL = useEffectEvent(() => {
    const container = containerRef.current;

    if (!container) {
      return;
    }

    const renderer = new Renderer({
      alpha: true,
      dpr: Math.min(window.devicePixelRatio, 2),
    });
    const gl = renderer.gl;
    const mousePosition = { x: 0.5, y: 0.5 };
    const targetMouse = { x: 0.5, y: 0.5 };
    let mouseInfluence = 0;
    let frameId: number | null = null;
    let isVisible = true;
    let isPageVisible = document.visibilityState === 'visible';
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    let prefersReducedMotion = motionQuery.matches;

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.canvas.style.width = '100%';
    gl.canvas.style.height = '100%';
    container.appendChild(gl.canvas);

    const uniforms: RippleUniforms = {
      iTime: { value: 0 },
      iResolution: { value: [1, 1] },
      enableRainbow: { value: enableRainbow },
      gridColor: { value: hexToRgb(gridColor) },
      rippleIntensity: { value: rippleIntensity },
      gridSize: { value: gridSize },
      gridThickness: { value: gridThickness },
      fadeDistance: { value: fadeDistance },
      vignetteStrength: { value: vignetteStrength },
      glowIntensity: { value: glowIntensity },
      opacity: { value: opacity },
      gridRotation: { value: gridRotation },
      mouseInteraction: { value: mouseInteraction },
      mousePosition: { value: [0.5, 0.5] },
      mouseInfluence: { value: 0 },
      mouseInteractionRadius: { value: mouseInteractionRadius },
    };
    uniformsRef.current = uniforms;

    const geometry = new Triangle(gl);
    const program = new Program(gl, { vertex: vertexShader, fragment: fragmentShader, uniforms });
    const mesh = new Mesh(gl, { geometry, program });

    const resize = () => {
      const { clientWidth, clientHeight } = container;
      renderer.setSize(clientWidth, clientHeight);
      uniforms.iResolution.value = [clientWidth, clientHeight];
    };

    const updateMousePosition = (event: PointerEvent) => {
      if (!mouseInteractionRef.current) {
        return;
      }

      const rect = container.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width;
      const y = 1 - (event.clientY - rect.top) / rect.height;

      targetMouse.x = Math.min(Math.max(x, 0), 1);
      targetMouse.y = Math.min(Math.max(y, 0), 1);
      mouseInfluence = 1;
    };

    const fadeMouse = () => {
      mouseInfluence = 0;
    };

    const shouldAnimate = () => isVisible && isPageVisible && !prefersReducedMotion;

    const render = (time: number) => {
      frameId = null;

      if (!shouldAnimate()) {
        return;
      }

      uniforms.iTime.value = time * 0.001;
      mousePosition.x += (targetMouse.x - mousePosition.x) * 0.1;
      mousePosition.y += (targetMouse.y - mousePosition.y) * 0.1;
      uniforms.mouseInfluence.value += (mouseInfluence - uniforms.mouseInfluence.value) * 0.05;
      uniforms.mousePosition.value = [mousePosition.x, mousePosition.y];
      renderer.render({ scene: mesh });
      frameId = requestAnimationFrame(render);
    };

    const stopAnimation = () => {
      if (frameId !== null) {
        cancelAnimationFrame(frameId);
        frameId = null;
      }
    };

    const syncAnimation = () => {
      if (shouldAnimate()) {
        if (frameId === null) {
          frameId = requestAnimationFrame(render);
        }
      } else {
        stopAnimation();

        if (isVisible && isPageVisible) {
          renderer.render({ scene: mesh });
        }
      }
    };

    const observer = new IntersectionObserver(([entry]) => {
      isVisible = entry?.isIntersecting ?? true;
      syncAnimation();
    });

    const handleVisibilityChange = () => {
      isPageVisible = document.visibilityState === 'visible';
      syncAnimation();
    };

    const handleMotionPreferenceChange = (event: MediaQueryListEvent) => {
      prefersReducedMotion = event.matches;
      syncAnimation();
    };

    resize();
    observer.observe(container);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('resize', resize);
    window.addEventListener('pointermove', updateMousePosition, { passive: true });
    window.addEventListener('pointerleave', fadeMouse);
    motionQuery.addEventListener('change', handleMotionPreferenceChange);
    syncAnimation();

    return () => {
      stopAnimation();
      observer.disconnect();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', updateMousePosition);
      window.removeEventListener('pointerleave', fadeMouse);
      motionQuery.removeEventListener('change', handleMotionPreferenceChange);
      uniformsRef.current = null;
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      gl.canvas.remove();
    };
  });

  useEffect(() => initializeWebGL(), []);

  useEffect(() => {
    const uniforms = uniformsRef.current;

    if (!uniforms) {
      return;
    }

    uniforms.enableRainbow.value = enableRainbow;
    uniforms.gridColor.value = hexToRgb(gridColor);
    uniforms.rippleIntensity.value = rippleIntensity;
    uniforms.gridSize.value = gridSize;
    uniforms.gridThickness.value = gridThickness;
    uniforms.fadeDistance.value = fadeDistance;
    uniforms.vignetteStrength.value = vignetteStrength;
    uniforms.glowIntensity.value = glowIntensity;
    uniforms.opacity.value = opacity;
    uniforms.gridRotation.value = gridRotation;
    uniforms.mouseInteraction.value = mouseInteraction;
    uniforms.mouseInteractionRadius.value = mouseInteractionRadius;
  }, [
    enableRainbow,
    fadeDistance,
    glowIntensity,
    gridColor,
    gridRotation,
    gridSize,
    gridThickness,
    mouseInteraction,
    mouseInteractionRadius,
    opacity,
    rippleIntensity,
    vignetteStrength,
  ]);

  return <div ref={containerRef} className="ripple-grid-container" />;
}
