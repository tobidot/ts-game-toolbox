import { TestClass } from "../../src";
import { Rect } from "../../src";
import { Vector2 } from "../../src";

class BouncingRect {
    public rect: Rect;
    public velocity: Vector2;
    public color: string;
    public label: string;

    public constructor(
        rect: Rect,
        velocity: Vector2,
        color: string,
        label: string,
    ) {
        this.rect = rect;
        this.velocity = velocity;
        this.color = color;
        this.label = label;
    }

    public step(bounds: Rect, dt: number): void {
        this.rect.move(this.velocity.cpy().mul(dt));
        if (
            this.rect.left < bounds.left ||
            this.rect.get_right() > bounds.get_right()
        ) {
            this.velocity.x *= -1;
        }
        if (
            this.rect.top < bounds.top ||
            this.rect.get_bottom() > bounds.get_bottom()
        ) {
            this.velocity.y *= -1;
        }
        // Clamp back into the bounds in case of tunnelling from a large dt
        this.rect.left = Math.max(
            bounds.left,
            Math.min(bounds.get_right() - this.rect.width, this.rect.left),
        );
        this.rect.top = Math.max(
            bounds.top,
            Math.min(bounds.get_bottom() - this.rect.height, this.rect.top),
        );
    }
}

export class RectTest extends TestClass {
    private animation_frame: number | null = null;

    public get_name(): string {
        return "Rect Collision Physics";
    }

    public override tear_down() {
        if (this.animation_frame !== null) {
            cancelAnimationFrame(this.animation_frame);
            this.animation_frame = null;
        }
    }

    public test_rect_collision_physics() {
        const test_container =
            document.querySelector(".test-dashboard__test-container") ||
            document.body;

        const canvas = document.createElement("canvas");
        canvas.width = 400;
        canvas.height = 300;
        canvas.className = "test-dashboard__demo-canvas";
        test_container.appendChild(canvas);

        const ctx = canvas.getContext("2d")!;
        const bounds = new Rect(0, 0, canvas.width, canvas.height);

        const boxes = [
            new BouncingRect(
                new Rect(40, 40, 70, 70),
                new Vector2(90, 60),
                "#2563eb",
                "A",
            ),
            new BouncingRect(
                new Rect(220, 60, 60, 60),
                new Vector2(-70, 80),
                "#16a34a",
                "B",
            ),
            new BouncingRect(
                new Rect(140, 180, 80, 50),
                new Vector2(60, -70),
                "#dc2626",
                "C",
            ),
            new BouncingRect(
                new Rect(300, 180, 50, 90),
                new Vector2(-50, -50),
                "#9333ea",
                "D",
            ),
        ];

        let last_time = performance.now();
        const render = () => {
            const now = performance.now();
            const dt = Math.min(1 / 20, (now - last_time) / 1000);
            last_time = now;

            boxes.forEach((box) => box.step(bounds, dt));

            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.strokeStyle = "#ccc";
            ctx.strokeRect(
                bounds.left,
                bounds.top,
                bounds.width,
                bounds.height,
            );

            let overlap_count = 0;
            for (let i = 0; i < boxes.length; i++) {
                for (let j = i + 1; j < boxes.length; j++) {
                    if (boxes[i].rect.overlaps_with(boxes[j].rect))
                        overlap_count++;
                }
            }

            boxes.forEach((box, index) => {
                const is_overlapping = boxes.some(
                    (other, other_index) =>
                        other_index !== index &&
                        box.rect.overlaps_with(other.rect),
                );
                ctx.fillStyle = is_overlapping
                    ? "rgba(220, 38, 38, 0.35)"
                    : `${box.color}33`;
                ctx.fillRect(
                    box.rect.left,
                    box.rect.top,
                    box.rect.width,
                    box.rect.height,
                );
                ctx.strokeStyle = box.color;
                ctx.lineWidth = 2;
                ctx.strokeRect(
                    box.rect.left,
                    box.rect.top,
                    box.rect.width,
                    box.rect.height,
                );
                ctx.fillStyle = box.color;
                ctx.fillText(box.label, box.rect.left + 4, box.rect.top + 14);
            });

            ctx.fillStyle = "#111";
            ctx.font = "14px sans-serif";
            ctx.fillText(
                `Rect.overlaps_with(): ${overlap_count} active collision${overlap_count === 1 ? "" : "s"}`,
                10,
                canvas.height - 10,
            );

            this.animation_frame = requestAnimationFrame(render);
        };

        render();

        console.log(
            "Rect collision physics demo created. Four bouncing rects highlight in red whenever Rect.overlaps_with() detects a collision.",
        );
    }
}
