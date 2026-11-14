/** The numbers kept per sprite: x, y, angle, width, height. */
const FIELDS = 5;

/** The sprites of one image, packed. */
interface ImageRun {
    readonly image: CanvasImageSource;
    values: Float64Array;
    count: number;
}

/**
 * Draws many sprites quickly: a game adds each one (an image, where its middle is, how it is
 * turned and how big it is drawn) and draws them all at once. The batch draws image by image,
 * so the browser switches pictures as seldom as it can, and gives each sprite exactly one
 * `setTransform`, worked out on top of the context's transform as it is at `draw()`: no
 * `save()`, `translate()`, `rotate()` and `restore()` per sprite. Afterwards the transform is
 * what it was.
 *
 * Drawing image by image changes which sprite lies on top: all sprites of the first image come
 * first. For a crowd that doesn't matter; draw what must be on top in a batch of its own.
 * Angles are radians, clockwise on the screen (the canvas's `rotate()`); a sprite at angle 0
 * faces right. The batch keeps its storage between frames, so a frame allocates nothing once
 * the crowd has stopped growing.
 */
export class SpriteBatch {
    private readonly runs: ImageRun[] = [];
    private readonly run_of = new Map<CanvasImageSource, ImageRun>();
    private total = 0;

    /** Sprites added since the last `draw()`. */
    public get size(): number {
        return this.total;
    }

    /** Adds `image`, drawn `width` by `height` around `x`, `y` and turned by `angle`. */
    public add(
        image: CanvasImageSource,
        x: number,
        y: number,
        angle: number,
        width: number,
        height: number,
    ): void {
        let run = this.run_of.get(image);
        if (run === undefined) {
            run = { image, values: new Float64Array(64 * FIELDS), count: 0 };
            this.run_of.set(image, run);
            this.runs.push(run);
        }
        if ((run.count + 1) * FIELDS > run.values.length) {
            const grown = new Float64Array(run.values.length * 2);
            grown.set(run.values);
            run.values = grown;
        }
        const at = run.count * FIELDS;
        const values = run.values;
        values[at] = x;
        values[at + 1] = y;
        values[at + 2] = angle;
        values[at + 3] = width;
        values[at + 4] = height;
        run.count += 1;
        this.total += 1;
    }

    /** Draws every sprite added since the last time and empties the batch. Returns how many it drew. */
    public draw(context: CanvasRenderingContext2D): number {
        const drawn = this.total;
        if (drawn === 0) {
            return 0;
        }
        const base = context.getTransform();
        const { a, b, c, d, e, f } = base;
        for (const run of this.runs) {
            const values = run.values;
            const image = run.image;
            for (let index = 0; index < run.count; index++) {
                const at = index * FIELDS;
                const x = values[at];
                const y = values[at + 1];
                const angle = values[at + 2];
                const width = values[at + 3];
                const height = values[at + 4];
                const cos = Math.cos(angle);
                const sin = Math.sin(angle);
                // base * translate(x, y) * rotate(angle)
                context.setTransform(
                    a * cos + c * sin,
                    b * cos + d * sin,
                    c * cos - a * sin,
                    d * cos - b * sin,
                    a * x + c * y + e,
                    b * x + d * y + f,
                );
                context.drawImage(
                    image,
                    -width / 2,
                    -height / 2,
                    width,
                    height,
                );
            }
        }
        context.setTransform(a, b, c, d, e, f);
        this.clear();
        return drawn;
    }

    /** Forgets the sprites added since the last `draw()`; the images it has seen keep their storage. */
    public clear(): void {
        for (const run of this.runs) {
            run.count = 0;
        }
        this.total = 0;
    }
}
