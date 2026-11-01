import { TestClass } from "../../src/testing/TestClass";
import { COLORS } from "../../src/commons/COLORS";
import { RgbColor } from "../../src/data/RgbColor";

export class ColorTest extends TestClass {
    private animation_frame: number | null = null;

    public get_name(): string {
        return "Color & Palette Showcase";
    }

    public override tear_down() {
        if (this.animation_frame !== null) {
            cancelAnimationFrame(this.animation_frame);
            this.animation_frame = null;
        }
    }

    public test_color_palette_visualization() {
        const test_container =
            document.querySelector(".test-dashboard__test-container") ||
            document.body;

        const canvas = document.createElement("canvas");
        canvas.width = 400;
        canvas.height = 300;
        canvas.className = "test-dashboard__demo-canvas";
        test_container.appendChild(canvas);

        const ctx = canvas.getContext("2d")!;

        const palette = Object.entries(COLORS) as Array<[string, RgbColor]>;
        const swatch_size = 60;
        const swatch_gap = 10;

        // Draw the built-in COLORS palette as labeled swatches
        palette.forEach(([name, color], index) => {
            const x = swatch_gap + index * (swatch_size + swatch_gap);
            const y = swatch_gap;
            ctx.fillStyle = color.toString();
            ctx.strokeStyle = "#333";
            ctx.lineWidth = 1;
            ctx.fillRect(x, y, swatch_size, swatch_size);
            ctx.strokeRect(x, y, swatch_size, swatch_size);

            ctx.fillStyle = "#111";
            ctx.font = "11px sans-serif";
            ctx.textAlign = "center";
            ctx.fillText(name, x + swatch_size / 2, y + swatch_size + 14);
            ctx.fillText(
                color.to_hex(),
                x + swatch_size / 2,
                y + swatch_size + 28,
            );
        });

        const from_color = COLORS.blue;
        const to_color = COLORS.red;
        const gradient_top = swatch_gap * 2 + swatch_size + 40;
        const gradient_height = 40;

        // Draw a static gradient strip built from RgbColor.lerp, to show blending across the palette
        const steps = 40;
        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const blended = from_color.lerp(to_color, t);
            ctx.fillStyle = blended.toString();
            ctx.fillRect(
                swatch_gap + i * ((canvas.width - swatch_gap * 2) / steps),
                gradient_top,
                (canvas.width - swatch_gap * 2) / steps + 1,
                gradient_height,
            );
        }
        ctx.strokeStyle = "#333";
        ctx.strokeRect(
            swatch_gap,
            gradient_top,
            canvas.width - swatch_gap * 2,
            gradient_height,
        );
        ctx.fillStyle = "#111";
        ctx.textAlign = "left";
        ctx.fillText("RgbColor.lerp(blue → red)", swatch_gap, gradient_top - 8);

        // Animate a single swatch pulsing back and forth between the two colors,
        // to demonstrate that RgbColor blending works well for runtime transitions too.
        const marker_y = gradient_top + gradient_height + 40;
        const marker_size = 60;
        const marker_x = canvas.width / 2 - marker_size / 2;
        const start_time = performance.now();
        const render = () => {
            ctx.clearRect(
                0,
                gradient_top + gradient_height + 10,
                canvas.width,
                canvas.height - (gradient_top + gradient_height + 10),
            );

            const t =
                (Math.sin((performance.now() - start_time) / 700) + 1) / 2;
            const animated = from_color.lerp(to_color, t);

            ctx.fillStyle = animated.toString();
            ctx.strokeStyle = "#333";
            ctx.fillRect(marker_x, marker_y, marker_size, marker_size);
            ctx.strokeRect(marker_x, marker_y, marker_size, marker_size);

            ctx.fillStyle = "#111";
            ctx.textAlign = "center";
            ctx.fillText(
                `live blend: ${animated.to_hex()}`,
                canvas.width / 2,
                marker_y + marker_size + 16,
            );

            this.animation_frame = requestAnimationFrame(render);
        };
        render();

        console.log(
            "Color & Palette showcase created. Watch the swatch at the bottom pulse between blue and red via RgbColor.lerp.",
        );
    }
}
