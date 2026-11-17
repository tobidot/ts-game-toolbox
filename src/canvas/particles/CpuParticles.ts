import { ParticleRaster } from "./ParticleRaster";
import { drift, ParticleStore } from "./ParticleStore";

/** Which backend moves and paints the particles. */
export type ParticleBackendName = "gpu" | "cpu";

/** What a canvas is made for: the GPU's drawing, or the CPU's raster. */
export type CanvasPurpose = "gpu" | "raster";

/** A canvas for the GPU's drawing or the CPU's raster; null where there is none. */
export type MakeCanvas = (
    width: number,
    height: number,
    purpose: CanvasPurpose,
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

/** Particles fainter than this aren't drawn. */
const FAINTEST = 1 / 255;

/** The canvas the raster is put onto, and its pixels. */
interface RasterTarget {
    readonly canvas: HTMLCanvasElement | OffscreenCanvas;
    readonly context:
        | CanvasRenderingContext2D
        | OffscreenCanvasRenderingContext2D;
    image: ImageData | null;
}

/**
 * The particles on the CPU: their motion in a typed array, stepped exactly like the GPU's
 * shader, and their picture in a `ParticleRaster`: the normal ones splatted and put on with
 * `"source-over"`, then the glowing ones with `"lighter"`, one `putImageData` and one
 * `drawImage` each, as the GPU's canvas is. Where no canvas can be made (tests), each particle
 * is a square of its colour instead.
 */
export class CpuParticles implements ParticleBackend {
    public readonly name = "cpu" as const;
    public readonly is_lost = false;
    /** x, y, vx, vy of every slot, now. */
    private readonly state: Float32Array;
    /** Slots of the glowing particles in this frame, painted after the others. */
    private readonly glowing: Int32Array;
    private readonly raster = new ParticleRaster();
    private target: RasterTarget | null | undefined = undefined;

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
        const target = this.raster_target();
        if (target === null) {
            this.draw_squares(store, context);
            return;
        }
        const width = context.canvas.width;
        const height = context.canvas.height;
        this.raster.resize(width, height);
        const transform = context.getTransform();
        const { b, d, capacity } = store;
        const now = store.time;
        let glowing = 0;
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
            this.splat(store, transform, slot, age / b[at + 1], false);
        }
        this.put(target, context, "source-over");
        for (let index = 0; index < glowing; index++) {
            const slot = this.glowing[index];
            const at = slot * 4;
            this.splat(store, transform, slot, (now - b[at]) / b[at + 1], true);
        }
        this.put(target, context, "lighter");
    }

    public destroy(): void {
        this.target = undefined;
    }

    /** The canvas the raster is put onto, made at the first draw; null where none can be made. */
    private raster_target(): RasterTarget | null {
        if (this.target === undefined) {
            const canvas = this.make_canvas(1, 1, "raster");
            const context =
                canvas === null
                    ? null
                    : (canvas.getContext("2d") as
                          | CanvasRenderingContext2D
                          | OffscreenCanvasRenderingContext2D
                          | null);
            this.target =
                canvas === null || context === null
                    ? null
                    : { canvas, context, image: null };
        }
        return this.target;
    }

    /** One particle at `life` (0 birth, 1 death) into the raster, placed by the context's transform. */
    private splat(
        store: ParticleStore,
        transform: DOMMatrix,
        slot: number,
        life: number,
        glow: boolean,
    ): void {
        const at = slot * 4;
        const c = store.c;
        const d = store.d;
        const alpha = Math.min(1, d[at] + (d[at + 1] - d[at]) * life);
        if (alpha < FAINTEST) {
            return;
        }
        const size = c[at + 2] + (c[at + 3] - c[at + 2]) * life;
        if (!(size > 0)) {
            return;
        }
        const x = this.state[at];
        const y = this.state[at + 1];
        const birth = c[at];
        const death = c[at + 1];
        const fresh = (1 - life) / 255;
        const old = life / 255;
        this.raster.splat(
            transform.a * x + transform.c * y + transform.e,
            transform.b * x + transform.d * y + transform.f,
            size * Math.hypot(transform.a, transform.b),
            ((birth >> 16) & 255) * fresh + ((death >> 16) & 255) * old,
            ((birth >> 8) & 255) * fresh + ((death >> 8) & 255) * old,
            (birth & 255) * fresh + (death & 255) * old,
            alpha,
            glow,
        );
    }

    /** The touched part of the raster onto `context` with `composite`, then the raster empties. */
    private put(
        target: RasterTarget,
        context: CanvasRenderingContext2D,
        composite: GlobalCompositeOperation,
    ): void {
        const raster = this.raster;
        if (raster.is_empty) {
            return;
        }
        const { width, height } = raster;
        if (target.canvas.width !== width || target.canvas.height !== height) {
            target.canvas.width = width;
            target.canvas.height = height;
            target.image = null;
        }
        if (target.image === null) {
            target.image = target.context.createImageData(width, height);
        }
        raster.write_into(target.image.data);
        const left = raster.left;
        const top = raster.top;
        const across = raster.right - left;
        const down = raster.bottom - top;
        target.context.putImageData(
            target.image,
            0,
            0,
            left,
            top,
            across,
            down,
        );
        context.save();
        context.setTransform(1, 0, 0, 1, 0, 0);
        context.globalAlpha = 1;
        context.globalCompositeOperation = composite;
        context.drawImage(
            target.canvas,
            left,
            top,
            across,
            down,
            left,
            top,
            across,
            down,
        );
        context.restore();
        raster.clear();
    }

    /** Without a canvas for the raster: each particle a square of its colour, under the context's transform. */
    private draw_squares(
        store: ParticleStore,
        context: CanvasRenderingContext2D,
    ): void {
        const { b, d, capacity } = store;
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
            this.square(store, context, slot, age / b[at + 1]);
        }
        if (glowing > 0) {
            context.globalCompositeOperation = "lighter";
            for (let index = 0; index < glowing; index++) {
                const slot = this.glowing[index];
                const at = slot * 4;
                this.square(store, context, slot, (now - b[at]) / b[at + 1]);
            }
        }
        context.restore();
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

    /** One particle at `life` as a square. */
    private square(
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
        context.globalAlpha = Math.min(1, alpha);
        context.fillStyle = `rgb(${Math.round(red)}, ${Math.round(green)}, ${Math.round(blue)})`;
        context.fillRect(
            this.state[at] - size / 2,
            this.state[at + 1] - size / 2,
            size,
            size,
        );
    }
}
