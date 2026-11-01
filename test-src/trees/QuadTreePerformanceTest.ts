import { TestClass } from "../../src";
import { QuadTree } from "../../src";
import { Rect, RectI, Vector2I } from "../../src";

class BouncingElement extends Rect {
    public velocity_x: number;
    public velocity_y: number;

    public constructor(
        x: number,
        y: number,
        w: number,
        h: number,
        velocity_x: number,
        velocity_y: number,
    ) {
        super({ left: x, top: y, width: w, height: h });
        this.velocity_x = velocity_x;
        this.velocity_y = velocity_y;
    }

    public step(bounds: RectI, dt: number): void {
        this.left += this.velocity_x * dt;
        this.top += this.velocity_y * dt;
        if (
            this.left < bounds.left ||
            this.get_right() > bounds.left + bounds.width
        ) {
            this.velocity_x *= -1;
            this.left = Math.max(
                bounds.left,
                Math.min(bounds.left + bounds.width - this.width, this.left),
            );
        }
        if (
            this.top < bounds.top ||
            this.get_bottom() > bounds.top + bounds.height
        ) {
            this.velocity_y *= -1;
            this.top = Math.max(
                bounds.top,
                Math.min(bounds.top + bounds.height - this.height, this.top),
            );
        }
    }
}

export class QuadTreePerformanceTest extends TestClass {
    public base_rect: RectI = {
        left: 0,
        top: 0,
        width: 520,
        height: 360,
    };
    private animation_frame: number | null = null;
    private canvas: HTMLCanvasElement | null = null;
    private mouse_move_listener: ((e: MouseEvent) => void) | null = null;
    private mouse_leave_listener: (() => void) | null = null;

    public get_name(): string {
        return "Trees: QuadTree Performance";
    }

    public override tear_down(): void {
        if (this.animation_frame !== null) {
            cancelAnimationFrame(this.animation_frame);
            this.animation_frame = null;
        }
        if (this.canvas) {
            if (this.mouse_move_listener) {
                this.canvas.removeEventListener(
                    "mousemove",
                    this.mouse_move_listener,
                );
            }
            if (this.mouse_leave_listener) {
                this.canvas.removeEventListener(
                    "mouseleave",
                    this.mouse_leave_listener,
                );
            }
        }
    }

    public test_quadtree_performance(): void {
        const test_container =
            document.querySelector(".test-dashboard__test-container") ||
            document.body;

        this.canvas = document.createElement("canvas");
        this.canvas.width = 520;
        this.canvas.height = 360;
        this.canvas.className = "test-dashboard__demo-canvas";
        test_container.appendChild(this.canvas);

        const ctx = this.canvas.getContext("2d")!;

        const elements: BouncingElement[] = [];
        const count = 250;
        for (let i = 0; i < count; i++) {
            elements.push(
                new BouncingElement(
                    Math.random() * (this.base_rect.width - 10),
                    Math.random() * (this.base_rect.height - 10),
                    6,
                    6,
                    (Math.random() - 0.5) * 120,
                    (Math.random() - 0.5) * 120,
                ),
            );
        }

        let pointer: Vector2I | null = null;
        this.mouse_move_listener = (e: MouseEvent) => {
            if (!this.canvas) return;
            const rect = this.canvas.getBoundingClientRect();
            pointer = { x: e.clientX - rect.left, y: e.clientY - rect.top };
        };
        this.mouse_leave_listener = () => (pointer = null);

        this.canvas.addEventListener("mousemove", this.mouse_move_listener);
        this.canvas.addEventListener("mouseleave", this.mouse_leave_listener);

        const start_time = performance.now();
        let last_time = start_time;
        const render = () => {
            const now = performance.now();
            const dt = Math.min(1 / 20, (now - last_time) / 1000);
            last_time = now;

            elements.forEach((element) => element.step(this.base_rect, dt));

            // Rebuild tree each frame to simulate dynamic scene
            const tree = new QuadTree<BouncingElement>(this.base_rect);
            elements.forEach((element) => tree.add(element));

            ctx.clearRect(0, 0, this.canvas!.width, this.canvas!.height);

            // Draw background bounds
            ctx.strokeStyle = "#cbd5e1";
            ctx.lineWidth = 1;
            ctx.strokeRect(
                this.base_rect.left,
                this.base_rect.top,
                this.base_rect.width,
                this.base_rect.height,
            );

            const t = (now - start_time) / 1000;
            const query_rect: RectI = pointer
                ? {
                      left: pointer.x - 50,
                      top: pointer.y - 50,
                      width: 100,
                      height: 100,
                  }
                : {
                      left: 210 + Math.sin(t * 0.6) * 150,
                      top: 130 + Math.cos(t * 0.8) * 100,
                      width: 100,
                      height: 100,
                  };

            // Brute force checks is simply scanning every single element
            const brute_force_checks = elements.length;
            // QuadTree query returns only relevant candidates
            const picked = tree.pick(query_rect);
            const quadtree_checks = picked.length;
            const picked_set = new Set(picked);

            // Draw elements
            elements.forEach((element) => {
                ctx.fillStyle = picked_set.has(element) ? "#f97316" : "#94a3b8";
                ctx.fillRect(
                    element.left,
                    element.top,
                    element.width,
                    element.height,
                );
            });

            // Draw query rectangle
            ctx.strokeStyle = "rgba(249, 115, 22, 0.8)";
            ctx.lineWidth = 2;
            ctx.strokeRect(
                query_rect.left,
                query_rect.top,
                query_rect.width,
                query_rect.height,
            );

            // Display performance metrics
            ctx.fillStyle = "#1e293b";
            ctx.font = "bold 13px sans-serif";
            const ratio = (
                (quadtree_checks / brute_force_checks) *
                100
            ).toFixed(1);

            ctx.fillText(
                `Total elements a brute-force scan must check: ${brute_force_checks}`,
                12,
                25,
            );
            ctx.fillText(
                `Elements returned by QuadTree.pick(): ${quadtree_checks}`,
                12,
                45,
            );
            ctx.fillText(
                `Efficiency Ratio: ${quadtree_checks}/${brute_force_checks} = ${ratio}% of total set`,
                12,
                65,
            );

            this.animation_frame = requestAnimationFrame(render);
        };

        render();

        console.log(
            "QuadTree performance demo created. This demo compares a brute-force spatial query against a QuadTree query. Moving the orange rectangle demonstrates how QuadTree.pick() avoids scanning the entire element set by focusing only on relevant spatial branches.",
        );
    }
}
