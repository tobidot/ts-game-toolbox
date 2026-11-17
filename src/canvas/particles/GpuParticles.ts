import { MakeCanvas, ParticleBackend } from "./CpuParticles";
import { PARTICLE_ROW, ParticleStore } from "./ParticleStore";
import {
    DRAW_FRAGMENT,
    DRAW_VERTEX,
    FULL_SCREEN_VERTEX,
    UPDATE_FRAGMENT,
} from "./shaders";

/**
 * What every shader starts with: the version, full precision, and the numbers the TypeScript
 * owns. GLSL ES samplers default to lowp: without `highp sampler2D` an NVIDIA card under ANGLE
 * reads the float textures as 16-bit floats (colours over 65 504 became infinite, positions
 * lost their fractions), while SwiftShader reads them whole. Measured in step 33.
 */
const SHADER_HEADER = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
#define ROW ${PARTICLE_ROW}
`;

/** A shader program and its uniform locations by name. */
class Program {
    public readonly program: WebGLProgram;
    private readonly locations = new Map<string, WebGLUniformLocation | null>();

    public constructor(
        private readonly gl: WebGL2RenderingContext,
        vertex: string,
        fragment: string,
    ) {
        const program = gl.createProgram();
        if (program === null) {
            throw new Error("no shader program");
        }
        gl.attachShader(
            program,
            Program.compile(gl, gl.VERTEX_SHADER, SHADER_HEADER + vertex),
        );
        gl.attachShader(
            program,
            Program.compile(gl, gl.FRAGMENT_SHADER, SHADER_HEADER + fragment),
        );
        gl.linkProgram(program);
        if (gl.getProgramParameter(program, gl.LINK_STATUS) !== true) {
            throw new Error(gl.getProgramInfoLog(program) ?? "link failed");
        }
        this.program = program;
    }

    private static compile(
        gl: WebGL2RenderingContext,
        type: number,
        source: string,
    ): WebGLShader {
        const shader = gl.createShader(type);
        if (shader === null) {
            throw new Error("no shader");
        }
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (gl.getShaderParameter(shader, gl.COMPILE_STATUS) !== true) {
            throw new Error(gl.getShaderInfoLog(shader) ?? "compile failed");
        }
        return shader;
    }

    public at(name: string): WebGLUniformLocation | null {
        if (!this.locations.has(name)) {
            this.locations.set(
                name,
                this.gl.getUniformLocation(this.program, name),
            );
        }
        return this.locations.get(name) ?? null;
    }
}

/** The GPU backend, or why there is none. */
export type GpuParticlesOrReason = GpuParticles | string;

/**
 * The particles on the graphics card (WebGL 2), lifted from Last Energy in Space 0.11.0's light.
 * Every slot is one texel of four RGBA float textures laid out as the store's arrays: the motion
 * (x, y, vx, vy) in two of them, stepped from one into the other by a full-screen pass over the
 * rows of the window; birth, colours and sizes in three more, written once when a particle is
 * born. The card never sends anything back: the store counts the living. Drawing renders the
 * points into a WebGL canvas of its own, normal ones and glowing ones apart, and puts each onto
 * the game's 2D context with one `drawImage` (`"source-over"` and `"lighter"`).
 */
export class GpuParticles implements ParticleBackend {
    public readonly name = "gpu" as const;
    private lost = false;
    private readonly rows: number;
    private readonly motion: [WebGLTexture, WebGLTexture];
    private readonly motion_buffers: [WebGLFramebuffer, WebGLFramebuffer];
    private current = 0;
    private readonly births: WebGLTexture;
    private readonly looks: WebGLTexture;
    private readonly fades: WebGLTexture;
    private readonly update_program: Program;
    private readonly draw_program: Program;
    private readonly vertex_array: WebGLVertexArrayObject;
    private readonly max_point: number;
    /** x, y, vx, vy worked out from the births, for `adopt()`. */
    private scratch: Float32Array | null = null;

    /** The canvas's WebGL 2 context, or null; some browsers throw instead. */
    private static context_of(
        canvas: HTMLCanvasElement | OffscreenCanvas,
    ): WebGL2RenderingContext | null {
        try {
            return canvas.getContext("webgl2", {
                alpha: true,
                // eslint-disable-next-line @typescript-eslint/naming-convention -- DOM name
                premultipliedAlpha: true,
                antialias: false,
                depth: false,
                stencil: false,
                // eslint-disable-next-line @typescript-eslint/naming-convention -- DOM name
                preserveDrawingBuffer: false,
            }) as WebGL2RenderingContext | null;
        } catch {
            return null;
        }
    }

    /** The GPU backend, or why there is none: no canvas, no WebGL 2, no float render targets, a shader that fails. */
    public static create(
        capacity: number,
        make_canvas: MakeCanvas,
    ): GpuParticlesOrReason {
        const canvas = make_canvas(1, 1);
        if (canvas === null) {
            return "no canvas to draw on here";
        }
        const gl = GpuParticles.context_of(canvas);
        if (gl === null) {
            return "WebGL 2 is missing";
        }
        if (gl.getExtension("EXT_color_buffer_float") === null) {
            return "float render targets are missing (EXT_color_buffer_float)";
        }
        try {
            return new GpuParticles(canvas, gl, capacity);
        } catch (error) {
            return `the GPU set-up failed: ${error instanceof Error ? error.message : String(error)}`;
        }
    }

    private constructor(
        public readonly canvas: HTMLCanvasElement | OffscreenCanvas,
        private readonly gl: WebGL2RenderingContext,
        capacity: number,
    ) {
        canvas.addEventListener("webglcontextlost", () => {
            this.lost = true;
        });
        this.rows = capacity / PARTICLE_ROW;
        this.motion = [this.float_texture(), this.float_texture()];
        this.motion_buffers = [
            this.frame_buffer(this.motion[0]),
            this.frame_buffer(this.motion[1]),
        ];
        this.births = this.float_texture();
        this.looks = this.float_texture();
        this.fades = this.float_texture();
        this.update_program = new Program(
            gl,
            FULL_SCREEN_VERTEX,
            UPDATE_FRAGMENT,
        );
        this.draw_program = new Program(gl, DRAW_VERTEX, DRAW_FRAGMENT);
        const vertex_array = gl.createVertexArray();
        if (vertex_array === null) {
            throw new Error("no vertex array");
        }
        this.vertex_array = vertex_array;
        const range = gl.getParameter(
            gl.ALIASED_POINT_SIZE_RANGE,
        ) as Float32Array;
        this.max_point = range[1];
    }

    public get is_lost(): boolean {
        return this.lost || this.gl.isContextLost();
    }

    private float_texture(): WebGLTexture {
        const gl = this.gl;
        const texture = gl.createTexture();
        if (texture === null) {
            throw new Error("no texture");
        }
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA32F, PARTICLE_ROW, this.rows);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        return texture;
    }

    private frame_buffer(texture: WebGLTexture): WebGLFramebuffer {
        const gl = this.gl;
        const buffer = gl.createFramebuffer();
        if (buffer === null) {
            throw new Error("no frame buffer");
        }
        gl.bindFramebuffer(gl.FRAMEBUFFER, buffer);
        gl.framebufferTexture2D(
            gl.FRAMEBUFFER,
            gl.COLOR_ATTACHMENT0,
            gl.TEXTURE_2D,
            texture,
            0,
        );
        if (
            gl.checkFramebufferStatus(gl.FRAMEBUFFER) !==
            gl.FRAMEBUFFER_COMPLETE
        ) {
            throw new Error("a float frame buffer is not complete");
        }
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        return buffer;
    }

    public adopt(store: ParticleStore): void {
        const capacity = store.capacity;
        if (this.scratch === null) {
            this.scratch = new Float32Array(capacity * 4);
        }
        const scratch = this.scratch;
        for (let index = store.tail; index < store.head; index++) {
            const slot = index % capacity;
            store.state_now(slot, scratch, slot * 4);
        }
        const gl = this.gl;
        const write = (texture: WebGLTexture, data: Float32Array) => {
            gl.bindTexture(gl.TEXTURE_2D, texture);
            gl.texSubImage2D(
                gl.TEXTURE_2D,
                0,
                0,
                0,
                PARTICLE_ROW,
                this.rows,
                gl.RGBA,
                gl.FLOAT,
                data,
            );
        };
        write(this.motion[this.current], scratch);
        write(this.births, store.b);
        write(this.looks, store.c);
        write(this.fades, store.d);
        store.take_fresh();
    }

    /** Writes the births made since the last frame into their slots, row piece by row piece. */
    private take_fresh(store: ParticleStore): void {
        const [from, to] = store.take_fresh();
        if (to <= from) {
            return;
        }
        const pieces: Array<[number, number]> = [];
        const capacity = store.capacity;
        let slot = from % capacity;
        let left = to - from;
        while (left > 0) {
            const run = Math.min(left, capacity - slot);
            pieces.push([slot, run]);
            left -= run;
            slot = 0;
        }
        this.write_pieces(this.motion[this.current], store.a, pieces);
        this.write_pieces(this.births, store.b, pieces);
        this.write_pieces(this.looks, store.c, pieces);
        this.write_pieces(this.fades, store.d, pieces);
    }

    /** `pieces` are runs of slots that don't wrap: a part row, whole rows, a part row. */
    private write_pieces(
        texture: WebGLTexture,
        data: Float32Array,
        pieces: ReadonlyArray<[number, number]>,
    ): void {
        const gl = this.gl;
        gl.bindTexture(gl.TEXTURE_2D, texture);
        for (const [first, length] of pieces) {
            let slot = first;
            let left = length;
            while (left > 0) {
                const column = slot % PARTICLE_ROW;
                const row = Math.floor(slot / PARTICLE_ROW);
                let width: number;
                let height: number;
                if (column !== 0 || left < PARTICLE_ROW) {
                    width = Math.min(PARTICLE_ROW - column, left);
                    height = 1;
                } else {
                    width = PARTICLE_ROW;
                    height = Math.floor(left / PARTICLE_ROW);
                }
                gl.texSubImage2D(
                    gl.TEXTURE_2D,
                    0,
                    column,
                    row,
                    width,
                    height,
                    gl.RGBA,
                    gl.FLOAT,
                    data,
                    slot * 4,
                );
                slot += width * height;
                left -= width * height;
            }
        }
    }

    /** The rows that hold the window: one band, or two when it wraps. */
    private window_bands(store: ParticleStore): Array<[number, number]> {
        const window = store.window;
        if (window <= 0) {
            return [];
        }
        if (window >= store.capacity) {
            return [[0, this.rows]];
        }
        const first = store.tail % store.capacity;
        const last = (store.head - 1) % store.capacity;
        const first_row = Math.floor(first / PARTICLE_ROW);
        const last_row = Math.floor(last / PARTICLE_ROW);
        if (first <= last) {
            return [[first_row, last_row - first_row + 1]];
        }
        return [
            [first_row, this.rows - first_row],
            [0, last_row + 1],
        ];
    }

    public update(store: ParticleStore, dt: number): void {
        if (this.is_lost) {
            return;
        }
        this.take_fresh(store);
        const bands = this.window_bands(store);
        if (bands.length === 0) {
            return;
        }
        const gl = this.gl;
        const read = this.current;
        const write = 1 - read;
        const program = this.update_program;
        gl.useProgram(program.program);
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.motion_buffers[write]);
        gl.viewport(0, 0, PARTICLE_ROW, this.rows);
        gl.disable(gl.BLEND);
        this.bind_texture(0, this.motion[read], program, "u_a");
        this.bind_texture(1, this.births, program, "u_b");
        gl.uniform1f(program.at("u_time"), store.time + dt);
        gl.uniform1f(program.at("u_dt"), dt);
        gl.bindVertexArray(this.vertex_array);
        gl.enable(gl.SCISSOR_TEST);
        for (const [row, height] of bands) {
            gl.scissor(0, row, PARTICLE_ROW, height);
            gl.drawArrays(gl.TRIANGLES, 0, 3);
        }
        gl.disable(gl.SCISSOR_TEST);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        this.current = write;
    }

    private bind_texture(
        unit: number,
        texture: WebGLTexture,
        program: Program,
        name: string,
    ): void {
        const gl = this.gl;
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.uniform1i(program.at(name), unit);
    }

    public draw(store: ParticleStore, context: CanvasRenderingContext2D): void {
        if (this.is_lost) {
            return;
        }
        this.take_fresh(store);
        if (store.count === 0) {
            return;
        }
        const canvas = this.canvas;
        const width = context.canvas.width;
        const height = context.canvas.height;
        if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width;
            canvas.height = height;
        }
        const transform = context.getTransform();
        context.save();
        context.setTransform(1, 0, 0, 1, 0, 0);
        if (store.alive[0] > 0) {
            this.draw_points(store, transform, width, height, 0);
            context.globalCompositeOperation = "source-over";
            context.drawImage(canvas, 0, 0);
        }
        if (store.alive[1] > 0) {
            this.draw_points(store, transform, width, height, 1);
            context.globalCompositeOperation = "lighter";
            context.drawImage(canvas, 0, 0);
        }
        context.restore();
    }

    /** The window's particles of one blend as points, into the WebGL canvas. */
    private draw_points(
        store: ParticleStore,
        transform: DOMMatrix,
        width: number,
        height: number,
        blend: number,
    ): void {
        const gl = this.gl;
        const program = this.draw_program;
        gl.useProgram(program.program);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, width, height);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.enable(gl.BLEND);
        if (blend === 1) {
            gl.blendFunc(gl.ONE, gl.ONE);
        } else {
            gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        }
        this.bind_texture(0, this.motion[this.current], program, "u_a");
        this.bind_texture(1, this.births, program, "u_b");
        this.bind_texture(2, this.looks, program, "u_c");
        this.bind_texture(3, this.fades, program, "u_d");
        gl.uniform1i(program.at("u_first"), store.tail % store.capacity);
        gl.uniform1i(program.at("u_capacity"), store.capacity);
        gl.uniform1f(program.at("u_time"), store.time);
        gl.uniform1f(program.at("u_blend"), blend);
        gl.uniformMatrix3fv(
            program.at("u_world_to_pixel"),
            false,
            new Float32Array([
                transform.a,
                transform.b,
                0,
                transform.c,
                transform.d,
                0,
                transform.e,
                transform.f,
                1,
            ]),
        );
        gl.uniform2f(program.at("u_pixels"), width, height);
        gl.uniform1f(
            program.at("u_pixels_per_unit"),
            Math.hypot(transform.a, transform.b),
        );
        gl.uniform1f(program.at("u_max_point"), this.max_point);
        gl.bindVertexArray(this.vertex_array);
        gl.drawArrays(gl.POINTS, 0, store.window);
        gl.disable(gl.BLEND);
    }

    public destroy(): void {
        const gl = this.gl;
        if (gl.isContextLost()) {
            return;
        }
        for (const texture of [
            ...this.motion,
            this.births,
            this.looks,
            this.fades,
        ]) {
            gl.deleteTexture(texture);
        }
        for (const buffer of this.motion_buffers) {
            gl.deleteFramebuffer(buffer);
        }
        gl.deleteProgram(this.update_program.program);
        gl.deleteProgram(this.draw_program.program);
        gl.deleteVertexArray(this.vertex_array);
        gl.getExtension("WEBGL_lose_context")?.loseContext();
    }
}
