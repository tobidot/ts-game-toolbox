import {
    CpuParticles,
    MakeCanvas,
    ParticleBackend,
    ParticleBackendName,
} from "./CpuParticles";
import { GpuParticles } from "./GpuParticles";
import { EmitOptions, ParticleEffect } from "./ParticleEffect";
import { ParticleSnapshot, ParticleStore } from "./ParticleStore";

/** `"auto"` takes the GPU where the browser has WebGL 2 with float render targets, else the CPU. */
export type ParticleBackendChoice = ParticleBackendName | "auto";

export interface ParticlesOptions {
    /** Default `"auto"`. A forced `"gpu"` still falls back to the CPU where it can't run, and says why in `fallback_reason`. */
    readonly backend?: ParticleBackendChoice;
    /**
     * The most particles alive at once, rounded up to whole rows of 1 024 (at most 2 097 152);
     * default 131 072. When all are taken, the oldest particle makes room. The GPU keeps five
     * float textures of this size (80 bytes a particle), the CPU 96 bytes a particle.
     */
    readonly capacity?: number;
    /** Where the spread, speeds and lifetimes come from; default `Math.random`. A seeded one replays a show. */
    readonly random?: () => number;
    /**
     * Makes the canvas the GPU draws into and the CPU's dot pictures; default: a `<canvas>` where
     * there is a document, else an `OffscreenCanvas`, else none. A test passes `() => null`: the
     * CPU then paints squares and the GPU isn't there.
     */
    readonly make_canvas?: MakeCanvas;
}

/** Default `capacity`. */
export const PARTICLE_CAPACITY = 131072;

/** A `<canvas>` or an `OffscreenCanvas`, whichever this place has. */
function default_canvas(
    width: number,
    height: number,
): HTMLCanvasElement | OffscreenCanvas | null {
    if (typeof document !== "undefined" && !is_jsdom()) {
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        return canvas;
    }
    if (typeof OffscreenCanvas !== "undefined") {
        return new OffscreenCanvas(width, height);
    }
    return null;
}

/** jsdom (the toolbox's tests) has canvases without contexts and complains about each. */
function is_jsdom(): boolean {
    return (
        typeof navigator !== "undefined" &&
        navigator.userAgent.includes("jsdom")
    );
}

/**
 * Particles for looks: sparks, smoke, dust and trails, as many as the frame allows. A game makes
 * one, emits effects (plain data, `PARTICLE_EFFECTS` has five) and, once a frame, updates and
 * draws them onto its 2D context, under the context's transform:
 *
 * ```ts
 * const particles = new Particles();
 * particles.emit(PARTICLE_EFFECTS.burst, x, y);
 * // every frame:
 * particles.update(delta_seconds);
 * particles.draw(context);
 * ```
 *
 * The particles run on the graphics card (WebGL 2) where the browser can, else on the CPU; both
 * move them the same, exactly, and paint the same soft dots. The game never reads them back and
 * never sees WebGL. Lost the WebGL context? They go on on the CPU where they were.
 */
export class Particles {
    private readonly store: ParticleStore;
    private readonly random: () => number;
    private readonly make_canvas: MakeCanvas;
    private current: ParticleBackend;
    private reason: string | null = null;

    public constructor(options: ParticlesOptions = {}) {
        this.store = new ParticleStore(options.capacity ?? PARTICLE_CAPACITY);
        this.random = options.random ?? Math.random;
        this.make_canvas = options.make_canvas ?? default_canvas;
        this.current = this.create(options.backend ?? "auto");
    }

    /** `"gpu"` or `"cpu"`: who moves and paints them now. */
    public get backend(): ParticleBackendName {
        return this.current.name;
    }

    /** Why the GPU isn't used although asked for (or chosen by `"auto"`); null when nothing fell back. */
    public get fallback_reason(): string | null {
        return this.reason;
    }

    /** Particles alive (counted to the millisecond: one may stay counted a millisecond past its end). */
    public get count(): number {
        return this.store.count;
    }

    /** The most alive at once. */
    public get capacity(): number {
        return this.store.capacity;
    }

    /** Seconds the particles' clock has run. */
    public get time(): number {
        return this.store.time;
    }

    /** Changes the backend; the living particles go on where they are. Answers the backend in use. */
    public use_backend(choice: ParticleBackendChoice): ParticleBackendName {
        const next = this.create(choice);
        this.current.destroy();
        this.current = next;
        next.adopt(this.store);
        return next.name;
    }

    /** Makes the particles of `effect` at `x`, `y` (the game's units); answers how many. */
    public emit(
        effect: ParticleEffect,
        x: number,
        y: number,
        options: EmitOptions = {},
    ): number {
        return this.store.emit(effect, x, y, options, this.random);
    }

    /** Moves them all `delta_seconds` on; the ones whose lives ended are gone. */
    public update(delta_seconds: number): void {
        if (!(delta_seconds > 0)) {
            return;
        }
        this.check_lost();
        this.current.update(this.store, delta_seconds);
        this.store.advance(delta_seconds);
    }

    /** Paints them onto `context`, under its transform; the context is left as it was. */
    public draw(context: CanvasRenderingContext2D): void {
        this.check_lost();
        this.current.draw(this.store, context);
    }

    /** All gone at once. */
    public clear(): void {
        this.store.clear();
    }

    /** The living particles, oldest first, worked out from their births (for tests; it costs a little per particle). */
    public snapshot(): ParticleSnapshot[] {
        return this.store.snapshot();
    }

    /** Frees the graphics card's memory; the particles are gone. */
    public destroy(): void {
        this.current.destroy();
        this.store.clear();
    }

    private create(choice: ParticleBackendChoice): ParticleBackend {
        this.reason = null;
        if (choice !== "cpu") {
            const gpu = GpuParticles.create(
                this.store.capacity,
                this.make_canvas,
            );
            if (typeof gpu !== "string") {
                return gpu;
            }
            this.reason = gpu;
        }
        return new CpuParticles(this.store.capacity, this.make_canvas);
    }

    /** A lost WebGL context: on with the CPU, from where the particles are. */
    private check_lost(): void {
        if (!this.current.is_lost) {
            return;
        }
        const cpu = new CpuParticles(this.store.capacity, this.make_canvas);
        this.current.destroy();
        this.current = cpu;
        cpu.adopt(this.store);
        this.reason = "the WebGL context was lost";
    }
}
