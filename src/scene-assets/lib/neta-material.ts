import { Color, DoubleSide, FrontSide, MeshStandardMaterial, Vector3 } from '@iwsdk/core';

/**
 * The neta material: a standard material whose colour is worked out per
 * pixel from the surface position (fat streaks, skin, blood line, spots,
 * bands...), so patterns stay sharp however close the hand or eye comes,
 * on very few triangles. Parts with a plain colour (a prawn's tail, a tray)
 * set the `aFlat` vertex attribute to 1 and keep their vertex colour.
 *
 * Everything a material needs is kept in userData, and the shader hook is a
 * class method, so clones (feedback.ts clones a material to make it glow)
 * keep the pattern. All neta share one shader program.
 */

/** Pattern numbers understood by the shader. */
export const NetaPattern = {
  SakuPlain: 0,
  FatLight: 1,
  FatHeavy: 2,
  SkinSilver: 3,
  YellowLine: 4,
  BloodLine: 5,
  Mackerel: 6,
  Squid: 7,
  Octopus: 8,
  Abalone: 9,
  Tamago: 10,
  Kohada: 11,
  Aji: 12,
  Prawn: 13,
  SweetShrimp: 14,
  Scallop: 15,
  ArkShell: 16,
  Cockle: 17,
  SeaEel: 18,
  Pouch: 19,
  Uni: 20,
  Roe: 21,
  Cucumber: 22,
  Stick: 23,
  Leaf: 24,
  /** Nori: near-black green with a fine fibrous sheet texture. */
  Nori: 25,
  /** Rustic white stoneware (kohiki-like): speckled glaze, bare rim and foot. */
  Stoneware: 26,
  /**
   * A roll lying along x (radius dims.y): nori outside; on the cut faces a
   * nori ring, rice, and the filling(s) (colour2, colour3) in the middle.
   */
  MakiRoll: 27,
} as const;

const GLSL = /* glsl */ `
uniform vec3 uC1;
uniform vec3 uC2;
uniform vec3 uC3;
uniform vec3 uDims;
uniform float uPhase;
uniform int uPattern;
varying vec3 vNetaPos;
varying vec3 vNetaNormal;
varying float vNetaFlat;

float nHash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float nNoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(nHash(i), nHash(i + vec3(1.0, 0.0, 0.0)), f.x), mix(nHash(i + vec3(0.0, 1.0, 0.0)), nHash(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
    mix(mix(nHash(i + vec3(0.0, 0.0, 1.0)), nHash(i + vec3(1.0, 0.0, 1.0)), f.x), mix(nHash(i + vec3(0.0, 1.0, 1.0)), nHash(i + vec3(1.0, 1.0, 1.0)), f.x), f.y),
    f.z);
}
float nLine(float x, float w) { return 1.0 - smoothstep(w * 0.5, w, abs(x)); }
float nUp(float lo, float hi, float x) { return smoothstep(lo, hi, x); }

vec3 netaColor(vec3 p, vec3 n) {
  vec3 c = uC1;
  vec3 c2 = uC2;
  float L = uDims.x;
  float H = uDims.y;
  float W = uDims.z;
  float ph = uPhase;
  float fibre = nNoise(vec3(p.x * 220.0, p.y * 900.0, p.z * 900.0) + ph);
  float fine = nNoise(p * 1500.0 + ph);
  int pat = uPattern;
  if (pat <= 6) {
    // A saku: x 0..L along the block, y 0..H, z across (skin side at +z).
    float up = clamp(p.y / H, 0.0, 1.0);
    c *= 0.74 + 0.26 * up;
    c *= 0.9 + 0.14 * fibre + 0.05 * fine;
    float suj = sin((p.x * 0.8 + p.z * 0.5) * 520.0 + ph + 3.0 * nNoise(p * 160.0));
    c = mix(c, vec3(1.0), 0.1 * nUp(0.92, 1.0, suj));
    float skin = (p.z - (W * 0.5 - 0.011)) / 0.011;
    bool side = n.z > 0.5;
    bool top = n.y > 0.5;
    if (pat == 1) {
      float s = sin((p.x + p.z * 0.6 + p.y * 0.4) * 560.0 + ph + 2.0 * nNoise(p * 200.0));
      c = mix(c, c2, nUp(0.8, 0.97, s));
    } else if (pat == 2) {
      c = mix(c, c2, 0.25);
      float s = sin((p.x + p.z * 0.7 + p.y * 0.5) * 640.0 + ph + 2.5 * nNoise(p * 220.0));
      c = mix(c, c2, nUp(0.2, 0.75, s));
    } else if (pat == 3) {
      if (side || (top && skin > 0.0)) {
        c = c2 * (0.92 + 0.16 * fine);
        float st = sin(p.x * 300.0 + p.y * 900.0 + ph + 2.0 * nNoise(p * 120.0));
        c = mix(c, c2 * 0.5, nUp(0.45, 0.65, st));
      } else if (top && skin > -0.7) {
        c = mix(c, vec3(0.1, 0.012, 0.014), 0.6);
      }
    } else if (pat == 4) {
      if (side || (top && skin > 0.4)) {
        c = c2 * (0.95 + 0.1 * fine);
        if (side) c = mix(c, vec3(0.77, 0.55, 0.05), nLine(p.y - H * 0.55, 0.0035));
      }
    } else if (pat == 5) {
      if (top) c = mix(c, c2, 0.85 * (1.0 - nUp(0.35, 0.6, abs(skin - 0.05))));
      if (side && up > 0.5) c = mix(c, c2, 0.5);
    } else if (pat == 6) {
      if (top) {
        c = c2 * (0.9 + 0.15 * fine);
        float w = sin(p.x * 260.0 + sin(p.z * 400.0) * 1.6 + ph + 1.5 * nNoise(p * 150.0));
        if (p.z < W * 0.15) c = mix(c, c2 * 0.45, nUp(0.3, 0.5, w));
        c = mix(c, vec3(0.85), 0.5 * nUp(W * 0.2, W * 0.4, p.z));
      } else if (up > 0.8) {
        c = mix(c, c2, 0.4);
      }
    }
    return c;
  }
  if (pat == 7) {
    c *= 0.94 + 0.08 * fine;
    if (n.y < 0.5) c = mix(c, c2, 0.6);
    return mix(c, c2, 0.35 * nUp(0.9, 1.0, sin(p.x * 700.0 + p.z * 300.0)));
  }
  if (pat == 8) {
    if (n.y < -0.25) return c2 * (0.92 + 0.1 * fine);
    return mix(c, c * 0.6, nUp(0.6, 0.8, nNoise(p * 700.0 + ph))) * (0.92 + 0.1 * fine);
  }
  if (pat == 9) {
    float rim = 1.0 - p.y / H + 0.08 * sin(atan(p.z, p.x - L * 0.5) * 40.0);
    c = mix(c, c2, nUp(0.6, 0.95, rim));
    c = mix(c, c2, 0.3 * nNoise(p * 400.0));
    return c * (0.92 + 0.1 * fine);
  }
  if (pat == 10) {
    if (abs(n.y) > 0.5) return mix(c2, c, 0.35 * nNoise(p * 500.0)) * (0.9 + 0.12 * fine);
    return mix(c, c2, 0.18 * nUp(0.7, 0.95, fract(p.y / 0.004))) * (0.95 + 0.06 * fine);
  }
  // Pieces: centred, length along z (head end at -z), width along x.
  float t = p.z / L + 0.5;
  if (pat == 11 || pat == 12) {
    vec3 flesh = pat == 11 ? vec3(0.82, 0.69, 0.6) : c2;
    if (n.y < 0.4) return flesh * (0.95 + 0.08 * fine);
    c *= 0.92 + 0.14 * fine;
    if (pat == 11) {
      float spots = nNoise(vec3(p.x * 700.0, 0.0, p.z * 420.0) + ph);
      if (p.x < 0.004) c = mix(c, c2, nUp(0.62, 0.7, spots));
      c = mix(c, vec3(0.95), 0.35 * nUp(0.004, 0.009, p.x));
    } else {
      c = mix(c, c * 0.55, 1.0 - nUp(-0.006, -0.002, p.x));
      c = mix(c, vec3(0.68, 0.56, 0.22), 0.7 * nLine(p.x - 0.001, 0.0014));
    }
    return c;
  }
  if (pat == 13) {
    c *= 0.96 + 0.06 * fine;
    if (n.y > 0.4) c = mix(c, c2, 0.85 * nUp(0.1, 0.5, sin(p.z * 700.0)));
    float halfW = 0.017 * (1.0 - 0.45 * t);
    return mix(c, c2, 0.6 * nUp(halfW * 0.6, halfW * 0.85, abs(p.x)));
  }
  if (pat == 14) {
    if (n.y < -0.2) return c2;
    return mix(c, c * 0.8, 0.5 * nUp(0.7, 1.0, sin(p.z * 520.0))) * (0.95 + 0.08 * fine);
  }
  if (pat == 15) {
    float a = atan(p.z, p.x);
    return mix(c, c2, 0.5 * nUp(0.3, 0.9, sin(a * 34.0 + 3.0 * nNoise(p * 300.0)))) * (0.96 + 0.06 * fine);
  }
  if (pat == 16) {
    float halfW = 0.015 * (1.0 - 0.55 * t);
    float rim = nUp(halfW * 0.55, halfW * 0.8, abs(p.x) + 0.0008 * sin(p.z * 900.0));
    return mix(c * (0.9 + 0.15 * fibre), c2, 0.8 * rim);
  }
  if (pat == 17) {
    if (n.y > 0.3) c = mix(c, c2, nUp(0.42, 0.55, t + 0.04 * sin(p.x * 600.0)));
    return c * (0.94 + 0.08 * fine);
  }
  if (pat == 18) {
    if (n.y < 0.4) return c2;
    c = mix(c, c * 0.7, nUp(0.009, 0.014, abs(p.x)));
    c = mix(c, c * 0.65, 0.6 * nUp(0.85, 1.0, sin(p.z * 650.0)));
    return c * (0.92 + 0.12 * nNoise(p * 600.0));
  }
  if (pat == 19) {
    // Seasoned fried tofu: golden brown, darker where the simmering broth
    // soaked in, and the small pores of the fried skin.
    float soak = nNoise(p * 260.0 + ph * 1.3);
    float pores = nUp(0.7, 0.8, nNoise(p * 3200.0 + ph));
    c = mix(c, c2, 0.5 * soak);
    c = mix(c, c2 * 0.65, 0.6 * pores);
    return c * (0.9 + 0.14 * fine);
  }
  if (pat == 20) {
    // A uni lobe (length along x): fine granules, a shallow crease along its
    // middle on top, paler toward its sides.
    float g = nNoise(p * 2600.0 + ph);
    float g2 = nNoise(p * 1200.0 + ph * 1.7);
    c *= 0.8 + 0.24 * g + 0.1 * g2;
    if (n.y > 0.2) c = mix(c, c * 0.68, 0.55 * nLine(p.z + 0.0006 * sin(p.x * 400.0), 0.0011));
    return mix(c, vec3(0.98, 0.72, 0.36), 0.3 * nUp(0.55, 1.0, abs(p.z) / max(W * 0.5, 0.001)));
  }
  if (pat == 21) {
    // A salmon roe bead: clear and glossy, deeper at its edge, brighter in
    // the middle, a white glint from the work lights above.
    vec3 col = mix(c * 0.6, c * 1.15, clamp(n.y * 0.5 + 0.5, 0.0, 1.0));
    float glint = pow(max(dot(n, normalize(vec3(-0.35, 0.85, 0.4))), 0.0), 36.0);
    return col + vec3(0.85 * glint);
  }
  if (pat == 22) {
    if (abs(n.z) > 0.5) return mix(c2, c, nUp(0.0035, 0.0048, max(abs(p.x), abs(p.y - 0.0045))));
    return c * (0.9 + 0.2 * nNoise(vec3(p.x * 2000.0, p.y * 2000.0, p.z * 200.0)));
  }
  if (pat == 23) {
    return c * (0.9 + 0.12 * fibre);
  }
  if (pat == 25) {
    float f = nNoise(vec3(p.x * 900.0, p.y * 3000.0, p.z * 900.0) + ph);
    float speck = nUp(0.82, 0.9, nNoise(p * 2200.0 + ph));
    return c * (0.75 + 0.45 * f) + vec3(0.05, 0.07, 0.05) * speck;
  }
  if (pat == 26) {
    // x/z radius from the bowl's axis (dims: rim radius, height); bare clay at the rim and foot.
    float speck = nUp(0.86, 0.92, nNoise(p * 1800.0 + ph));
    c = mix(c, c2 * 0.7, 0.8 * speck);
    c *= 0.94 + 0.08 * fine;
    if (p.y > H - 0.0012 || p.y < 0.0035) c = mix(c, c2, 0.75);
    return c;
  }
  if (pat == 27) {
    float rr = length(p.yz);
    if (abs(n.x) > 0.5) {
      if (rr > H * 0.88) return vec3(0.03, 0.05, 0.035);
      vec3 rice = vec3(0.93, 0.91, 0.86) * (0.84 + 0.22 * nNoise(p * 2600.0 + ph));
      float rf = W;
      if (any(notEqual(uC3, c2))) {
        // Two fillings side by side.
        if (length(p.yz - vec2(0.0, -rf * 0.55)) < rf * 0.65) return c2 * (0.9 + 0.15 * fine);
        if (length(p.yz - vec2(0.0, rf * 0.55)) < rf * 0.65) return uC3 * (0.9 + 0.15 * fine);
        return rice;
      }
      return rr < rf ? c2 * (0.9 + 0.15 * fine) : rice;
    }
    return c * (0.75 + 0.45 * nNoise(vec3(p.x * 300.0, p.y * 2400.0, p.z * 2400.0) + ph));
  }
  if (pat == 24) {
    c *= 0.9 + 0.12 * fine;
    c = mix(c, vec3(0.8), 0.3 * nLine(p.x, 0.0012));
    return mix(c, c2, 0.6 * nLine(fract((p.z - abs(p.x) * 0.7) * 120.0) - 0.5, 0.06));
  }
  return c;
}
`;

interface NetaUserData {
  c1: [number, number, number];
  c2: [number, number, number];
  c3?: [number, number, number];
  dims: [number, number, number];
  phase: number;
  pattern: number;
}

interface ShaderHook {
  uniforms: Record<string, { value: unknown }>;
  vertexShader: string;
  fragmentShader: string;
}

export class NetaMaterial extends MeshStandardMaterial {
  override onBeforeCompile(shader: ShaderHook): void {
    const u = this.userData as NetaUserData;
    shader.uniforms.uC1 = { value: new Vector3(...u.c1) };
    shader.uniforms.uC2 = { value: new Vector3(...u.c2) };
    shader.uniforms.uC3 = { value: new Vector3(...(u.c3 ?? u.c2)) };
    shader.uniforms.uDims = { value: new Vector3(...u.dims) };
    shader.uniforms.uPhase = { value: u.phase };
    shader.uniforms.uPattern = { value: u.pattern };
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nattribute float aFlat;\nvarying vec3 vNetaPos;\nvarying vec3 vNetaNormal;\nvarying float vNetaFlat;',
      )
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvNetaPos = position;\nvNetaNormal = normal;\nvNetaFlat = aFlat;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${GLSL}`)
      .replace(
        '#include <color_fragment>',
        // vColor carries any per-instance tint (white on patterned parts otherwise).
        '#include <color_fragment>\nif (vNetaFlat < 0.5) diffuseColor.rgb = netaColor(vNetaPos, normalize(vNetaNormal)) * vColor.rgb;',
      );
  }

  override customProgramCacheKey(): string {
    return 'neta-pattern-1';
  }
}

/**
 * A neta material: colours as #rrggbb, dims (length, height, width in m)
 * as the pattern expects them, gloss 0 = matt to 1 = wet.
 */
export function makeNetaMaterial(
  name: string,
  pattern: number,
  color: string,
  color2: string,
  dims: [number, number, number],
  phase: number,
  gloss: number,
  doubleSided = false,
  color3?: string,
): NetaMaterial {
  const m = new NetaMaterial({ vertexColors: true, roughness: 0.85 - gloss * 0.6, metalness: 0, side: doubleSided ? DoubleSide : FrontSide });
  m.name = `Neta_${name}`;
  const a = new Color(color);
  const b = new Color(color2);
  const data: NetaUserData = { c1: [a.r, a.g, a.b], c2: [b.r, b.g, b.b], dims, phase, pattern };
  if (color3) {
    const c = new Color(color3);
    data.c3 = [c.r, c.g, c.b];
  }
  m.userData = data as unknown as Record<string, unknown>;
  return m;
}
