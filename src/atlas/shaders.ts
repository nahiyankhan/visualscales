import { atlasPalette } from './palette.js'

// Original procedural artwork. Sphere and floor share the same color field;
// the floor is an art-directed light projection, not a physical caustics simulation.
const colorField = /* glsl */ `
  uniform float uTime;
  uniform vec3 uPalette[${atlasPalette.length}];
  uniform float uProbe;

  float hash(vec3 p) {
    p = fract(p * 0.3183099 + vec3(0.13, 0.27, 0.41));
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }

  float noise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x),
          mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
      mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x),
          mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
  }

  vec3 linearToLab(vec3 c) {
    vec3 lms = mat3(
      0.4122214708, 0.2119034982, 0.0883024619,
      0.5363325363, 0.6806995451, 0.2817188376,
      0.0514459929, 0.1073969566, 0.6299787005
    ) * c;
    lms = pow(max(lms, vec3(0.0)), vec3(1.0 / 3.0));
    return mat3(
      0.2104542553, 1.9779984951, 0.0259040371,
      0.7936177850, -2.4285922050, 0.7827717662,
      -0.0040720468, 0.4505937099, -0.8086757660
    ) * lms;
  }

  vec3 labToLinear(vec3 lab) {
    vec3 lms = mat3(
      1.0, 1.0, 1.0,
      0.3963377774, -0.1055613458, -0.0894841775,
      0.2158037573, -0.0638541728, -1.2914855480
    ) * lab;
    lms = lms * lms * lms;
    return max(vec3(0.0), mat3(
      4.0767416621, -1.2684380046, -0.0041960863,
      -3.3077115913, 2.6097574011, -0.7034186147,
      0.2309699292, -0.3413193965, 1.7076147010
    ) * lms);
  }

  vec3 srgbToLinear(vec3 c) {
    return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c));
  }

  vec3 palette(float t) {
    t = fract(t) * float(${atlasPalette.length});
    int index = int(floor(t));
    int next = (index + 1) % ${atlasPalette.length};
    float f = fract(t);
    f = f * f * (3.0 - 2.0 * f);
    // Exact generated swatches are the anchors; only the transitions and
    // scene lighting introduce intermediate colors. No second rainbow palette.
    return labToLinear(mix(linearToLab(uPalette[index]), linearToLab(uPalette[next]), f));
  }

  float fieldCoordinate(vec3 p) {
    float time = uTime * 0.035;
    // Broad convective currents; drag rotation moves this object-space field.
    vec3 q = p;
    float twist = p.y * 1.65 + noise(p * 1.5 + time) * 1.8;
    q.xz = mat2(cos(twist), -sin(twist), sin(twist), cos(twist)) * q.xz;
    vec3 warp = vec3(
      noise(q * 1.45 + vec3(time, 2.8, 1.3)),
      noise(q * 1.45 + vec3(3.7, -time, 4.1)),
      noise(q * 1.45 + vec3(8.2, 5.6, time))
    );
    float n = noise(q * 1.35 + warp * 1.8 + vec3(0.0, time, 0.0));
    return n * 1.05 + q.y * 0.22 + q.x * 0.18 + 0.06;
  }

  vec3 field(vec3 p) {
    return palette(fieldCoordinate(p));
  }
`

export const sphereVertex = /* glsl */ `
  varying vec3 vPosition;
  varying vec3 vNormal;
  varying vec3 vWorldPosition;
  void main() {
    vPosition = position;
    vNormal = normalize(mat3(modelMatrix) * normal);
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorldPosition = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`

export const sphereFragment = /* glsl */ `
  ${colorField}
  varying vec3 vPosition;
  varying vec3 vNormal;
  varying vec3 vWorldPosition;
  void main() {
    if (uProbe > 0.5) {
      float coordinate = fract(fieldCoordinate(normalize(vPosition))) * float(${atlasPalette.length});
      float anchor = mod(floor(coordinate + 0.5), float(${atlasPalette.length}));
      // Encode source stop, not shaded pixel RGB. Read once on entry.
      gl_FragColor = vec4((anchor + 1.0) / 255.0, 0.0, 0.0, 1.0);
      return;
    }
    vec3 normal = normalize(vNormal);
    vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
    vec3 lightDirection = normalize(vec3(-3.0, 5.0, 4.0));
    vec3 color = field(normalize(vPosition));
    float diffuse = max(dot(normal, lightDirection), 0.0);
    float fresnel = pow(1.0 - max(dot(normal, viewDirection), 0.0), 3.0);
    float specular = pow(max(dot(normal, normalize(lightDirection + viewDirection)), 0.0), 38.0);
    float broadSpecular = pow(max(dot(normal, normalize(lightDirection + viewDirection)), 0.0), 5.0);
    float facing = max(dot(normal, viewDirection), 0.0);
    color *= (0.26 + diffuse * 0.74) * (0.64 + pow(facing, 0.45) * 0.36);
    // Soft neutral highlight and chromatic edge light, not a pastel cream wash.
    color += vec3(0.91, 0.95, 1.0) * (specular * 0.07 + broadSpecular * 0.11);
    color += field(normalize(vPosition)) * fresnel * 0.22;
    float grain = (hash(vec3(gl_FragCoord.xy, 1.0)) - 0.5) / 300.0;
    gl_FragColor = vec4(color + grain, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

export const floorVertex = /* glsl */ `
  varying vec3 vWorldPosition;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorldPosition = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`

export const floorFragment = /* glsl */ `
  ${colorField}
  uniform vec3 uBackground;
  uniform mat3 uInverseRotation;
  varying vec3 vWorldPosition;
  void main() {
    vec2 p = vWorldPosition.xy;
    float radius = length(p);
    vec2 direction = p / max(radius, 0.001);
    // Project the visible edge colors outward, not three averaged samples
    // that cancel into beige. Broad lobes stay recognizable as emitted light.
    float spread = 0.12 + smoothstep(1.4, 4.0, radius) * 0.12;
    vec2 left = mat2(cos(spread), -sin(spread), sin(spread), cos(spread)) * direction;
    vec2 right = mat2(cos(spread), sin(spread), -sin(spread), cos(spread)) * direction;
    vec3 color = field(uInverseRotation * vec3(direction * 0.98, 0.12)) * 0.5;
    color += field(uInverseRotation * vec3(left * 0.98, 0.12)) * 0.25;
    color += field(uInverseRotation * vec3(right * 0.98, 0.12)) * 0.25;
    float inner = smoothstep(0.95, 1.6, radius);
    float halo = exp(-pow((radius - 1.85) / 1.3, 2.0));
    float outerWash = exp(-radius * radius * 0.065);
    float currents = noise(vec3(direction * 3.5, radius * 0.35 - uTime * 0.018));
    float intensity = inner * (halo * 0.13 + outerWash * 0.045) * (0.72 + currents * 0.3);
    // Light adds to charcoal rather than tinting a bright ivory surface.
    // Broad falloff keeps the full-frame, top-down projection hazy but dark.
    vec2 shadowPosition = (p - vec2(0.58, -0.55)) / vec2(1.12, 1.0);
    float shadow = exp(-dot(shadowPosition, shadowPosition) * 0.95);
    vec3 ground = uBackground * (1.0 - shadow * 0.3);
    ground += color * intensity;
    // Static fine grain makes the surface tactile without animated shimmer.
    float grain = (hash(vec3(gl_FragCoord.xy, 2.0)) - 0.5) / 650.0;
    gl_FragColor = vec4(ground + grain, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`
