/* eslint-disable @typescript-eslint/naming-convention -- the fake context and canvases speak the DOM's names */
import { describe, expect, it } from "vitest";
import { SeededRandom } from "../../random";
import { ParticleEffect, PARTICLE_EFFECTS } from "./ParticleEffect";
import { Particles, ParticlesOptions } from "./Particles";
import { drift } from "./ParticleStore";

/** One square the CPU path painted: where, how big, in which colour and how opaque. */
interface Painted {
    x: number;
    y: number;
    size: number;
    style: string;
    alpha: number;
    composite: string;
}

/** A context without a canvas behind it that writes down every square it is asked to fill. */
function recording_context() {
    const painted: Painted[] = [];
    const state = {
        fillStyle: "#000000",
        globalAlpha: 1,
        globalCompositeOperation: "source-over",
    };
    const saved: Array<typeof state> = [];
    const context = {
        canvas: { width: 960, height: 640 },
        get fillStyle() {
            return state.fillStyle;
        },
        set fillStyle(value: string) {
            state.fillStyle = value;
        },
        get globalAlpha() {
            return state.globalAlpha;
        },
        set globalAlpha(value: number) {
            state.globalAlpha = value;
        },
        get globalCompositeOperation() {
            return state.globalCompositeOperation;
        },
        set globalCompositeOperation(value: string) {
            state.globalCompositeOperation = value;
        },
        save: () => {
            saved.push({ ...state });
        },
        restore: () => {
            const last = saved.pop();
            if (last !== undefined) {
                Object.assign(state, last);
            }
        },
        fillRect: (x: number, y: number, width: number, height: number) => {
            painted.push({
                x: x + width / 2,
                y: y + height / 2,
                size: width,
                style: state.fillStyle,
                alpha: state.globalAlpha,
                composite: state.globalCompositeOperation,
            });
        },
    };
    return {
        context: context as unknown as CanvasRenderingContext2D,
        painted,
        state,
    };
}

/** Particles on the CPU, seeded, without a canvas for sprites (squares instead). */
function cpu_particles(options: ParticlesOptions = {}): Particles {
    const random = new SeededRandom(7);
    return new Particles({
        backend: "cpu",
        random: () => random.next(),
        make_canvas: () => null,
        ...options,
    });
}

/** One particle, straight to the right at 100 units a second, no spread, living 10 s. */
const ONE: ParticleEffect = {
    count: 1,
    speed: [100, 100],
    angle: 0,
    spread: 0,
    radius: 0,
    lifetime: [10, 10],
    gravity: 0,
    speed_half_life: Infinity,
    color: ["#ffffff", "#ffffff"],
    alpha: [1, 1],
    size: [4, 4],
    blend: "normal",
};

describe("Particles on the CPU", () => {
    it("emits as many as the effect says, and as many as asked", () => {
        const particles = cpu_particles();
        expect(particles.backend).toBe("cpu");
        expect(particles.emit(PARTICLE_EFFECTS.burst, 100, 100)).toBe(
            PARTICLE_EFFECTS.burst.count,
        );
        expect(particles.count).toBe(PARTICLE_EFFECTS.burst.count);
        expect(particles.emit(PARTICLE_EFFECTS.burst, 0, 0, { count: 7 })).toBe(
            7,
        );
        expect(particles.count).toBe(PARTICLE_EFFECTS.burst.count + 7);
        const { context, painted } = recording_context();
        particles.draw(context);
        expect(painted.length).toBe(PARTICLE_EFFECTS.burst.count + 7);
    });

    it("lets a particle die at its lifetime", () => {
        const particles = cpu_particles();
        particles.emit({ ...ONE, count: 20, lifetime: [1, 1] }, 0, 0);
        for (let frame = 0; frame < 59; frame++) {
            particles.update(1 / 60);
        }
        expect(particles.count).toBe(20);
        particles.update(1 / 60 + 0.002);
        expect(particles.count).toBe(0);
        const { context, painted } = recording_context();
        particles.draw(context);
        expect(painted.length).toBe(0);
    });

    it("has every ready-made effect gone after its longest lifetime", () => {
        for (const [name, effect] of Object.entries(PARTICLE_EFFECTS)) {
            const particles = cpu_particles();
            particles.emit(effect, 480, 320);
            expect(particles.count, name).toBe(effect.count);
            let seconds = 0;
            while (seconds < effect.lifetime[0] - 0.05) {
                particles.update(1 / 60);
                seconds += 1 / 60;
            }
            expect(particles.count, name).toBe(effect.count);
            while (seconds < effect.lifetime[1] + 0.05) {
                particles.update(1 / 60);
                seconds += 1 / 60;
            }
            expect(particles.count, name).toBe(0);
        }
    });

    it("moves one under gravity and drag as worked out by hand", () => {
        const particles = cpu_particles();
        // Speed halves every second: k = ln 2. 100 to the right, gravity 50 down.
        particles.emit({ ...ONE, gravity: 50, speed_half_life: 1 }, 10, 20);
        for (let frame = 0; frame < 120; frame++) {
            particles.update(1 / 60);
        }
        const k = Math.LN2;
        // x: 100 (1 - e^-2k) / k = 100 · 0.75 / ln 2
        const x = 10 + (100 * 0.75) / k;
        // y: g (t - (1 - e^-kt) / k) / k
        const y = 20 + (50 * (2 - 0.75 / k)) / k;
        const { context, painted } = recording_context();
        particles.draw(context);
        expect(painted.length).toBe(1);
        expect(painted[0].x).toBeCloseTo(x, 2);
        expect(painted[0].y).toBeCloseTo(y, 2);
        // The same where worked out in one go, as a switch of backend does.
        const [seen] = particles.snapshot();
        expect(seen.x).toBeCloseTo(x, 2);
        expect(seen.y).toBeCloseTo(y, 2);
    });

    it("moves the same in one long step and in many short ones", () => {
        const state = new Float64Array([0, 0, 30, -200]);
        const steps = new Float64Array([0, 0, 30, -200]);
        drift(state, 0, 0.9, 400, 1.5);
        for (let step = 0; step < 90; step++) {
            drift(steps, 0, 0.9, 400, 1.5 / 90);
        }
        for (let index = 0; index < 4; index++) {
            expect(steps[index]).toBeCloseTo(state[index], 6);
        }
        // Without drag: the parabola.
        const free = new Float64Array([0, 0, 10, -100]);
        drift(free, 0, 0, 200, 2);
        expect(Array.from(free)).toEqual([20, 200, 10, 300]);
    });

    it("blends colour, opacity and size over life, at half life halfway", () => {
        const particles = cpu_particles();
        particles.emit(
            {
                ...ONE,
                speed: [0, 0],
                lifetime: [2, 2],
                color: ["#ff0000", "#0000ff"],
                alpha: [1, 0],
                size: [10, 2],
            },
            50,
            50,
        );
        particles.update(1);
        const { context, painted } = recording_context();
        particles.draw(context);
        expect(painted[0].style).toBe("rgb(128, 0, 128)");
        expect(painted[0].alpha).toBeCloseTo(0.5, 6);
        expect(painted[0].size).toBeCloseTo(6, 6);
    });

    it("paints glowing particles after the others, adding light, and leaves the context as it was", () => {
        const particles = cpu_particles();
        particles.emit({ ...ONE, blend: "glow" }, 1, 1);
        particles.emit({ ...ONE, blend: "normal" }, 2, 2);
        const { context, painted, state } = recording_context();
        particles.draw(context);
        expect(painted.map((square) => square.composite)).toEqual([
            "source-over",
            "lighter",
        ]);
        expect(painted[1].x).toBe(1);
        expect(state.globalCompositeOperation).toBe("source-over");
        expect(state.globalAlpha).toBe(1);
    });

    it("takes the angle, the colour and an added velocity from the options", () => {
        const particles = cpu_particles();
        particles.emit({ ...ONE, color: ["#000000", "#000000"] }, 0, 0, {
            angle: Math.PI / 2,
            color: "#00ff00",
            vx: 50,
            vy: 0,
        });
        particles.update(1);
        const { context, painted } = recording_context();
        particles.draw(context);
        expect(painted[0].x).toBeCloseTo(50, 3);
        expect(painted[0].y).toBeCloseTo(100, 3);
        expect(painted[0].style).toBe("rgb(0, 230, 0)");
    });

    it("draws the same show from the same seed", () => {
        const show = (seed: number) => {
            const random = new SeededRandom(seed);
            const particles = cpu_particles({ random: () => random.next() });
            particles.emit(PARTICLE_EFFECTS.burst, 300, 200);
            particles.emit(PARTICLE_EFFECTS.smoke, 300, 200);
            for (let frame = 0; frame < 30; frame++) {
                particles.update(1 / 60);
            }
            const { context, painted } = recording_context();
            particles.draw(context);
            return painted;
        };
        expect(show(3)).toEqual(show(3));
        expect(show(3)).not.toEqual(show(4));
    });

    it("replaces the oldest when it is full", () => {
        const particles = cpu_particles({ capacity: 1024 });
        expect(particles.capacity).toBe(1024);
        particles.emit({ ...ONE, count: 1000 }, 0, 0);
        particles.update(0.5);
        particles.emit({ ...ONE, count: 100 }, 500, 0);
        expect(particles.count).toBe(1024);
        const { context, painted } = recording_context();
        particles.draw(context);
        expect(painted.length).toBe(1024);
        // The 76 oldest are gone; the 100 new ones are there.
        expect(painted.filter((square) => square.x === 500).length).toBe(100);
    });

    it("starts particles inside the radius and fans them out within the spread", () => {
        const particles = cpu_particles();
        particles.emit(
            {
                ...ONE,
                count: 200,
                radius: 10,
                speed: [0, 0],
            },
            100,
            100,
        );
        for (const seen of particles.snapshot()) {
            expect(Math.hypot(seen.x - 100, seen.y - 100)).toBeLessThanOrEqual(
                10.0001,
            );
        }
        particles.clear();
        particles.emit({ ...ONE, count: 200, spread: Math.PI / 2 }, 0, 0);
        for (const seen of particles.snapshot()) {
            const angle = Math.atan2(seen.vy, seen.vx);
            expect(Math.abs(angle)).toBeLessThanOrEqual(Math.PI / 4 + 1e-6);
        }
    });

    it("empties with clear()", () => {
        const particles = cpu_particles();
        particles.emit(PARTICLE_EFFECTS.fountain, 0, 0);
        particles.clear();
        expect(particles.count).toBe(0);
        const { context, painted } = recording_context();
        particles.draw(context);
        expect(painted.length).toBe(0);
    });

    it("refuses an effect that can't be", () => {
        const particles = cpu_particles();
        expect(() =>
            particles.emit({ ...ONE, lifetime: [0, 1] }, 0, 0),
        ).toThrow();
        expect(() => particles.emit({ ...ONE, count: -1 }, 0, 0)).toThrow();
        expect(() =>
            particles.emit({ ...ONE, color: ["red", "#000000"] }, 0, 0),
        ).toThrow();
    });
});

describe("Particles choosing a backend", () => {
    it("falls back to the CPU when the GPU is forced without WebGL 2, and says so", () => {
        const particles = new Particles({
            backend: "gpu",
            make_canvas: () =>
                ({
                    width: 1,
                    height: 1,
                    getContext: () => null,
                    addEventListener: () => undefined,
                }) as unknown as HTMLCanvasElement,
        });
        expect(particles.backend).toBe("cpu");
        expect(particles.fallback_reason).toMatch(/WebGL 2/);
    });

    it("falls back without float render targets", () => {
        const gl = { getExtension: () => null };
        const particles = new Particles({
            backend: "auto",
            make_canvas: () =>
                ({
                    width: 1,
                    height: 1,
                    getContext: () => gl,
                    addEventListener: () => undefined,
                }) as unknown as HTMLCanvasElement,
        });
        expect(particles.backend).toBe("cpu");
        expect(particles.fallback_reason).toMatch(/float/);
    });

    it("falls back where there is no canvas at all", () => {
        const particles = new Particles({ make_canvas: () => null });
        expect(particles.backend).toBe("cpu");
        expect(particles.fallback_reason).not.toBeNull();
    });

    it("keeps its particles when asked for another backend", () => {
        const particles = cpu_particles();
        particles.emit(PARTICLE_EFFECTS.burst, 10, 10);
        particles.update(0.2);
        expect(particles.use_backend("gpu")).toBe("cpu");
        expect(particles.fallback_reason).toMatch(/WebGL 2|canvas/);
        expect(particles.count).toBe(PARTICLE_EFFECTS.burst.count);
        expect(particles.use_backend("cpu")).toBe("cpu");
        expect(particles.fallback_reason).toBeNull();
        expect(particles.count).toBe(PARTICLE_EFFECTS.burst.count);
    });

    it("on the CPU by choice, nothing to report", () => {
        const particles = cpu_particles();
        expect(particles.fallback_reason).toBeNull();
    });
});
