import { drift, ParticleStore } from "./ParticleStore";

/** Which backend moves and paints the particles. */
export type ParticleBackendName = "gpu" | "cpu";

/** A canvas for the GPU's drawing or the CPU's dot pictures; null where there is none. */
export type MakeCanvas = (
    width: number,
    height: number,
) => HTMLCanvasElement | OffscreenCanvas | null;

/** What `Particles` asks of a backend; the store holds the births, the backend the motion. */
export interface ParticleBackend {
    readonly name: ParticleBackendName;
    /** Lost its device (a WebGL context loss): `Particles` changes to the CPU. */
    readonly is_lost: boolean;
    /** Takes over every living particle where it is now (after a change of backend). */
    adopt(store: ParticleStore): void;
    /** Moves every particle `dt` seconds on; the store's clock is still at the start of the step. */
    update(store: ParticleStore, dt: number): void;
    draw(store: ParticleStore, context: CanvasRenderingContext2D): void;
    destroy(): void;
}

/** Side of a dot picture in pixels; dots are drawn scaled. */
const DOT_PIXELS = 32;
/** Colour channels are cut to 5 bits for the dot pictures: at most 32 768 of them. */
const CHANNEL_STEPS = 31;
/** More dot pictures than this and the cache starts over. */
const MAX_DOTS = 512;
/** Particles fainter than this aren't drawn. */
const FAINTEST = 1 / 255;

/** A soft round dot in one colour: full in the middle, (1 - r²)² towards the rim, as the GPU's. */
function dot_picture(
    make_canvas: MakeCanvas,
    red: number,
    green: number,
    blue: number,
): CanvasImageSource | null {
    const canvas = make_canvas(DOT_PIXELS, DOT_PIXELS);
    if (canvas === null) {
        return null;
    }
    canvas.width = DOT_PIXELS;
    canvas.height = DOT_PIXELS;
    const context = canvas.getContext("2d") as
        | CanvasRenderingContext2D
        | OffscreenCanvasRenderingContext2D
        | null;
    if (context === null) {
        return null;
    }
    const half = DOT_PIXELS / 2;
    const gradient = context.createRadialGradient(
        half,
        half,
        0,
        half,
        half,
        half,
    );
    for (const r of [0, 0.25, 0.5, 0.7, 0.85, 1]) {
        const fall = (1 - r * r) * (1 - r * r);
        gradient.addColorStop(
            r,
            `rgba(${red}, ${green}, ${blue}, ${fall.toFixed(4)})`,
        );
    }
    context.fillStyle = gradient;
    context.fillRect(0, 0, DOT_PIXELS, DOT_PIXELS);
    return canvas;
}

/**
 * The particles on the CPU: their motion in a typed array, stepped exactly like the GPU's
 * shader, painted as soft dots (one small picture per colour, cut to 5 bits a channel) or, where
 * no canvas can be made, as squares. Normal particles first, then the glowing ones with
 * `"lighter"`.
 */
export class CpuParticles implements ParticleBackend {
    public readonly name = "cpu" as const;
    public readonly is_lost = false;
    /** x, y, vx, vy of every slot, now. */
    private readonly state: Float32Array;
    /** Slots of the glowing particles in this frame, painted after the others. */
    private readonly glowing: Int32Array;
    private readonly dots = new Map<number, CanvasImageSource | null>();
    private can_make_dots = true;

    public constructor(
        capacity: number,
        private readonly make_canvas: MakeCanvas,
    ) {
        this.state = new Float32Array(capacity * 4);
        this.glowing = new Int32Array(capacity);
    }

    public adopt(store: ParticleStore): void {
        for (let index = store.tail; index < store.head; index++) {
            const slot = index % store.capacity;
            store.state_now(slot, this.state, slot * 4);
        }
        store.take_fresh();
    }

    public update(store: ParticleStore, dt: number): void {
        this.take_fresh(store);
        const { state } = this;
        const b = store.b;
        const after = store.time + dt;
        const capacity = store.capacity;
        for (let index = store.tail; index < store.head; index++) {
            const at = (index % capacity) * 4;
            // Dead before this step began: left as it is (the shader does the same).
            if (after - b[at] > b[at + 1] + dt) {
                continue;
            }
            drift(state, at, b[at + 2], b[at + 3], dt);
        }
    }

    public draw(store: ParticleStore, context: CanvasRenderingContext2D): void {
        this.take_fresh(store);
        if (store.count === 0) {
            return;
        }
        const { b, capacity } = store;
        const d = store.d;
        const now = store.time;
        let glowing = 0;
        context.save();
        context.globalCompositeOperation = "source-over";
        for (let index = store.tail; index < store.head; index++) {
            const slot = index % capacity;
            const at = slot * 4;
            const age = now - b[at];
            if (age < 0 || age >= b[at + 1]) {
                continue;
            }
            if (d[at + 2] > 0.5) {
                this.glowing[glowing] = slot;
                glowing += 1;
                continue;
            }
            this.paint(store, context, slot, age / b[at + 1]);
        }
        if (glowing > 0) {
            context.globalCompositeOperation = "lighter";
            for (let index = 0; index < glowing; index++) {
                const slot = this.glowing[index];
                const at = slot * 4;
                this.paint(store, context, slot, (now - b[at]) / b[at + 1]);
            }
        }
        context.restore();
    }

    public destroy(): void {
        this.dots.clear();
    }

    /** Copies the births made since the last frame into the motion. */
    private take_fresh(store: ParticleStore): void {
        const [from, to] = store.take_fresh();
        const capacity = store.capacity;
        for (let index = from; index < to; index++) {
            const at = (index % capacity) * 4;
            this.state[at] = store.a[at];
            this.state[at + 1] = store.a[at + 1];
            this.state[at + 2] = store.a[at + 2];
            this.state[at + 3] = store.a[at + 3];
        }
    }

    /** One particle at `life` (0 birth, 1 death). */
    private paint(
        store: ParticleStore,
        context: CanvasRenderingContext2D,
        slot: number,
        life: number,
    ): void {
        const at = slot * 4;
        const c = store.c;
        const d = store.d;
        const alpha = d[at] + (d[at + 1] - d[at]) * life;
        if (alpha < FAINTEST) {
            return;
        }
        const size = c[at + 2] + (c[at + 3] - c[at + 2]) * life;
        if (!(size > 0)) {
            return;
        }
        const birth = c[at];
        const death = c[at + 1];
        const red =
            ((birth >> 16) & 255) * (1 - life) + ((death >> 16) & 255) * life;
        const green =
            ((birth >> 8) & 255) * (1 - life) + ((death >> 8) & 255) * life;
        const blue = (birth & 255) * (1 - life) + (death & 255) * life;
        const x = this.state[at];
        const y = this.state[at + 1];
        context.globalAlpha = Math.min(1, alpha);
        const dot = this.dot(red, green, blue);
        if (dot === null) {
            context.fillStyle = `rgb(${Math.round(red)}, ${Math.round(green)}, ${Math.round(blue)})`;
            context.fillRect(x - size / 2, y - size / 2, size, size);
            return;
        }
        context.drawImage(dot, x - size / 2, y - size / 2, size, size);
    }

    /** The dot picture for a colour, made at its first use; null where no canvas can be made. */
    private dot(
        red: number,
        green: number,
        blue: number,
    ): CanvasImageSource | null {
        if (!this.can_make_dots) {
            return null;
        }
        const r = Math.round((red / 255) * CHANNEL_STEPS);
        const g = Math.round((green / 255) * CHANNEL_STEPS);
        const b = Math.round((blue / 255) * CHANNEL_STEPS);
        const key = (r << 10) | (g << 5) | b;
        let dot = this.dots.get(key);
        if (dot === undefined) {
            if (this.dots.size >= MAX_DOTS) {
                this.dots.clear();
            }
            const scale = 255 / CHANNEL_STEPS;
            dot = dot_picture(
                this.make_canvas,
                Math.round(r * scale),
                Math.round(g * scale),
                Math.round(b * scale),
            );
            if (dot === null) {
                this.can_make_dots = false;
                return null;
            }
            this.dots.set(key, dot);
        }
        return dot;
    }
}
