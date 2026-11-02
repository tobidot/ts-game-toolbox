/**
 * A pixel buffer of palette indices with the drawing primitives of a small pixel editor.
 *
 * A `<canvas>` stores colors and forgets what was drawn; an editor needs the opposite: a
 * buffer of *which palette entry* each pixel holds, so a palette change recolors the picture,
 * a flood fill knows where a region ends and undo is a copy of a few kilobytes. This class is
 * that buffer. It is DOM-free (plain `Int16Array`, row-major) except `to_image_data`, which
 * turns the indices into an `ImageData` through a palette so a renderer can `putImageData` it.
 *
 * Indices are whole numbers; `transparent` (default -1) marks "no pixel". Coordinates outside
 * the buffer are ignored by every primitive, so a line may leave the image without harm.
 */
export interface PaletteColor {
    r: number;
    g: number;
    b: number;
    /** 0..255; omitted means opaque. */
    a?: number;
}

export class PixelCanvas {
    public readonly width: number;
    public readonly height: number;
    /** The index that means "no pixel"; `to_image_data` paints it fully transparent. */
    public readonly transparent: number;
    private readonly pixels: Int16Array;

    /** An empty buffer of `width` x `height` pixels, every one `transparent`. */
    public constructor(
        width: number,
        height: number,
        transparent: number = -1,
    ) {
        if (
            !Number.isInteger(width) ||
            !Number.isInteger(height) ||
            width < 1 ||
            height < 1
        ) {
            throw new Error(
                `PixelCanvas: size must be whole and positive, got ${width}x${height}`,
            );
        }
        this.width = width;
        this.height = height;
        this.transparent = transparent;
        this.pixels = new Int16Array(width * height).fill(transparent);
    }

    /** A canvas from a `snapshot()` of the same size (the snapshot is copied). */
    public static from_snapshot(
        width: number,
        height: number,
        snapshot: Int16Array,
        transparent: number = -1,
    ): PixelCanvas {
        const canvas = new PixelCanvas(width, height, transparent);
        canvas.restore(snapshot);
        return canvas;
    }

    /** `true` when the pixel exists. */
    public is_inside(x: number, y: number): boolean {
        return x >= 0 && y >= 0 && x < this.width && y < this.height;
    }

    /** The index at `x`, `y`; `transparent` outside the buffer. */
    public get(x: number, y: number): number {
        if (!this.is_inside(x, y)) return this.transparent;
        return this.pixels[y * this.width + x];
    }

    /** Writes one pixel; `false` when the pixel is outside. */
    public set(x: number, y: number, index: number): boolean {
        if (!this.is_inside(x, y)) return false;
        this.pixels[y * this.width + x] = index;
        return true;
    }

    /** Every pixel to `index` (default: `transparent`). */
    public clear(index: number = this.transparent): void {
        this.pixels.fill(index);
    }

    /**
     * Bresenham's line from (x0, y0) to (x1, y1), both ends included. Integer steps only: the
     * error term decides at each step whether the minor axis advances, so no pixel is skipped
     * and none is drawn twice, at any slope and in any direction.
     */
    public line(
        x0: number,
        y0: number,
        x1: number,
        y1: number,
        index: number,
    ): void {
        let x = Math.round(x0);
        let y = Math.round(y0);
        const end_x = Math.round(x1);
        const end_y = Math.round(y1);
        const dx = Math.abs(end_x - x);
        const dy = -Math.abs(end_y - y);
        const step_x = x < end_x ? 1 : -1;
        const step_y = y < end_y ? 1 : -1;
        let error = dx + dy;
        for (;;) {
            this.set(x, y, index);
            if (x === end_x && y === end_y) break;
            const doubled = 2 * error;
            if (doubled >= dy) {
                error += dy;
                x += step_x;
            }
            if (doubled <= dx) {
                error += dx;
                y += step_y;
            }
        }
    }

    /** The rectangle spanned by two corners (any order), filled or as a one-pixel outline. */
    public rect(
        x0: number,
        y0: number,
        x1: number,
        y1: number,
        index: number,
        filled: boolean,
    ): void {
        const left = Math.min(Math.round(x0), Math.round(x1));
        const right = Math.max(Math.round(x0), Math.round(x1));
        const top = Math.min(Math.round(y0), Math.round(y1));
        const bottom = Math.max(Math.round(y0), Math.round(y1));
        for (let y = top; y <= bottom; y++) {
            const is_edge_row = y === top || y === bottom;
            for (let x = left; x <= right; x++) {
                if (filled || is_edge_row || x === left || x === right) {
                    this.set(x, y, index);
                }
            }
        }
    }

    /**
     * Recolors the 4-connected region of the pixel at (x, y) (every pixel reachable through
     * neighbors of the same index) to `index`. Uses an explicit stack instead of recursion,
     * so a 64x64 fill cannot overflow the call stack. Returns how many pixels changed; 0 when
     * the start is outside or already has the index.
     */
    public flood_fill(x: number, y: number, index: number): number {
        if (!this.is_inside(x, y)) return 0;
        const target = this.get(x, y);
        if (target === index) return 0;
        const width = this.width;
        const pixels = this.pixels;
        const stack: number[] = [y * width + x];
        let changed = 0;
        while (stack.length > 0) {
            const offset = stack.pop() as number;
            if (pixels[offset] !== target) continue;
            pixels[offset] = index;
            changed++;
            const column = offset % width;
            if (column > 0) stack.push(offset - 1);
            if (column < width - 1) stack.push(offset + 1);
            if (offset >= width) stack.push(offset - width);
            if (offset + width < pixels.length) stack.push(offset + width);
        }
        return changed;
    }

    /** A copy of the buffer, for undo stacks; `restore` takes it back. */
    public snapshot(): Int16Array {
        return this.pixels.slice();
    }

    /** Overwrites the buffer with a snapshot of the same length; throws on a size mismatch. */
    public restore(snapshot: Int16Array): void {
        if (snapshot.length !== this.pixels.length) {
            throw new Error(
                `PixelCanvas.restore: snapshot has ${snapshot.length} pixels, canvas ${this.pixels.length}`,
            );
        }
        this.pixels.set(snapshot);
    }

    /** A new canvas of another size with the same top-left content; new pixels are transparent. */
    public resized(width: number, height: number): PixelCanvas {
        const copy = new PixelCanvas(width, height, this.transparent);
        const columns = Math.min(width, this.width);
        const rows = Math.min(height, this.height);
        for (let y = 0; y < rows; y++) {
            for (let x = 0; x < columns; x++) {
                copy.pixels[y * width + x] = this.pixels[y * this.width + x];
            }
        }
        return copy;
    }

    /**
     * The picture as RGBA bytes through `palette`: pixel `i` takes `palette[i]`, the
     * transparent index and indices outside the palette become alpha 0. The only member that
     * needs the DOM (`ImageData`); everything else runs anywhere.
     */
    public to_image_data(palette: readonly PaletteColor[]): ImageData {
        const image = new ImageData(this.width, this.height);
        const data = image.data;
        const pixels = this.pixels;
        for (let offset = 0; offset < pixels.length; offset++) {
            const index = pixels[offset];
            const color =
                index === this.transparent ? undefined : palette[index];
            if (color === undefined) continue;
            const byte = offset * 4;
            data[byte] = color.r;
            data[byte + 1] = color.g;
            data[byte + 2] = color.b;
            data[byte + 3] = color.a ?? 255;
        }
        return image;
    }
}
