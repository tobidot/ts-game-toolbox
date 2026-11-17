/**
 * The CPU's picture of the particles: premultiplied colour per pixel in a float array, each
 * particle splatted as the GPU rasterises its point: the pixels whose middles lie in a square
 * as wide as the dot, a soft round dot (1 - r²)² towards the rim. A dot under `SOLID_BELOW`
 * pixels is one solid pixel (the one under its middle), fainter by the light it lacks: a soft
 * dot that small would vanish between pixel middles. Only the rectangle touched since the last
 * `clear()` is converted and cleared, so a few sparks cost a few pixels.
 */
/**
 * Dots narrower than this many pixels are one solid pixel at `(size / SOLID_BELOW)²` of the
 * opacity. A soft dot 2 pixels across carries about one pixel's light, so the step is smooth.
 * The GPU's draw shader does the same.
 */
export const SOLID_BELOW = 2;

export class ParticleRaster {
    public width = 0;
    public height = 0;
    /** r, g, b, a per pixel, premultiplied, 0 to 1 (more where glow adds up). */
    private pixels = new Float32Array(0);
    /** The touched rectangle: from `left`, `top` to before `right`, `bottom`. */
    public left = 0;
    public top = 0;
    public right = 0;
    public bottom = 0;

    /** Nothing touched since the last `clear()`. */
    public get is_empty(): boolean {
        return this.right <= this.left || this.bottom <= this.top;
    }

    /** As large as the canvas it is drawn onto; a new size starts empty. */
    public resize(width: number, height: number): void {
        if (width === this.width && height === this.height) {
            return;
        }
        this.width = width;
        this.height = height;
        this.pixels = new Float32Array(width * height * 4);
        this.forget();
    }

    /** Empties the touched rectangle. */
    public clear(): void {
        if (this.is_empty) {
            return;
        }
        const row = this.width * 4;
        for (let y = this.top; y < this.bottom; y++) {
            this.pixels.fill(
                0,
                y * row + this.left * 4,
                y * row + this.right * 4,
            );
        }
        this.forget();
    }

    /**
     * One particle: its middle at `x`, `y` and `size` across, in pixels; colour 0 to 1 and
     * opacity. `glow` adds its light (alpha grows by the brightest channel, as on the GPU);
     * otherwise it is painted over what is there.
     */
    public splat(
        x: number,
        y: number,
        size: number,
        red: number,
        green: number,
        blue: number,
        alpha: number,
        glow: boolean,
    ): void {
        if (size < SOLID_BELOW) {
            this.solid(x, y, size, red, green, blue, alpha, glow);
            return;
        }
        const across = size;
        const opacity = alpha;
        if (!(opacity > 0)) {
            return;
        }
        const left = x - across / 2;
        const top = y - across / 2;
        // The pixels whose middles lie inside the square.
        const x0 = Math.max(0, Math.ceil(left - 0.5));
        const x1 = Math.min(this.width, Math.ceil(left + across - 0.5));
        const y0 = Math.max(0, Math.ceil(top - 0.5));
        const y1 = Math.min(this.height, Math.ceil(top + across - 0.5));
        if (x1 <= x0 || y1 <= y0) {
            return;
        }
        this.touch(x0, y0, x1, y1);
        const inverse = 1 / across;
        const brightest = Math.max(red, green, blue);
        const pixels = this.pixels;
        const row = this.width * 4;
        for (let py = y0; py < y1; py++) {
            const v = (py + 0.5 - top) * inverse - 0.5;
            const v2 = v * v;
            let at = py * row + x0 * 4;
            for (let px = x0; px < x1; px++, at += 4) {
                const u = (px + 0.5 - left) * inverse - 0.5;
                const r2 = (u * u + v2) * 4;
                if (r2 >= 1) {
                    continue;
                }
                const fall = (1 - r2) * (1 - r2);
                const weight = opacity * fall;
                if (glow) {
                    pixels[at] += red * weight;
                    pixels[at + 1] += green * weight;
                    pixels[at + 2] += blue * weight;
                    pixels[at + 3] += brightest * weight;
                } else {
                    const keep = 1 - weight;
                    pixels[at] = red * weight + pixels[at] * keep;
                    pixels[at + 1] = green * weight + pixels[at + 1] * keep;
                    pixels[at + 2] = blue * weight + pixels[at + 2] * keep;
                    pixels[at + 3] = weight + pixels[at + 3] * keep;
                }
            }
        }
    }

    /** A dot too small to be soft: the pixel under its middle. */
    private solid(
        x: number,
        y: number,
        size: number,
        red: number,
        green: number,
        blue: number,
        alpha: number,
        glow: boolean,
    ): void {
        const share = Math.max(size, 0) / SOLID_BELOW;
        const weight = alpha * share * share;
        const px = Math.floor(x);
        const py = Math.floor(y);
        if (
            !(weight > 0) ||
            px < 0 ||
            py < 0 ||
            px >= this.width ||
            py >= this.height
        ) {
            return;
        }
        this.touch(px, py, px + 1, py + 1);
        const pixels = this.pixels;
        const at = (py * this.width + px) * 4;
        if (glow) {
            pixels[at] += red * weight;
            pixels[at + 1] += green * weight;
            pixels[at + 2] += blue * weight;
            pixels[at + 3] += Math.max(red, green, blue) * weight;
            return;
        }
        const keep = 1 - weight;
        pixels[at] = red * weight + pixels[at] * keep;
        pixels[at + 1] = green * weight + pixels[at + 1] * keep;
        pixels[at + 2] = blue * weight + pixels[at + 2] * keep;
        pixels[at + 3] = weight + pixels[at + 3] * keep;
    }

    /**
     * The touched rectangle into `data` (an `ImageData`'s pixels as wide as the raster): straight
     * colour and alpha, 0 to 255, as `putImageData` wants them.
     */
    public write_into(data: Uint8ClampedArray): void {
        const pixels = this.pixels;
        const row = this.width * 4;
        for (let y = this.top; y < this.bottom; y++) {
            let at = y * row + this.left * 4;
            for (let x = this.left; x < this.right; x++, at += 4) {
                const alpha = Math.min(1, pixels[at + 3]);
                if (alpha <= 0) {
                    data[at] = 0;
                    data[at + 1] = 0;
                    data[at + 2] = 0;
                    data[at + 3] = 0;
                    continue;
                }
                const scale = 255 / alpha;
                data[at] = pixels[at] * scale;
                data[at + 1] = pixels[at + 1] * scale;
                data[at + 2] = pixels[at + 2] * scale;
                data[at + 3] = alpha * 255;
            }
        }
    }

    /** The premultiplied colour at a pixel, for tests. */
    public pixel(x: number, y: number): [number, number, number, number] {
        const at = (y * this.width + x) * 4;
        return [
            this.pixels[at],
            this.pixels[at + 1],
            this.pixels[at + 2],
            this.pixels[at + 3],
        ];
    }

    private touch(x0: number, y0: number, x1: number, y1: number): void {
        if (this.is_empty) {
            this.left = x0;
            this.top = y0;
            this.right = x1;
            this.bottom = y1;
            return;
        }
        this.left = Math.min(this.left, x0);
        this.top = Math.min(this.top, y0);
        this.right = Math.max(this.right, x1);
        this.bottom = Math.max(this.bottom, y1);
    }

    private forget(): void {
        this.left = 0;
        this.top = 0;
        this.right = 0;
        this.bottom = 0;
    }
}
