import { TestClass } from "../../src";
import { Throttler } from "../../src";
import { Vector2 } from "../../src";

export class ThrottlerTest extends TestClass {
    private animation_frame: number | null = null;
    private mouse_move_handler: ((e: MouseEvent) => void) | null = null;
    private canvas: HTMLCanvasElement | null = null;

    public get_name(): string {
        return "Flow: Throttled Events";
    }

    public override tear_down(): void {
        if (this.animation_frame !== null) {
            cancelAnimationFrame(this.animation_frame);
            this.animation_frame = null;
        }
        if (this.canvas && this.mouse_move_handler) {
            this.canvas.removeEventListener(
                "mousemove",
                this.mouse_move_handler,
            );
        }
    }

    public test_throttled_events(): void {
        const test_container =
            document.querySelector(".test-dashboard__test-container") ||
            document.body;

        const canvas = document.createElement("canvas");
        canvas.width = 500;
        canvas.height = 320;
        canvas.className = "test-dashboard__demo-canvas";
        test_container.appendChild(canvas);
        this.canvas = canvas;

        const ctx = canvas.getContext("2d")!;

        let raw_move_count = 0;
        let throttled_move_count = 0;
        const raw_position = new Vector2(canvas.width / 2, canvas.height / 2);
        const throttled_position = new Vector2(
            canvas.width / 2,
            canvas.height / 2,
        );
        const trail: Vector2[] = [];

        const throttler = new Throttler<[number, number], void>({
            delay_ms: 200,
            callback: async (x: number, y: number) => {
                throttled_move_count++;
                throttled_position.set(x, y);
            },
        });

        const get_coords = (e: MouseEvent): { x: number; y: number } => {
            const rect = canvas.getBoundingClientRect();
            return {
                x: e.clientX - rect.left,
                y: e.clientY - rect.top,
            };
        };

        this.mouse_move_handler = (e: MouseEvent) => {
            const coords = get_coords(e);
            raw_move_count++;
            raw_position.set(coords.x, coords.y);

            trail.push(new Vector2(coords.x, coords.y));
            if (trail.length > 30) {
                trail.shift();
            }

            void throttler.run(coords.x, coords.y);
        };

        canvas.addEventListener("mousemove", this.mouse_move_handler);

        const render = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            // Draw border
            ctx.strokeStyle = "#ddd";
            ctx.lineWidth = 1;
            ctx.strokeRect(0, 0, canvas.width, canvas.height);

            // Draw trail
            ctx.fillStyle = "rgba(100, 100, 100, 0.15)";
            for (let i = 0; i < trail.length; i++) {
                const p = trail[i];
                const size = 1 + (i / trail.length) * 3;
                ctx.beginPath();
                ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
                ctx.fill();
            }

            // Draw Raw dot
            ctx.fillStyle = "#2563eb";
            ctx.beginPath();
            ctx.arc(raw_position.x, raw_position.y, 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.font = "12px sans-serif";
            ctx.fillText("Raw", raw_position.x + 8, raw_position.y + 4);

            // Draw Throttled dot
            ctx.fillStyle = "#dc2626";
            ctx.beginPath();
            ctx.arc(
                throttled_position.x,
                throttled_position.y,
                8,
                0,
                Math.PI * 2,
            );
            ctx.fill();
            ctx.strokeStyle = "white";
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.fillStyle = "#dc2626";
            ctx.fillText(
                "Throttled",
                throttled_position.x + 12,
                throttled_position.y + 4,
            );

            // Draw counters
            ctx.fillStyle = "#111";
            ctx.font = "bold 14px sans-serif";
            ctx.fillText(`Raw events: ${raw_move_count}`, 20, 30);
            ctx.fillText(
                `Throttled callback runs: ${throttled_move_count}`,
                20,
                55,
            );

            // Instructions
            ctx.font = "italic 12px sans-serif";
            ctx.fillStyle = "#666";
            ctx.fillText(
                "Move mouse over the canvas. Throttler is set to 200ms delay.",
                20,
                canvas.height - 20,
            );

            this.animation_frame = requestAnimationFrame(render);
        };

        render();

        console.log(
            "Throttler interaction demo initialized. It visually demonstrates how the Throttler class " +
                "batches rapid consecutive calls into discrete executions based on the configured delay.",
        );
    }
}
