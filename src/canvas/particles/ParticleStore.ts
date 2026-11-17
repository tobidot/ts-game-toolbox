import { EmitOptions, pack_color, ParticleEffect } from "./ParticleEffect";

/**
 * Slots per row of the GPU's state textures; the store's capacity is a whole number of rows.
 * WebGL 2 promises textures 2 048 texels across and high.
 */
export const PARTICLE_ROW = 1024;
/** At most 2 048 rows. */
export const MAX_PARTICLE_CAPACITY = PARTICLE_ROW * 2048;
/** Below this, `k · dt`, the exact step loses digits; a short series takes over (also in the shader). */
const SERIES_BELOW = 0.05;
/** Deaths are counted to the millisecond. */
const BUCKETS_PER_SECOND = 1000;

/**
 * One exact step of `dt` seconds under constant gravity and drag `k` (per second), for the
 * particle at `at` in `state` (x, y, vx, vy): whatever the steps, a particle ends where the
 * closed form puts it. The GPU's update shader does the same.
 */
export function drift(
    state: Float32Array | Float64Array,
    at: number,
    k: number,
    gravity: number,
    dt: number,
): void {
    const kt = k * dt;
    const keep = Math.exp(-kt);
    // moved: (1 - e^-kt) / k, the distance a speed of 1 covers; settle: (t - moved) / k.
    let moved: number;
    let settle: number;
    if (kt < SERIES_BELOW) {
        moved = dt * (1 - kt / 2 + (kt * kt) / 6 - (kt * kt * kt) / 24);
        settle =
            dt * dt * (0.5 - kt / 6 + (kt * kt) / 24 - (kt * kt * kt) / 120);
    } else {
        moved = (1 - keep) / k;
        settle = (dt - moved) / k;
    }
    const vx = state[at + 2];
    const vy = state[at + 3];
    state[at] += vx * moved;
    state[at + 1] += vy * moved + gravity * settle;
    state[at + 2] = vx * keep;
    state[at + 3] = vy * keep + gravity * moved;
}

/** One particle as it is now, worked out from its birth: for tests and for a change of backend. */
export interface ParticleSnapshot {
    readonly x: number;
    readonly y: number;
    readonly vx: number;
    readonly vy: number;
    /** 0 at birth, 1 at death. */
    readonly life: number;
    readonly blend: "normal" | "glow";
}

/** What an effect turns into once, kept per effect object. */
interface Prepared {
    readonly k: number;
    readonly color_birth: number;
    readonly color_death: number;
}

/**
 * Every particle's birth, in a ring of slots: what a backend needs to move and paint it. The
 * four arrays are laid out as the GPU's four RGBA float textures, four floats a slot:
 *
 * - `a`: x, y, vx, vy at birth;
 * - `b`: birth time, lifetime, drag `k` (per second), gravity;
 * - `c`: colour at birth and at death (0xrrggbb), size at birth and at death;
 * - `d`: opacity at birth and at death, blend (0 normal, 1 glow), 0.
 *
 * Slots are taken in order; when all are taken, the oldest particle gives up its slot. The
 * store counts the living per blend by the millisecond their lives end, so a backend never
 * reads its particles back to know how many there are.
 */
export class ParticleStore {
    public readonly capacity: number;
    public readonly a: Float32Array;
    public readonly b: Float32Array;
    public readonly c: Float32Array;
    public readonly d: Float32Array;
    /** Seconds since the start; births are on this clock. */
    public time = 0;
    /** Particles ever made; the next goes into slot `head % capacity`. */
    public head = 0;
    /** The oldest particle that may still live. Slots from `tail` to `head` are the window. */
    public tail = 0;
    /** Particles made since a backend last took them (`take_fresh()`). */
    private fresh_from = 0;
    /** Living particles, normal and glowing. */
    public readonly alive: [number, number] = [0, 0];
    /** How many lives end in each millisecond, per blend. */
    private readonly deaths: [Map<number, number>, Map<number, number>] = [
        new Map(),
        new Map(),
    ];
    private counted_until = 0;
    private readonly prepared = new WeakMap<ParticleEffect, Prepared>();

    public constructor(capacity: number) {
        const rows = Math.max(
            1,
            Math.min(
                MAX_PARTICLE_CAPACITY / PARTICLE_ROW,
                Math.ceil(capacity / PARTICLE_ROW),
            ),
        );
        this.capacity = rows * PARTICLE_ROW;
        this.a = new Float32Array(this.capacity * 4);
        this.b = new Float32Array(this.capacity * 4);
        this.c = new Float32Array(this.capacity * 4);
        this.d = new Float32Array(this.capacity * 4);
    }

    /** Living particles. */
    public get count(): number {
        return this.alive[0] + this.alive[1];
    }

    /** Slots from the oldest that may live to the newest. */
    public get window(): number {
        return this.head - this.tail;
    }

    /** Makes the particles of one emit; answers how many. */
    public emit(
        effect: ParticleEffect,
        x: number,
        y: number,
        options: EmitOptions,
        random: () => number,
    ): number {
        const prepared = this.prepare(effect);
        const count = options.count ?? effect.count;
        if (!Number.isInteger(count) || count < 0) {
            throw new Error(
                `particles: count must be a whole number >= 0, not ${count}`,
            );
        }
        const color_birth =
            options.color === undefined
                ? prepared.color_birth
                : pack_color(options.color);
        const angle = options.angle ?? effect.angle;
        const add_vx = options.vx ?? 0;
        const add_vy = options.vy ?? 0;
        const [speed_min, speed_max] = effect.speed;
        const [life_min, life_max] = effect.lifetime;
        const blend = effect.blend === "glow" ? 1 : 0;
        const birth = Math.fround(this.time);
        const { a, b, c, d } = this;
        for (let index = 0; index < count; index++) {
            const direction = angle + (random() - 0.5) * effect.spread;
            const speed = speed_min + (speed_max - speed_min) * random();
            const lifetime = Math.fround(
                life_min + (life_max - life_min) * random(),
            );
            let start_x = x;
            let start_y = y;
            if (effect.radius > 0) {
                const distance = effect.radius * Math.sqrt(random());
                const turn = 2 * Math.PI * random();
                start_x += Math.cos(turn) * distance;
                start_y += Math.sin(turn) * distance;
            }
            const slot = this.take_slot();
            const at = slot * 4;
            a[at] = start_x;
            a[at + 1] = start_y;
            a[at + 2] = Math.cos(direction) * speed + add_vx;
            a[at + 3] = Math.sin(direction) * speed + add_vy;
            b[at] = birth;
            b[at + 1] = lifetime;
            b[at + 2] = prepared.k;
            b[at + 3] = effect.gravity;
            c[at] = color_birth;
            c[at + 1] = prepared.color_death;
            c[at + 2] = effect.size[0];
            c[at + 3] = effect.size[1];
            d[at] = effect.alpha[0];
            d[at + 1] = effect.alpha[1];
            d[at + 2] = blend;
            d[at + 3] = 0;
            this.count_birth(birth + lifetime, blend);
        }
        return count;
    }

    /** The clock moves on by `dt`: lives that ended are counted out, the window shrinks from the old end. */
    public advance(dt: number): void {
        this.time += dt;
        const until = Math.floor(this.time * BUCKETS_PER_SECOND);
        for (let blend = 0; blend < 2; blend++) {
            const deaths = this.deaths[blend];
            if (deaths.size === 0) {
                continue;
            }
            if (until - this.counted_until > deaths.size) {
                for (const [bucket, dead] of deaths) {
                    if (bucket <= until) {
                        this.alive[blend] -= dead;
                        deaths.delete(bucket);
                    }
                }
            } else {
                for (
                    let bucket = this.counted_until + 1;
                    bucket <= until;
                    bucket++
                ) {
                    const dead = deaths.get(bucket);
                    if (dead !== undefined) {
                        this.alive[blend] -= dead;
                        deaths.delete(bucket);
                    }
                }
            }
        }
        this.counted_until = until;
        const { b, capacity } = this;
        while (this.tail < this.head) {
            const at = (this.tail % capacity) * 4;
            if (b[at] + b[at + 1] > this.time) {
                break;
            }
            this.tail += 1;
        }
    }

    /** The slots made since the last call, from the first to the last made (at most `capacity`); the store forgets them. */
    public take_fresh(): [number, number] {
        const from = Math.max(this.fresh_from, this.head - this.capacity);
        const to = this.head;
        this.fresh_from = to;
        return [from, to];
    }

    /** Every particle goes; the clock goes on. */
    public clear(): void {
        this.tail = this.head;
        this.fresh_from = this.head;
        this.alive[0] = 0;
        this.alive[1] = 0;
        this.deaths[0].clear();
        this.deaths[1].clear();
    }

    /** Where the particle in `slot` is now, worked out from its birth, into `out` at `out_at` (x, y, vx, vy). */
    public state_now(
        slot: number,
        out: Float32Array | Float64Array,
        out_at: number,
    ): void {
        const at = slot * 4;
        out[out_at] = this.a[at];
        out[out_at + 1] = this.a[at + 1];
        out[out_at + 2] = this.a[at + 2];
        out[out_at + 3] = this.a[at + 3];
        const age = Math.min(this.time - this.b[at], this.b[at + 1]);
        if (age > 0) {
            drift(out, out_at, this.b[at + 2], this.b[at + 3], age);
        }
    }

    /** The living particles, oldest first, worked out from their births. */
    public snapshot(): ParticleSnapshot[] {
        const seen: ParticleSnapshot[] = [];
        const state = new Float64Array(4);
        for (let index = this.tail; index < this.head; index++) {
            const slot = index % this.capacity;
            const at = slot * 4;
            const age = this.time - this.b[at];
            if (age < 0 || age >= this.b[at + 1]) {
                continue;
            }
            this.state_now(slot, state, 0);
            seen.push({
                x: state[0],
                y: state[1],
                vx: state[2],
                vy: state[3],
                life: age / this.b[at + 1],
                blend: this.d[at + 2] > 0.5 ? "glow" : "normal",
            });
        }
        return seen;
    }

    private take_slot(): number {
        if (this.head - this.tail >= this.capacity) {
            const at = (this.tail % this.capacity) * 4;
            const death = this.b[at] + this.b[at + 1];
            if (death > this.time) {
                this.count_out(death, this.d[at + 2] > 0.5 ? 1 : 0);
            }
            this.tail += 1;
        }
        const slot = this.head % this.capacity;
        this.head += 1;
        return slot;
    }

    private count_birth(death: number, blend: number): void {
        const bucket = Math.ceil(death * BUCKETS_PER_SECOND);
        if (bucket <= this.counted_until) {
            return;
        }
        const deaths = this.deaths[blend];
        deaths.set(bucket, (deaths.get(bucket) ?? 0) + 1);
        this.alive[blend] += 1;
    }

    private count_out(death: number, blend: number): void {
        const bucket = Math.ceil(death * BUCKETS_PER_SECOND);
        const deaths = this.deaths[blend];
        const dead = deaths.get(bucket);
        if (dead === undefined) {
            return;
        }
        if (dead <= 1) {
            deaths.delete(bucket);
        } else {
            deaths.set(bucket, dead - 1);
        }
        this.alive[blend] -= 1;
    }

    private prepare(effect: ParticleEffect): Prepared {
        let prepared = this.prepared.get(effect);
        if (prepared !== undefined) {
            return prepared;
        }
        if (!(effect.lifetime[0] > 0) || !(effect.lifetime[1] > 0)) {
            throw new Error("particles: a lifetime is more than 0 seconds");
        }
        if (!(effect.speed_half_life > 0)) {
            throw new Error(
                "particles: speed_half_life is more than 0 seconds (Infinity for no drag)",
            );
        }
        prepared = {
            k: Number.isFinite(effect.speed_half_life)
                ? Math.LN2 / effect.speed_half_life
                : 0,
            color_birth: pack_color(effect.color[0]),
            color_death: pack_color(effect.color[1]),
        };
        this.prepared.set(effect, prepared);
        return prepared;
    }
}
