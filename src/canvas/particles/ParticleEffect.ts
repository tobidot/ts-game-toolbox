/** How a particle meets what is painted below it. */
export type ParticleBlend = "normal" | "glow";

/**
 * One kind of particles as plain data: how many one `emit()` makes, how they fly, how long they
 * live and how they look over their life. Units are the game's own (those its context is drawn
 * in), seconds and units per second. A pair written `[min, max]` is picked evenly per particle;
 * a pair written `[birth, death]` blends from the first to the second over a particle's life.
 * Copy a ready-made one (`PARTICLE_EFFECTS`) and change a number:
 * `{ ...PARTICLE_EFFECTS.burst, count: 400 }`.
 */
export interface ParticleEffect {
    /** Particles one `emit()` makes. */
    readonly count: number;
    /** `[min, max]` speed at birth, units per second. */
    readonly speed: readonly [number, number];
    /** Direction in radians: 0 is right, `-Math.PI / 2` is up (the canvas's y points down). */
    readonly angle: number;
    /** How wide the directions fan out around `angle`, in radians: `2 * Math.PI` all round, 0 a beam. */
    readonly spread: number;
    /** Particles start at most this far from the point, in units; 0 starts all on it. */
    readonly radius: number;
    /** `[min, max]` seconds a particle lives. Both above 0. */
    readonly lifetime: readonly [number, number];
    /** Acceleration downwards, units per second squared; below 0 it rises, like smoke. */
    readonly gravity: number;
    /**
     * Seconds until drag halves a particle's speed; `Infinity` for no drag. Under gravity a
     * particle settles at a fall speed of `gravity * speed_half_life / Math.LN2`.
     */
    readonly speed_half_life: number;
    /** `[birth, death]` colour as `#rrggbb`. */
    readonly color: readonly [string, string];
    /** `[birth, death]` opacity, 0 to 1. */
    readonly alpha: readonly [number, number];
    /** `[birth, death]` diameter in units. */
    readonly size: readonly [number, number];
    /** `"normal"` paints over what lies below (smoke, dust); `"glow"` adds light (sparks, fire). */
    readonly blend: ParticleBlend;
}

/** What one `emit()` may change of its effect. */
export interface EmitOptions {
    /** Instead of the effect's `count`. */
    readonly count?: number;
    /** Instead of the effect's `angle`. */
    readonly angle?: number;
    /** Instead of the effect's colour at birth, `#rrggbb`; the colour at death stays. */
    readonly color?: string;
    /** Added to every particle's velocity: a trail that keeps some of its rocket's speed. */
    readonly vx?: number;
    readonly vy?: number;
}

const TURN = 2 * Math.PI;
const UP = -Math.PI / 2;

/**
 * Five ready-made effects, sized for a game about 960 by 640 units large. Each is one call:
 * `particles.emit(PARTICLE_EFFECTS.burst, x, y)`. `fountain`, `smoke` and `trail` are made to be
 * emitted every frame from a point that stays or moves.
 */
export const PARTICLE_EFFECTS = {
    /** A firework's star: sparks all round that slow down, sink a little and cool from white to orange. */
    burst: {
        count: 180,
        speed: [40, 240],
        angle: 0,
        spread: TURN,
        radius: 0,
        lifetime: [0.9, 1.7],
        gravity: 60,
        speed_half_life: 0.5,
        color: ["#fff4c8", "#ff5a1f"],
        alpha: [1, 0],
        size: [5, 2],
        blend: "glow",
    },
    /** Water up in a narrow jet that falls back down; emit it every frame. */
    fountain: {
        count: 12,
        speed: [240, 330],
        angle: UP,
        spread: 0.3,
        radius: 2,
        lifetime: [1.3, 1.9],
        gravity: 420,
        speed_half_life: 4,
        color: ["#d9f6f6", "#26306a"],
        alpha: [0.9, 0.15],
        size: [4, 3],
        blend: "normal",
    },
    /** Grey puffs that rise, grow and thin out; emit a few every frame. */
    smoke: {
        count: 3,
        speed: [10, 40],
        angle: UP,
        spread: 1.2,
        radius: 6,
        lifetime: [1.8, 3],
        gravity: -25,
        speed_half_life: 0.8,
        color: ["#9a9a9a", "#3c3c46"],
        alpha: [0.4, 0],
        size: [10, 40],
        blend: "normal",
    },
    /** A short glowing line behind something that moves: emit it every frame at its position. */
    trail: {
        count: 4,
        speed: [0, 25],
        angle: 0,
        spread: TURN,
        radius: 1,
        lifetime: [0.3, 0.6],
        gravity: 30,
        speed_half_life: 0.3,
        color: ["#ffe2a0", "#d48c17"],
        alpha: [0.9, 0],
        size: [4, 1.5],
        blend: "glow",
    },
    /** Fast hot sparks thrown up in a fan that fall hard, like from a grinder. */
    sparks: {
        count: 50,
        speed: [150, 420],
        angle: UP,
        spread: 1.4,
        radius: 0,
        lifetime: [0.4, 0.9],
        gravity: 650,
        speed_half_life: 1,
        color: ["#ffffff", "#d48c17"],
        alpha: [1, 0.3],
        size: [3, 1.5],
        blend: "glow",
    },
} as const satisfies Record<string, ParticleEffect>;

/** `#rrggbb` as one whole number, 0xrrggbb; a float32 holds it exactly. */
export function pack_color(hex: string): number {
    const match = /^#([0-9a-fA-F]{6})$/.exec(hex);
    if (match === null) {
        throw new Error(`particles: a colour is "#rrggbb", not "${hex}"`);
    }
    return Number.parseInt(match[1], 16);
}
