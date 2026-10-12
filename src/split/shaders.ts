import {
  sphereVertex,
  sphereFragment as colorSphere,
  floorVertex,
  floorFragment as colorFloor,
} from '../atlas/shaders.js'

export { sphereVertex, floorVertex }

// Two readings of one rotating surface. The material boundary is screen-fixed;
// object-space graduations and the original color field share one quaternion.
const engraving = /* glsl */ `
  uniform vec2 uViewport;

  float incision(float coordinate, float width, float footprint) {
    // Differentiate before wrapping; wrapped distances have discontinuities
    // that otherwise create phantom lines halfway between the actual wires.
    float edge = max(footprint, 0.00001);
    return 1.0 - smoothstep(edge * width * 0.25, edge * width, abs(coordinate));
  }

  vec3 measuredSurface(vec3 p, vec3 normal, vec3 viewDirection) {
    const float pi = 3.14159265359;
    // Identity rotation starts with level latitude bands. Continuous meridians
    // make a horizontal spin legible without an authored tilt.
    float latitude = asin(clamp(p.y, -1.0, 1.0));
    float longitude = atan(p.z, p.x);
    // Angular footprint is continuous across atan's seam while rotating.
    vec2 tangent = vec2(-p.z, p.x);
    float longitudeFootprint =
      (abs(dot(tangent, dFdx(p.xz))) + abs(dot(tangent, dFdy(p.xz)))) /
      max(dot(p.xz, p.xz), 0.0001);
    float bands = latitude / (pi / 9.0);
    float nearest = floor(bands + 0.5);
    float bandDistance = bands - nearest;
    float major = 1.0 - step(0.5, mod(abs(nearest), 3.0));
    float ring = incision(bandDistance, mix(0.9, 1.2, major), fwidth(bands));
    float meridians = longitude / (pi / 9.0);
    float meridianDistance = meridians - floor(meridians + 0.5);
    float polarFade = 1.0 - smoothstep(1.35, 1.55, abs(latitude));
    float meridian = incision(meridianDistance, 0.85, longitudeFootprint / (pi / 9.0)) * polarFade;
    float divisions = longitude / (pi / 36.0);
    float tickIndex = floor(divisions + 0.5);
    float tickDistance = divisions - tickIndex;
    float longTick = 1.0 - step(0.5, mod(abs(tickIndex), 5.0));
    float tick = incision(tickDistance, 0.8, longitudeFootprint / (pi / 36.0)) *
      (1.0 - smoothstep(mix(0.12, 0.24, longTick), mix(0.12, 0.24, longTick) + fwidth(bands), abs(bandDistance - mix(0.06, 0.12, longTick))));
    tick *= 1.0 - smoothstep(1.13, 1.40, abs(latitude));
    vec3 light = normalize(vec3(-3.0, 5.0, 4.0));
    float diffuse = max(dot(normal, light), 0.0);
    float facing = max(dot(normal, viewDirection), 0.0);
    float sheen = pow(max(dot(normal, normalize(light + viewDirection)), 0.0), 18.0);
    vec3 body = srgbToLinear(vec3(0.115, 0.125, 0.135)) * (0.4 + diffuse * 0.6);
    body += vec3(sheen * 0.004);
    // A thin, open latitude/longitude cage above a recessive dark surface.
    // Keep ruler ticks, but let the continuous grid carry the silhouette.
    float wire = max(ring, meridian * 0.8);
    float marks = max(wire, tick * 0.65);
    body += srgbToLinear(vec3(0.65, 0.68, 0.71)) * marks * (0.35 + facing * 0.65);
    return body;
  }
`

export const sphereFragment = colorSphere
  .replace('  void main() {', `${engraving}\n  void main() {`)
  .replace(
    '    gl_FragColor = vec4(color + grain, 1.0);',
    `    float rightSide = step(uViewport.x * 0.5, gl_FragCoord.x);
    vec3 measured = measuredSurface(normalize(vPosition), normal, viewDirection);
    gl_FragColor = vec4(mix(color, measured, rightSide) + grain, 1.0);`
  )

export const floorFragment = colorFloor
  .replace(
    '  uniform vec3 uBackground;',
    '  uniform vec2 uViewport;\n  uniform vec3 uBackground;'
  )
  .replace(
    '    ground += color * intensity;',
    `    float rightSide = step(uViewport.x * 0.5, gl_FragCoord.x);
    vec3 neutralSpill = srgbToLinear(vec3(0.17, 0.19, 0.21));
    ground += mix(color, neutralSpill, rightSide) * intensity;`
  )
