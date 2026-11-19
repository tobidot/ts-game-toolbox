import { SOFT_BONES_PER_POINT, SoftMesh } from "./SoftMesh";
import type { SoftSkin } from "./SoftSkin";

/**
 * One soft puppet's row in the bone texture (RGBA float texels): texel 0 holds how it is drawn
 * (`[look, alpha, 0, 0]`, look 0 the picture, 1 the weights' colours), then two texels per bone:
 * `[a, b, c, d]` and `[e, f, 0, 0]` of its skinning matrix, the puppet's place on the canvas in it.
 */
export const SOFT_ROW_HEAD = 1;

/** The texels a row needs for `bones` bones. */
export function soft_row_texels(bones: number): number {
    return SOFT_ROW_HEAD + 2 * bones;
}

/**
 * Writes one puppet's row: its look and opacity, then its bones' matrices (six numbers each, as
 * `soft_matrices()` makes them) as 32-bit floats, the way the vertex shader reads them.
 */
export function write_soft_row(
    rows: Float32Array,
    row: number,
    row_texels: number,
    matrices: Float64Array,
    bone_count: number,
    look: number,
    alpha: number,
): void {
    const at = row * row_texels * 4;
    rows[at] = look;
    rows[at + 1] = alpha;
    rows[at + 2] = 0;
    rows[at + 3] = 0;
    for (let bone = 0; bone < bone_count; bone++) {
        const texel = at + (SOFT_ROW_HEAD + bone * 2) * 4;
        const m = bone * 6;
        rows[texel] = matrices[m];
        rows[texel + 1] = matrices[m + 1];
        rows[texel + 2] = matrices[m + 2];
        rows[texel + 3] = matrices[m + 3];
        rows[texel + 4] = matrices[m + 4];
        rows[texel + 5] = matrices[m + 5];
        rows[texel + 6] = 0;
        rows[texel + 7] = 0;
    }
}

/**
 * The vertex shader's skinning, line by line in TypeScript: point `point` of `mesh` placed by the
 * row `row` of the bone texture `rows`. The tests hold it against `skin_points()` (the CPU's), so
 * both paths put every point in the same place.
 */
export function skin_point_as_shader(
    rows: Float32Array,
    row_texels: number,
    row: number,
    mesh: SoftMesh,
    point: number,
): [number, number] {
    const fetch = (texel: number): [number, number, number, number] => {
        const at = (row * row_texels + texel) * 4;
        return [rows[at], rows[at + 1], rows[at + 2], rows[at + 3]];
    };
    // In the shader: a_rest, a_bones, a_weights are 32-bit attributes.
    const px = Math.fround(mesh.rest[point * 2]);
    const py = Math.fround(mesh.rest[point * 2 + 1]);
    let sum_x = 0;
    let sum_y = 0;
    for (let slot = 0; slot < SOFT_BONES_PER_POINT; slot++) {
        const weight = mesh.weights[point * 4 + slot];
        const bone = mesh.bones[point * 4 + slot];
        const m = fetch(SOFT_ROW_HEAD + 2 * bone);
        const t = fetch(SOFT_ROW_HEAD + 2 * bone + 1);
        sum_x += weight * (m[0] * px + m[2] * py + t[0]);
        sum_y += weight * (m[1] * px + m[3] * py + t[1]);
    }
    return [sum_x, sum_y];
}

const HEADER = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
precision highp usampler2D;
`;

/** The vertex shader: four bones per point from the row's matrices, as `skin_point_as_shader()`. */
export const SOFT_VERTEX = `
uniform sampler2D u_bones;
uniform int u_first_row;
uniform vec2 u_pixels;
uniform vec2 u_atlas;
in vec2 a_rest;
in vec2 a_uv;
in uvec4 a_bones;
in vec4 a_weights;
in vec3 a_color;
out vec2 v_uv;
out vec3 v_color;
flat out vec2 v_look;

vec2 skin(vec2 p, int row) {
    vec2 sum = vec2(0.0);
    for (int k = 0; k < 4; k++) {
        int bone = int(a_bones[k]);
        vec4 m = texelFetch(u_bones, ivec2(1 + 2 * bone, row), 0);
        vec4 t = texelFetch(u_bones, ivec2(2 + 2 * bone, row), 0);
        sum += a_weights[k] * vec2(m.x * p.x + m.z * p.y + t.x, m.y * p.x + m.w * p.y + t.y);
    }
    return sum;
}

void main() {
    int row = u_first_row + gl_InstanceID;
    vec4 head = texelFetch(u_bones, ivec2(0, row), 0);
    vec2 at = skin(a_rest, row);
    gl_Position = vec4(at.x / u_pixels.x * 2.0 - 1.0, 1.0 - at.y / u_pixels.y * 2.0, 0.0, 1.0);
    v_uv = a_uv / u_atlas;
    v_color = a_color;
    v_look = head.xy;
}
`;

/** The fragment shader: the atlas (premultiplied), or the weights' colour in its shape. */
export const SOFT_FRAGMENT = `
uniform sampler2D u_picture;
in vec2 v_uv;
in vec3 v_color;
flat in vec2 v_look;
out vec4 colour;

void main() {
    vec4 picture = texture(u_picture, v_uv);
    if (v_look.x > 0.5) {
        picture = vec4(v_color * picture.a, picture.a);
    }
    colour = picture * v_look.y;
}
`;

/** One run of puppets drawn with one call: the same mesh and picture, rows `first` to `first + count`. */
export interface SoftRun {
    readonly mesh: SoftMesh;
    readonly skin: SoftSkin;
    readonly first: number;
    readonly count: number;
}

/** Makes the canvas the GPU draws into; null where there is none. */
export type MakeSoftCanvas = (
    width: number,
    height: number,
) => HTMLCanvasElement | OffscreenCanvas | null;

interface MeshBuffers {
    readonly vertex_array: WebGLVertexArrayObject;
    readonly buffers: WebGLBuffer[];
    readonly index_count: number;
}

interface PictureTexture {
    readonly texture: WebGLTexture;
    readonly version: number;
    readonly width: number;
    readonly height: number;
}

/** What failed when the GPU couldn't be made: the reason, in words. */
export type SoftGpuOrReason = SoftGpu | string;

/**
 * Soft puppets on the graphics card (WebGL 2), following step 33's particles: a WebGL canvas of
 * its own, laid onto the game's 2D canvas with one `drawImage`. Every mesh is uploaded once (rest
 * points, atlas places, four bones and weights per point), every atlas once (with its bone maps
 * cleared); each frame only the bone texture changes, one row of matrices per puppet, and a run
 * of puppets sharing a mesh is one instanced draw call. A lost context comes back by itself
 * (`restored`): everything is uploaded again.
 */
export class SoftGpu {
    private gl: WebGL2RenderingContext;
    private program!: WebGLProgram;
    private locations = new Map<string, WebGLUniformLocation | null>();
    private bone_texture!: WebGLTexture;
    private texture_texels = 0;
    private texture_rows = 0;
    private meshes = new WeakMap<SoftMesh, MeshBuffers>();
    private pictures = new WeakMap<SoftSkin, PictureTexture>();
    private lost = false;
    private was_restored = false;
    private readonly max_texture: number;

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

    /** The GPU path, or why there is none: no canvas, no WebGL 2, a shader that fails. */
    public static create(make_canvas: MakeSoftCanvas): SoftGpuOrReason {
        const canvas = make_canvas(1, 1);
        if (canvas === null) {
            return "no canvas to draw on here";
        }
        const gl = SoftGpu.context_of(canvas);
        if (gl === null) {
            return "WebGL 2 is missing";
        }
        try {
            return new SoftGpu(canvas, gl);
        } catch (error) {
            return `the GPU set-up failed: ${error instanceof Error ? error.message : String(error)}`;
        }
    }

    private constructor(
        public readonly canvas: HTMLCanvasElement | OffscreenCanvas,
        gl: WebGL2RenderingContext,
    ) {
        this.gl = gl;
        this.max_texture = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
        canvas.addEventListener("webglcontextlost", (event) => {
            // Asked back: the browser restores it when it can.
            event.preventDefault();
            this.lost = true;
        });
        canvas.addEventListener("webglcontextrestored", () => {
            this.lost = false;
            this.was_restored = true;
        });
        this.set_up();
    }

    /** The context is lost now (drawing waits, a layer draws on the CPU meanwhile). */
    public get is_lost(): boolean {
        return this.lost || this.gl.isContextLost();
    }

    /** True once after a lost context came back and everything was uploaded again. */
    public take_restored(): boolean {
        if (!this.was_restored || this.gl.isContextLost()) {
            return false;
        }
        this.was_restored = false;
        this.set_up();
        return true;
    }

    /** The program and the bone texture, from nothing (again after a restore). */
    private set_up(): void {
        const gl = this.gl;
        this.locations.clear();
        this.meshes = new WeakMap();
        this.pictures = new WeakMap();
        const program = gl.createProgram();
        if (program === null) {
            throw new Error("no shader program");
        }
        gl.attachShader(program, this.compile(gl.VERTEX_SHADER, SOFT_VERTEX));
        gl.attachShader(
            program,
            this.compile(gl.FRAGMENT_SHADER, SOFT_FRAGMENT),
        );
        gl.bindAttribLocation(program, 0, "a_rest");
        gl.bindAttribLocation(program, 1, "a_uv");
        gl.bindAttribLocation(program, 2, "a_bones");
        gl.bindAttribLocation(program, 3, "a_weights");
        gl.bindAttribLocation(program, 4, "a_color");
        gl.linkProgram(program);
        if (gl.getProgramParameter(program, gl.LINK_STATUS) !== true) {
            throw new Error(gl.getProgramInfoLog(program) ?? "link failed");
        }
        this.program = program;
        const texture = gl.createTexture();
        if (texture === null) {
            throw new Error("no texture");
        }
        this.bone_texture = texture;
        this.texture_texels = 0;
        this.texture_rows = 0;
    }

    private compile(type: number, source: string): WebGLShader {
        const gl = this.gl;
        const shader = gl.createShader(type);
        if (shader === null) {
            throw new Error("no shader");
        }
        gl.shaderSource(shader, HEADER + source);
        gl.compileShader(shader);
        if (gl.getShaderParameter(shader, gl.COMPILE_STATUS) !== true) {
            throw new Error(gl.getShaderInfoLog(shader) ?? "compile failed");
        }
        return shader;
    }

    private at(name: string): WebGLUniformLocation | null {
        if (!this.locations.has(name)) {
            this.locations.set(
                name,
                this.gl.getUniformLocation(this.program, name),
            );
        }
        return this.locations.get(name) ?? null;
    }

    /** The most rows one bone texture holds: puppets per batch. */
    public get most_rows(): number {
        return this.max_texture;
    }

    /** Makes the bone texture large enough for `rows` rows of `texels`. */
    private bone_texture_for(texels: number, rows: number): void {
        if (texels <= this.texture_texels && rows <= this.texture_rows) {
            return;
        }
        const gl = this.gl;
        const width = Math.max(texels, this.texture_texels);
        let height = Math.max(64, this.texture_rows);
        while (height < rows) {
            height *= 2;
        }
        height = Math.min(height, this.max_texture);
        gl.deleteTexture(this.bone_texture);
        const texture = gl.createTexture();
        if (texture === null) {
            throw new Error("no texture");
        }
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA32F, width, height);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        this.bone_texture = texture;
        this.texture_texels = width;
        this.texture_rows = height;
    }

    /** The mesh's buffers, uploaded on first use. */
    private buffers_of(mesh: SoftMesh): MeshBuffers {
        const known = this.meshes.get(mesh);
        if (known !== undefined) {
            return known;
        }
        const gl = this.gl;
        const vertex_array = gl.createVertexArray();
        if (vertex_array === null) {
            throw new Error("no vertex array");
        }
        gl.bindVertexArray(vertex_array);
        const buffers: WebGLBuffer[] = [];
        const upload = (
            data: ArrayBufferView,
            target: number = gl.ARRAY_BUFFER,
        ): void => {
            const buffer = gl.createBuffer();
            if (buffer === null) {
                throw new Error("no buffer");
            }
            gl.bindBuffer(target, buffer);
            gl.bufferData(target, data, gl.STATIC_DRAW);
            buffers.push(buffer);
        };
        upload(Float32Array.from(mesh.rest));
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        upload(mesh.uv);
        gl.enableVertexAttribArray(1);
        gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 0, 0);
        upload(mesh.bones);
        gl.enableVertexAttribArray(2);
        gl.vertexAttribIPointer(2, 4, gl.UNSIGNED_BYTE, 0, 0);
        upload(mesh.weights);
        gl.enableVertexAttribArray(3);
        gl.vertexAttribPointer(3, 4, gl.FLOAT, false, 0, 0);
        upload(mesh.colors);
        gl.enableVertexAttribArray(4);
        gl.vertexAttribPointer(4, 3, gl.FLOAT, false, 0, 0);
        upload(mesh.triangles, gl.ELEMENT_ARRAY_BUFFER);
        gl.bindVertexArray(null);
        const made = {
            vertex_array,
            buffers,
            index_count: mesh.triangles.length,
        };
        this.meshes.set(mesh, made);
        return made;
    }

    /** The skin's atlas as a texture, uploaded once per picture (bone maps cleared). */
    private picture_of(skin: SoftSkin): PictureTexture | null {
        const known = this.pictures.get(skin);
        if (known !== undefined && known.version === skin.version) {
            return known;
        }
        const gl = this.gl;
        if (known !== undefined) {
            gl.deleteTexture(known.texture);
        }
        const texture = gl.createTexture();
        if (texture === null) {
            throw new Error("no texture");
        }
        // Unit 1 is the picture's: binding it on unit 0 would put it where the bones are read.
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
        const pixels = skin.texture_pixels;
        let width: number;
        let height: number;
        if (pixels !== null) {
            width = pixels.width;
            height = pixels.height;
            gl.texImage2D(
                gl.TEXTURE_2D,
                0,
                gl.RGBA,
                width,
                height,
                0,
                gl.RGBA,
                gl.UNSIGNED_BYTE,
                new Uint8Array(
                    pixels.data.buffer,
                    pixels.data.byteOffset,
                    pixels.data.byteLength,
                ),
            );
        } else {
            const image = skin.image;
            if (image === null) {
                gl.deleteTexture(texture);
                return null;
            }
            // May throw for a picture of another origin: the layer then draws on the CPU.
            gl.texImage2D(
                gl.TEXTURE_2D,
                0,
                gl.RGBA,
                gl.RGBA,
                gl.UNSIGNED_BYTE,
                image as TexImageSource,
            );
            const size = image as { width: number; height: number };
            width = size.width;
            height = size.height;
        }
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(
            gl.TEXTURE_2D,
            gl.TEXTURE_MIN_FILTER,
            gl.LINEAR_MIPMAP_LINEAR,
        );
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        const made = { texture, version: skin.version, width, height };
        this.pictures.set(skin, made);
        return made;
    }

    /**
     * Draws runs of puppets (their rows in `rows`, `row_texels` texels each) into the WebGL canvas
     * of `width` by `height` pixels, within the box `[x, y, w, h]` (top-left origin), and lays that
     * box onto `context`. The context's transform and state are left as they were.
     */
    public draw(
        context: CanvasRenderingContext2D,
        rows: Float32Array,
        row_count: number,
        row_texels: number,
        runs: readonly SoftRun[],
        width: number,
        height: number,
        box: readonly [number, number, number, number],
    ): void {
        const gl = this.gl;
        const canvas = this.canvas;
        if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width;
            canvas.height = height;
        }
        this.bone_texture_for(row_texels, row_count);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, width, height);
        const [box_x, box_y, box_w, box_h] = box;
        gl.enable(gl.SCISSOR_TEST);
        gl.scissor(box_x, height - box_y - box_h, box_w, box_h);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.useProgram(this.program);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.bone_texture);
        gl.texSubImage2D(
            gl.TEXTURE_2D,
            0,
            0,
            0,
            row_texels,
            row_count,
            gl.RGBA,
            gl.FLOAT,
            rows,
            0,
        );
        gl.uniform1i(this.at("u_bones"), 0);
        gl.uniform1i(this.at("u_picture"), 1);
        gl.uniform2f(this.at("u_pixels"), width, height);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        for (const run of runs) {
            const picture = this.picture_of(run.skin);
            if (picture === null) {
                continue;
            }
            const buffers = this.buffers_of(run.mesh);
            gl.activeTexture(gl.TEXTURE1);
            gl.bindTexture(gl.TEXTURE_2D, picture.texture);
            gl.uniform2f(this.at("u_atlas"), picture.width, picture.height);
            gl.uniform1i(this.at("u_first_row"), run.first);
            gl.bindVertexArray(buffers.vertex_array);
            gl.drawElementsInstanced(
                gl.TRIANGLES,
                buffers.index_count,
                gl.UNSIGNED_INT,
                0,
                run.count,
            );
        }
        gl.bindVertexArray(null);
        gl.disable(gl.BLEND);
        gl.disable(gl.SCISSOR_TEST);
        context.save();
        context.setTransform(1, 0, 0, 1, 0, 0);
        context.globalAlpha = 1;
        context.globalCompositeOperation = "source-over";
        context.drawImage(
            canvas,
            box_x,
            box_y,
            box_w,
            box_h,
            box_x,
            box_y,
            box_w,
            box_h,
        );
        context.restore();
    }

    /** Frees the graphics card's memory. */
    public destroy(): void {
        const gl = this.gl;
        if (gl.isContextLost()) {
            return;
        }
        gl.deleteTexture(this.bone_texture);
        gl.deleteProgram(this.program);
        gl.getExtension("WEBGL_lose_context")?.loseContext();
    }
}
