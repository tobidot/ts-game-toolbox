import type { Puppet, PuppetDrawOptions } from "./Puppet";
import {
    MakeSoftCanvas,
    soft_row_texels,
    SoftGpu,
    SoftRun,
    write_soft_row,
} from "./SoftGpu";
import { skin_points, soft_matrices, SoftMesh } from "./SoftMesh";
import type { SoftSkin } from "./SoftSkin";

/** Where soft puppets are drawn: on the graphics card (WebGL 2) or on the CPU (canvas 2D). */
export type SoftDrawMode = "gpu" | "cpu";

export interface SoftLayerOptions {
    /** Default `"gpu"`: WebGL 2 where the browser has it, else the CPU (`fallback_reason` says why). */
    readonly prefer?: SoftDrawMode;
    /** Makes the canvas the GPU draws into; default a `<canvas>` (or an `OffscreenCanvas`), none in jsdom. */
    readonly make_canvas?: MakeSoftCanvas;
}

/** What the last `draw()` drew. */
export interface SoftLayerStats {
    readonly puppets: number;
    readonly triangles: number;
    /** Draw calls on the GPU; triangles drawn one by one on the CPU. */
    readonly calls: number;
    readonly mode: SoftDrawMode;
}

/** One puppet waiting to be drawn: its skin, its matrices placed on the canvas, how it looks. */
interface SoftEntry {
    puppet: Puppet;
    skin: SoftSkin;
    matrices: Float64Array;
    bone_count: number;
    look: number;
    alpha: number;
    grid: boolean;
    x: number;
    y: number;
    options: PuppetDrawOptions;
    /** `[left, top, right, bottom]` on the canvas, in its pixels: generous, for the GPU's scissor. */
    box: [number, number, number, number];
}

function default_canvas(
    width: number,
    height: number,
): HTMLCanvasElement | OffscreenCanvas | null {
    if (
        typeof navigator !== "undefined" &&
        navigator.userAgent.includes("jsdom")
    ) {
        return null;
    }
    if (typeof document !== "undefined") {
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

const shared_layers = new WeakMap<object, SoftLayer>();

/** How far a triangle is grown on the CPU, in canvas pixels, so neighbours leave no seam. */
const CPU_GROW = 0.5;

/**
 * Draws soft puppets (skins with `soft`), many at once: on the graphics card with WebGL 2 (each
 * point's four bones in the vertex shader, the bone matrices in a float texture, a run of puppets
 * sharing a mesh in one instanced call, the result laid onto the game's 2D canvas with one
 * `drawImage`), or on the CPU (the same points worked out in TypeScript, a coarser grid drawn
 * triangle by triangle on canvas 2D). Both draw the same; games never see WebGL.
 *
 * ```ts
 * const layer = new SoftLayer();                         // prefer: "gpu" by default
 * // every frame, in drawing order:
 * beast.draw(context, x, y, { layer, scale: 0.5 });      // waits in the layer
 * other.draw(context, x2, y, { layer });
 * layer.draw(context);                                   // all of them, in the order added
 * ```
 *
 * `puppet.draw(context, x, y)` without a layer draws at once through the context's own shared
 * layer (`SoftLayer.for_context`). `mode` says which path runs; `prefer` changes it at any time. A
 * lost WebGL context draws on the CPU until the browser gives it back.
 */
export class SoftLayer {
    private wanted: SoftDrawMode;
    private gpu: SoftGpu | null = null;
    private reason: string | null = null;
    private readonly make_canvas: MakeSoftCanvas;
    private entries: SoftEntry[] = [];
    private pool: SoftEntry[] = [];
    private rows = new Float32Array(0);
    private points = new Float64Array(0);
    private last: SoftLayerStats = {
        puppets: 0,
        triangles: 0,
        calls: 0,
        mode: "cpu",
    };

    public constructor(options: SoftLayerOptions = {}) {
        this.wanted = options.prefer ?? "gpu";
        this.make_canvas = options.make_canvas ?? default_canvas;
    }

    /** The layer every `puppet.draw(context, ...)` without a layer of its own uses, one per context. */
    public static for_context(context: object): SoftLayer {
        let layer = shared_layers.get(context);
        if (layer === undefined) {
            layer = new SoftLayer();
            shared_layers.set(context, layer);
        }
        return layer;
    }

    /** The path asked for; set it to change paths while running. */
    public get prefer(): SoftDrawMode {
        return this.wanted;
    }

    public set prefer(mode: SoftDrawMode) {
        this.wanted = mode;
        if (mode === "cpu" || this.gpu === null) {
            // Asked again for the GPU after it failed: try once more.
            this.reason = null;
        }
    }

    /** The path that draws now: `"gpu"` only when it was asked for and WebGL 2 runs. */
    public get mode(): SoftDrawMode {
        if (this.wanted === "cpu") {
            return "cpu";
        }
        const gpu = this.gpu_now();
        return gpu === null ? "cpu" : "gpu";
    }

    /** Why the GPU isn't drawing although asked for; null when nothing fell back. */
    public get fallback_reason(): string | null {
        if (this.wanted === "cpu") {
            return null;
        }
        this.gpu_now();
        return this.reason;
    }

    /** Puppets waiting for `draw()`. */
    public get pending(): number {
        return this.entries.length;
    }

    /** What the last `draw()` drew: puppets, triangles, calls and the path. */
    public get stats(): SoftLayerStats {
        return this.last;
    }

    /** The grid a puppet is drawn with now: the skin's `cell_size` on the GPU, `cpu_cell_size` on the CPU. */
    public cell_size_for(skin: SoftSkin): number {
        return this.mode === "gpu" ? skin.cell_size : skin.cpu_cell_size;
    }

    /**
     * Puts a soft puppet into the layer as it is posed now, placed as `draw()` would place it on
     * `context` (`x`, `y` the feet; `scale`, `flip_x`) under the context's transform. `grid` draws
     * its grid over it, `weights` shows each point's bones in their colours, `alpha` fades it.
     * False when the puppet wears no soft skin or its picture hasn't come.
     */
    public add(
        puppet: Puppet,
        context: CanvasRenderingContext2D,
        x: number,
        y: number,
        options: PuppetDrawOptions = {},
    ): boolean {
        const skin = puppet.skin?.soft ?? null;
        const inverse = skin?.rest_inverse ?? null;
        if (skin === null || inverse === null || skin.image === null) {
            return false;
        }
        const skeleton = puppet.skeleton;
        const bone_count = Math.min(skeleton.count, inverse.length / 6);
        const base = context.getTransform();
        const scale = options.scale ?? 1;
        const scale_x = options.flip_x === true ? -scale : scale;
        const placement: [number, number, number, number, number, number] = [
            base.a * scale_x,
            base.b * scale_x,
            base.c * scale,
            base.d * scale,
            base.a * x + base.c * y + base.e,
            base.b * x + base.d * y + base.f,
        ];
        const entry = this.pool.pop() ?? {
            puppet,
            skin,
            matrices: new Float64Array(0),
            bone_count: 0,
            look: 0,
            alpha: 1,
            grid: false,
            x: 0,
            y: 0,
            options: {},
            box: [0, 0, 0, 0],
        };
        if (entry.matrices.length < skeleton.count * 6) {
            entry.matrices = new Float64Array(skeleton.count * 6);
        }
        soft_matrices(skeleton, inverse, placement, entry.matrices);
        entry.puppet = puppet;
        entry.skin = skin;
        entry.bone_count = bone_count;
        entry.look = options.weights === true ? 1 : 0;
        entry.alpha = options.alpha ?? 1;
        entry.grid = options.grid === true;
        entry.x = x;
        entry.y = y;
        entry.options = options;
        // The box: every joint and tip on the canvas, grown by the picture's size.
        let left = Infinity;
        let top = Infinity;
        let right = -Infinity;
        let bottom = -Infinity;
        const tip = { x: 0, y: 0 };
        for (let bone = 0; bone < skeleton.count; bone++) {
            for (const along of [0, skeleton.lengths[bone]]) {
                skeleton.world_point(bone, along, 0, tip);
                const cx =
                    placement[0] * tip.x + placement[2] * tip.y + placement[4];
                const cy =
                    placement[1] * tip.x + placement[3] * tip.y + placement[5];
                left = Math.min(left, cx);
                right = Math.max(right, cx);
                top = Math.min(top, cy);
                bottom = Math.max(bottom, cy);
            }
        }
        const mesh = skin.mesh(skin.cpu_cell_size);
        let grow = 0;
        if (mesh !== null) {
            const [rest_left, rest_top, rest_right, rest_bottom] =
                mesh.rest_box();
            grow =
                Math.max(rest_right - rest_left, rest_bottom - rest_top) *
                Math.hypot(placement[0], placement[1]) *
                0.6;
        }
        entry.box[0] = left - grow;
        entry.box[1] = top - grow;
        entry.box[2] = right + grow;
        entry.box[3] = bottom + grow;
        this.entries.push(entry);
        return true;
    }

    /**
     * Draws every puppet added since the last `draw()`, in the order added, onto `context` (its
     * transform and state left as they were), then empties the layer. Grids and bones asked for
     * are drawn over them.
     */
    public draw(context: CanvasRenderingContext2D): void {
        const entries = this.entries;
        if (entries.length === 0) {
            this.last = { puppets: 0, triangles: 0, calls: 0, mode: this.mode };
            return;
        }
        let drawn = false;
        const gpu = this.wanted === "gpu" ? this.gpu_now() : null;
        if (gpu !== null) {
            try {
                this.draw_gpu(gpu, context);
                drawn = true;
            } catch (error) {
                // A picture the card may not read (another origin), or a card that gave up.
                this.reason = `the GPU could not draw: ${error instanceof Error ? error.message : String(error)}`;
                this.gpu?.destroy();
                this.gpu = null;
            }
        }
        if (!drawn) {
            this.draw_cpu(context);
        }
        this.draw_overlays(context);
        for (const entry of entries) {
            this.pool.push(entry);
        }
        this.entries = [];
    }

    /** Frees the graphics card's memory and forgets the puppets waiting. */
    public destroy(): void {
        this.gpu?.destroy();
        this.gpu = null;
        for (const entry of this.entries) {
            this.pool.push(entry);
        }
        this.entries = [];
    }

    /** The GPU path when it may draw now (made on first use); null for the CPU, with `reason` set. */
    private gpu_now(): SoftGpu | null {
        if (this.wanted === "cpu") {
            return null;
        }
        if (this.gpu === null && this.reason === null) {
            const made = SoftGpu.create(this.make_canvas);
            if (typeof made === "string") {
                this.reason = made;
            } else {
                this.gpu = made;
            }
        }
        const gpu = this.gpu;
        if (gpu === null) {
            return null;
        }
        if (gpu.take_restored()) {
            this.reason = null;
        }
        if (gpu.is_lost) {
            this.reason = "the WebGL context was lost";
            return null;
        }
        if (this.reason === "the WebGL context was lost") {
            this.reason = null;
        }
        return gpu;
    }

    private draw_gpu(gpu: SoftGpu, context: CanvasRenderingContext2D): void {
        const width = context.canvas.width;
        const height = context.canvas.height;
        let left = Infinity;
        let top = Infinity;
        let right = -Infinity;
        let bottom = -Infinity;
        let most_bones = 1;
        for (const entry of this.entries) {
            left = Math.min(left, entry.box[0]);
            top = Math.min(top, entry.box[1]);
            right = Math.max(right, entry.box[2]);
            bottom = Math.max(bottom, entry.box[3]);
            most_bones = Math.max(most_bones, entry.bone_count);
        }
        const box_left = Math.max(0, Math.floor(left));
        const box_top = Math.max(0, Math.floor(top));
        const box_right = Math.min(width, Math.ceil(right));
        const box_bottom = Math.min(height, Math.ceil(bottom));
        let triangles = 0;
        let calls = 0;
        const texels = soft_row_texels(most_bones);
        const per_batch = Math.max(1, gpu.most_rows);
        if (box_right > box_left && box_bottom > box_top) {
            for (
                let first = 0;
                first < this.entries.length;
                first += per_batch
            ) {
                const batch = this.entries.slice(first, first + per_batch);
                if (this.rows.length < batch.length * texels * 4) {
                    this.rows = new Float32Array(batch.length * texels * 4 * 2);
                }
                const runs: SoftRun[] = [];
                for (const [row, entry] of batch.entries()) {
                    write_soft_row(
                        this.rows,
                        row,
                        texels,
                        entry.matrices,
                        entry.bone_count,
                        entry.look,
                        entry.alpha,
                    );
                    const mesh = entry.skin.mesh(entry.skin.cell_size);
                    if (mesh === null) {
                        continue;
                    }
                    const last = runs[runs.length - 1];
                    if (
                        last !== undefined &&
                        last.mesh === mesh &&
                        last.first + last.count === row
                    ) {
                        runs[runs.length - 1] = {
                            ...last,
                            count: last.count + 1,
                        };
                    } else {
                        runs.push({
                            mesh,
                            skin: entry.skin,
                            first: row,
                            count: 1,
                        });
                    }
                    triangles += mesh.triangles.length / 3;
                }
                calls += runs.length;
                gpu.draw(
                    context,
                    this.rows,
                    batch.length,
                    texels,
                    runs,
                    width,
                    height,
                    [
                        box_left,
                        box_top,
                        box_right - box_left,
                        box_bottom - box_top,
                    ],
                );
            }
        }
        this.last = {
            puppets: this.entries.length,
            triangles,
            calls,
            mode: "gpu",
        };
    }

    private draw_cpu(context: CanvasRenderingContext2D): void {
        let triangles = 0;
        context.save();
        for (const entry of this.entries) {
            const skin = entry.skin;
            const mesh = skin.mesh(skin.cpu_cell_size);
            const image = skin.image;
            if (mesh === null || image === null) {
                continue;
            }
            const points = this.skinned(mesh, entry.matrices);
            context.globalAlpha = entry.alpha;
            triangles += draw_mesh_cpu(
                context,
                mesh,
                points,
                image,
                entry.look === 1,
            );
        }
        context.restore();
        this.last = {
            puppets: this.entries.length,
            triangles,
            calls: triangles,
            mode: "cpu",
        };
    }

    /** The grid and the bones asked for, over everything the layer drew. */
    private draw_overlays(context: CanvasRenderingContext2D): void {
        for (const entry of this.entries) {
            if (entry.grid) {
                const skin = entry.skin;
                const mesh = skin.mesh(
                    this.mode === "gpu" ? skin.cell_size : skin.cpu_cell_size,
                );
                if (mesh !== null) {
                    draw_grid(
                        context,
                        mesh,
                        this.skinned(mesh, entry.matrices),
                    );
                }
            }
            if (entry.options.debug === true) {
                entry.puppet.draw_bones(
                    context,
                    entry.x,
                    entry.y,
                    entry.options,
                );
            }
        }
    }

    /** The mesh's points where the entry's bones put them, in canvas pixels (a scratch array). */
    private skinned(mesh: SoftMesh, matrices: Float64Array): Float64Array {
        if (this.points.length < mesh.count * 2) {
            this.points = new Float64Array(mesh.count * 2);
        }
        return skin_points(mesh, matrices, this.points);
    }
}

/**
 * Draws a skinned mesh on canvas 2D: each triangle of the atlas mapped onto its moved points with
 * one affine transform, clipped to the triangle (grown half a pixel, so no seam shows). With
 * `weights` each triangle is filled with its points' weight colour instead. Answers the triangles drawn.
 */
export function draw_mesh_cpu(
    context: CanvasRenderingContext2D,
    mesh: SoftMesh,
    points: Float64Array,
    image: CanvasImageSource,
    weights: boolean,
): number {
    const triangles = mesh.triangles;
    const uv = mesh.uv;
    let drawn = 0;
    for (let index = 0; index < triangles.length; index += 3) {
        const p0 = triangles[index];
        const p1 = triangles[index + 1];
        const p2 = triangles[index + 2];
        const u0 = uv[p0 * 2];
        const v0 = uv[p0 * 2 + 1];
        const du1 = uv[p1 * 2] - u0;
        const dv1 = uv[p1 * 2 + 1] - v0;
        const du2 = uv[p2 * 2] - u0;
        const dv2 = uv[p2 * 2 + 1] - v0;
        const determinant = du1 * dv2 - du2 * dv1;
        if (determinant === 0) {
            continue;
        }
        const x0 = points[p0 * 2];
        const y0 = points[p0 * 2 + 1];
        const x1 = points[p1 * 2];
        const y1 = points[p1 * 2 + 1];
        const x2 = points[p2 * 2];
        const y2 = points[p2 * 2 + 1];
        context.setTransform(1, 0, 0, 1, 0, 0);
        context.save();
        context.beginPath();
        trace_grown(context, x0, y0, x1, y1, x2, y2, CPU_GROW);
        if (weights) {
            const c0 = p0 * 3;
            const c1 = p1 * 3;
            const c2 = p2 * 3;
            const colors = mesh.colors;
            const r = Math.round(
                ((colors[c0] + colors[c1] + colors[c2]) / 3) * 255,
            );
            const g = Math.round(
                ((colors[c0 + 1] + colors[c1 + 1] + colors[c2 + 1]) / 3) * 255,
            );
            const b = Math.round(
                ((colors[c0 + 2] + colors[c1 + 2] + colors[c2 + 2]) / 3) * 255,
            );
            context.fillStyle = `rgb(${r}, ${g}, ${b})`;
            context.fill();
            context.restore();
            drawn += 1;
            continue;
        }
        context.clip();
        const dx1 = x1 - x0;
        const dy1 = y1 - y0;
        const dx2 = x2 - x0;
        const dy2 = y2 - y0;
        // The affine map from the atlas's pixels onto the moved triangle.
        const a = (dx1 * dv2 - dx2 * dv1) / determinant;
        const b = (dy1 * dv2 - dy2 * dv1) / determinant;
        const c = (dx2 * du1 - dx1 * du2) / determinant;
        const d = (dy2 * du1 - dy1 * du2) / determinant;
        const e = x0 - a * u0 - c * v0;
        const f = y0 - b * u0 - d * v0;
        context.setTransform(a, b, c, d, e, f);
        // Only the triangle's own corner of the atlas, a pixel larger.
        const left = Math.floor(Math.min(u0, u0 + du1, u0 + du2)) - 1;
        const top = Math.floor(Math.min(v0, v0 + dv1, v0 + dv2)) - 1;
        const right = Math.ceil(Math.max(u0, u0 + du1, u0 + du2)) + 1;
        const bottom = Math.ceil(Math.max(v0, v0 + dv1, v0 + dv2)) + 1;
        context.drawImage(
            image,
            left,
            top,
            right - left,
            bottom - top,
            left,
            top,
            right - left,
            bottom - top,
        );
        context.restore();
        drawn += 1;
    }
    return drawn;
}

/** The mesh's edges as thin lines, in canvas pixels (the transform set to none while drawing). */
export function draw_grid(
    context: CanvasRenderingContext2D,
    mesh: SoftMesh,
    points: Float64Array,
    color = "rgba(255, 255, 255, 0.55)",
): void {
    const triangles = mesh.triangles;
    context.save();
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.strokeStyle = color;
    context.lineWidth = 1;
    context.beginPath();
    for (let index = 0; index < triangles.length; index += 3) {
        const a = triangles[index] * 2;
        const b = triangles[index + 1] * 2;
        const c = triangles[index + 2] * 2;
        context.moveTo(points[a], points[a + 1]);
        context.lineTo(points[b], points[b + 1]);
        context.lineTo(points[c], points[c + 1]);
        context.closePath();
    }
    context.stroke();
    context.restore();
}

function trace_grown(
    context: CanvasRenderingContext2D,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    grow: number,
): void {
    const middle_x = (x0 + x1 + x2) / 3;
    const middle_y = (y0 + y1 + y2) / 3;
    const out = (x: number, y: number): [number, number] => {
        const dx = x - middle_x;
        const dy = y - middle_y;
        const length = Math.hypot(dx, dy) || 1;
        return [x + (dx / length) * grow, y + (dy / length) * grow];
    };
    const [ax, ay] = out(x0, y0);
    const [bx, by] = out(x1, y1);
    const [cx, cy] = out(x2, y2);
    context.moveTo(ax, ay);
    context.lineTo(bx, by);
    context.lineTo(cx, cy);
    context.closePath();
}
