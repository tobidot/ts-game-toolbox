/**
 * The GPU particles' shaders, GLSL ES 3.00 as plain strings: the toolbox ships TypeScript source,
 * so a game's bundler needs no loader for them. `GpuParticles` puts `#version`, the precisions and
 * the numbers the TypeScript owns (`ROW`) in front of each. Lifted from Last Energy in Space 0.11.0's light.
 */

/** A triangle over the whole target: every texel of the particle state gets one fragment. */
export const FULL_SCREEN_VERTEX = `
void main() {
    vec2 corner = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
    gl_Position = vec4(corner * 2.0 - 1.0, 0.0, 1.0);
}
`;

/**
 * One step of every particle in the window: the exact motion under constant gravity and drag,
 * the same as `drift()` in ParticleStore.ts. Dead ones are copied as they are.
 */
export const UPDATE_FRAGMENT = `
uniform sampler2D u_a;
uniform sampler2D u_b;
// The clock after this step, and the step.
uniform float u_time;
uniform float u_dt;
out vec4 o_a;
void main() {
    ivec2 coord = ivec2(gl_FragCoord.xy);
    vec4 a = texelFetch(u_a, coord, 0);
    vec4 b = texelFetch(u_b, coord, 0);
    float age = u_time - b.x;
    if (age < 0.0 || age > b.y + u_dt) {
        o_a = a;
        return;
    }
    float k = b.z;
    float gravity = b.w;
    float dt = u_dt;
    float kt = k * dt;
    float keep = exp(-kt);
    float moved;
    float settle;
    if (kt < 0.05) {
        moved = dt * (1.0 - kt / 2.0 + kt * kt / 6.0 - kt * kt * kt / 24.0);
        settle = dt * dt * (0.5 - kt / 6.0 + kt * kt / 24.0 - kt * kt * kt / 120.0);
    } else {
        moved = (1.0 - keep) / k;
        settle = (dt - moved) / k;
    }
    o_a = vec4(
        a.x + a.z * moved,
        a.y + a.w * moved + gravity * settle,
        a.z * keep,
        a.w * keep + gravity * moved
    );
}
`;

/**
 * Every particle of one blend in the window as a point: its colour, opacity and size blended
 * over its life, placed by the context's transform. Others go off screen.
 */
export const DRAW_VERTEX = `
uniform sampler2D u_a;
uniform sampler2D u_b;
uniform sampler2D u_c;
uniform sampler2D u_d;
uniform int u_first;
uniform int u_capacity;
uniform float u_time;
uniform float u_blend;
uniform mat3 u_world_to_pixel;
uniform vec2 u_pixels;
uniform float u_pixels_per_unit;
uniform float u_max_point;
out vec4 v_color;
out float v_solid;

// 0xrrggbb as a float, taken apart with float steps: exact below 2^24, where int(packed + 0.5)
// is not (0xffffff + 0.5 rounds up to 2^24), and some drivers get the bit shifts wrong.
vec3 unpack_color(float packed) {
    float red = floor(packed / 65536.0);
    float rest = packed - red * 65536.0;
    float green = floor(rest / 256.0);
    float blue = rest - green * 256.0;
    return vec3(red, green, blue) / 255.0;
}

void main() {
    int index = (u_first + gl_VertexID) % u_capacity;
    ivec2 coord = ivec2(index % ROW, index / ROW);
    vec4 b = texelFetch(u_b, coord, 0);
    vec4 d = texelFetch(u_d, coord, 0);
    float age = u_time - b.x;
    v_color = vec4(0.0);
    v_solid = 0.0;
    if (age < 0.0 || age >= b.y || abs(d.z - u_blend) > 0.5) {
        gl_Position = vec4(2.0, 2.0, 0.0, 1.0);
        gl_PointSize = 1.0;
        return;
    }
    float life = age / b.y;
    vec4 a = texelFetch(u_a, coord, 0);
    vec4 c = texelFetch(u_c, coord, 0);
    vec3 color = mix(unpack_color(c.x), unpack_color(c.y), life);
    float alpha = clamp(mix(d.x, d.y, life), 0.0, 1.0);
    float size = mix(c.z, c.w, life) * u_pixels_per_unit;
    // Under SOLID_BELOW pixels: one solid pixel, fainter by the light it lacks (ParticleRaster).
    v_solid = 0.0;
    if (size < SOLID_BELOW) {
        float share = max(size, 0.0) / SOLID_BELOW;
        alpha *= share * share;
        size = 1.0;
        v_solid = 1.0;
    }
    vec3 pixel = u_world_to_pixel * vec3(a.xy, 1.0);
    gl_Position = vec4(pixel.x / u_pixels.x * 2.0 - 1.0, 1.0 - pixel.y / u_pixels.y * 2.0, 0.0, 1.0);
    gl_PointSize = min(size, u_max_point);
    v_color = vec4(color * alpha, alpha);
}
`;

/**
 * A soft round dot, (1 - r²)² towards its rim, premultiplied; a solid pixel for a tiny one. A glowing one keeps its alpha at
 * its brightest channel, so what adds up stays a valid premultiplied colour (Last Energy's
 * lesson: a browser that un-premultiplies the canvas keeps it).
 */
export const DRAW_FRAGMENT = `
uniform float u_blend;
in vec4 v_color;
in float v_solid;
out vec4 o_color;
void main() {
    vec2 from_middle = gl_PointCoord - 0.5;
    float r2 = dot(from_middle, from_middle) * 4.0;
    if (r2 >= 1.0 && v_solid < 0.5) {
        discard;
    }
    float fall = v_solid > 0.5 ? 1.0 : (1.0 - r2) * (1.0 - r2);
    vec4 color = v_color * fall;
    if (u_blend > 0.5) {
        color.a = max(color.r, max(color.g, color.b));
    }
    o_color = color;
}
`;
