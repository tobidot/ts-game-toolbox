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

export class QuadTreeTest extends TestClass {
    public base_rect: RectI = {
        left: 0,
        top: 0,
        width: 400,
        height: 300,
    };
    private animation_frame: number | null = null;

    public get_name() {
        return "Quadtree Spatial Partitioning";
    }

    public override tear_down() {
        if (this.animation_frame !== null) {
            cancelAnimationFrame(this.animation_frame);
            this.animation_frame = null;
        }
    }

    public test_quadtree_visualization() {
        const test_container =
            document.querySelector(".test-dashboard__test-container") ||
            document.body;

        const canvas = document.createElement("canvas");
        canvas.width = 400;
        canvas.height = 300;
        canvas.className = "test-dashboard__demo-canvas";
        test_container.appendChild(canvas);

        const ctx = canvas.getContext("2d")!;

        const elements = [
            new BouncingElement(10, 10, 18, 18, 60, 45),
            new BouncingElement(100, 100, 16, 16, -50, 55),
            new BouncingElement(250, 50, 14, 14, 45, -60),
            new BouncingElement(320, 220, 20, 20, -40, -35),
            new BouncingElement(60, 220, 12, 12, 55, -40),
            new BouncingElement(180, 40, 16, 16, -35, 50),
            new BouncingElement(30, 150, 18, 18, 40, 40),
            new BouncingElement(220, 180, 14, 14, -55, -45),
        ];

        // The pick rect moves on its own so the demo highlights results even without user input
        let pointer: Vector2I | null = null;
        canvas.addEventListener("mousemove", (e) => {
            const rect = canvas.getBoundingClientRect();
            pointer = { x: e.clientX - rect.left, y: e.clientY - rect.top };
        });
        canvas.addEventListener("mouseleave", () => (pointer = null));

        const start_time = performance.now();
        let last_time = start_time;
        const render = () => {
            const now = performance.now();
            const dt = Math.min(1 / 20, (now - last_time) / 1000);
            last_time = now;

            elements.forEach((element) => element.step(this.base_rect, dt));

            // Rebuild the tree every frame, like a game would after moving its entities
            const tree = new QuadTree<BouncingElement>(this.base_rect);
            elements.forEach((element) => tree.add(element));

            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.strokeStyle = "#ccc";
            ctx.strokeRect(
                this.base_rect.left,
                this.base_rect.top,
                this.base_rect.width,
                this.base_rect.height,
            );

            // Visualize how the tree subdivides its space
            ctx.strokeStyle = "rgba(37, 99, 235, 0.25)";
            ctx.lineWidth = 1;
            tree.collect_leaf_rects().forEach((leaf) => {
                ctx.strokeRect(leaf.left, leaf.top, leaf.width, leaf.height);
            });

            const t = (now - start_time) / 1000;
            const pick_rect: RectI = pointer
                ? {
                      left: pointer.x - 45,
                      top: pointer.y - 45,
                      width: 90,
                      height: 90,
                  }
                : {
                      left: 130 + Math.sin(t * 0.6) * 100,
                      top: 90 + Math.cos(t * 0.8) * 60,
                      width: 90,
                      height: 90,
                  };

            const picked = tree.pick(pick_rect);
            const picked_set = new Set(picked);

            elements.forEach((element) => {
                ctx.fillStyle = picked_set.has(element) ? "orange" : "#2563eb";
                ctx.fillRect(
                    element.left,
                    element.top,
                    element.width,
                    element.height,
                );
            });

            ctx.strokeStyle = "rgba(255, 165, 0, 0.7)";
            ctx.lineWidth = 2;
            ctx.strokeRect(
                pick_rect.left,
                pick_rect.top,
                pick_rect.width,
                pick_rect.height,
            );

            ctx.fillStyle = "#111";
            ctx.font = "14px sans-serif";
            ctx.fillText(
                `QuadTree.pick(): ${picked.length}/${elements.length} elements inside the orange query rect (move your mouse!)`,
                10,
                canvas.height - 10,
            );

            this.animation_frame = requestAnimationFrame(render);
        };

        render();

        console.log(
            "Quadtree spatial partitioning demo created. Blue outlines show the tree's leaf subdivisions; the orange rect follows your mouse and highlights the elements returned by QuadTree.pick().",
        );
    }
}
