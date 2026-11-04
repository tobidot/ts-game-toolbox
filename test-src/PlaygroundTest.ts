import { TestClass } from "../src";
import {
    UiManager,
    UiPage,
    Slider,
    CheckBox,
    ElementChangeEvent,
    QuadTree,
    RectI,
    Vector2I,
} from "../src";

class PlaygroundBall {
    public x: number;
    public y: number;
    public vx: number;
    public vy: number;
    public radius: number;
    public color: string;
    public is_highlighted: boolean = false;

    public constructor(x: number, y: number, radius: number, color: string) {
        this.x = x;
        this.y = y;
        this.vx = (Math.random() - 0.5) * 160;
        this.vy = (Math.random() - 0.5) * 120;
        this.radius = radius;
        this.color = color;
    }

    public get bounding_rect(): RectI {
        return {
            left: this.x - this.radius,
            top: this.y - this.radius,
            width: this.radius * 2,
            height: this.radius * 2,
        };
    }
}

/**
 * A capstone demo that combines several library features into one scene:
 * - UI widgets (Slider/CheckBox via UiManager/UiPage) drive live simulation parameters.
 * - A simple gravity + wall-bounce physics loop animates a set of balls.
 * - A QuadTree re-built every frame powers a mouse-driven spatial query, highlighting
 *   nearby balls without ever checking every ball by hand.
 */
export class PlaygroundTest extends TestClass {
    private animation_frame: number | null = null;

    public get_name(): string {
        return "Playground: Everything Together";
    }

    public override tear_down() {
        if (this.animation_frame !== null) {
            cancelAnimationFrame(this.animation_frame);
            this.animation_frame = null;
        }
    }

    public test_playground() {
        const test_container =
            document.querySelector(".test-dashboard__test-container") ||
            document.body;

        const canvas = document.createElement("canvas");
        canvas.width = 600;
        canvas.height = 420;
        canvas.className = "test-dashboard__demo-canvas";
        test_container.appendChild(canvas);

        const ctx = canvas.getContext("2d")!;
        const manager = new UiManager();

        const panel_height = 90;
        const scene_top = panel_height;
        const scene_rect: RectI = {
            left: 0,
            top: scene_top,
            width: canvas.width,
            height: canvas.height - scene_top,
        };

        const colors = [
            "#2563eb",
            "#16a34a",
            "#dc2626",
            "#9333ea",
            "#ea580c",
            "#0891b2",
        ];
        const balls: Array<PlaygroundBall> = [];
        const spawn_ball = () => {
            const radius = 8 + Math.random() * 8;
            balls.push(
                new PlaygroundBall(
                    scene_rect.left +
                        radius +
                        Math.random() * (scene_rect.width - radius * 2),
                    scene_rect.top +
                        radius +
                        Math.random() * (scene_rect.height - radius * 2),
                    radius,
                    colors[balls.length % colors.length],
                ),
            );
        };
        for (let i = 0; i < 12; i++) {
            spawn_ball();
        }

        const gravity_slider = new Slider("Gravity", 0, 600, 220, {
            left: 20,
            top: 15,
            width: 220,
            height: 40,
        });
        const ball_count_slider = new Slider(
            "Ball Count",
            3,
            40,
            balls.length,
            {
                left: 260,
                top: 15,
                width: 220,
                height: 40,
            },
        );
        const quadtree_checkbox = new CheckBox(true, {
            left: 490,
            top: 25,
            width: 100,
            height: 24,
        });

        const page = new UiPage(
            { x: canvas.width, y: canvas.height },
            { left: 0, top: 0, width: 1, height: panel_height / canvas.height },
            { left: 0, top: 0, width: canvas.width, height: panel_height },
        );
        page.add(gravity_slider);
        page.add(ball_count_slider);
        page.add(quadtree_checkbox);
        manager.active_menu = page;

        ball_count_slider.events.attach(ElementChangeEvent, () => {
            const target = Math.round(ball_count_slider.value);
            while (balls.length < target) {
                spawn_ball();
            }
            while (balls.length > target) {
                balls.pop();
            }
        });

        let query_rect: RectI = {
            left: 0,
            top: scene_top,
            width: 90,
            height: 90,
        };
        let mouse_over_scene = false;
        let quadtree_picked_count = 0;

        let last_time = performance.now();
        const render = () => {
            const now = performance.now();
            const dt = Math.min(1 / 20, (now - last_time) / 1000);
            last_time = now;

            const gravity = gravity_slider.value;
            balls.forEach((ball) => {
                ball.vy += gravity * dt;
                ball.x += ball.vx * dt;
                ball.y += ball.vy * dt;

                if (ball.x - ball.radius < scene_rect.left) {
                    ball.x = scene_rect.left + ball.radius;
                    ball.vx *= -0.85;
                } else if (
                    ball.x + ball.radius >
                    scene_rect.left + scene_rect.width
                ) {
                    ball.x = scene_rect.left + scene_rect.width - ball.radius;
                    ball.vx *= -0.85;
                }
                if (ball.y - ball.radius < scene_rect.top) {
                    ball.y = scene_rect.top + ball.radius;
                    ball.vy *= -0.85;
                } else if (
                    ball.y + ball.radius >
                    scene_rect.top + scene_rect.height
                ) {
                    ball.y = scene_rect.top + scene_rect.height - ball.radius;
                    ball.vy *= -0.85;
                }
                ball.is_highlighted = false;
            });

            // Rebuild the tree every frame and use it to answer the spatial query,
            // instead of comparing the query rect against every ball by hand.
            const tree = new QuadTree<RectI & { ball: PlaygroundBall }>(
                scene_rect,
            );
            balls.forEach((ball) => {
                tree.add({ ...ball.bounding_rect, ball });
            });

            if (!mouse_over_scene) {
                const t = now / 1000;
                query_rect = {
                    left:
                        scene_rect.left +
                        scene_rect.width / 2 +
                        Math.cos(t * 0.6) * (scene_rect.width / 2 - 60) -
                        45,
                    top:
                        scene_rect.top +
                        scene_rect.height / 2 +
                        Math.sin(t * 0.8) * (scene_rect.height / 2 - 60) -
                        45,
                    width: 90,
                    height: 90,
                };
            }

            const picked = tree.pick(query_rect);
            quadtree_picked_count = picked.length;
            picked.forEach((entry) => (entry.ball.is_highlighted = true));

            ctx.clearRect(0, 0, canvas.width, canvas.height);

            ctx.fillStyle = "#0f172a";
            ctx.fillRect(
                scene_rect.left,
                scene_rect.top,
                scene_rect.width,
                scene_rect.height,
            );

            if (quadtree_checkbox.checked) {
                ctx.strokeStyle = "rgba(148, 163, 184, 0.35)";
                ctx.lineWidth = 1;
                tree.collect_leaf_rects().forEach((rect) => {
                    ctx.strokeRect(
                        rect.left,
                        rect.top,
                        rect.width,
                        rect.height,
                    );
                });
            }

            balls.forEach((ball) => {
                ctx.beginPath();
                ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
                ctx.fillStyle = ball.is_highlighted ? "#facc15" : ball.color;
                ctx.fill();
                if (ball.is_highlighted) {
                    ctx.lineWidth = 2;
                    ctx.strokeStyle = "#fde68a";
                    ctx.stroke();
                }
            });

            ctx.strokeStyle = "#f8fafc";
            ctx.lineWidth = 2;
            ctx.strokeRect(
                query_rect.left,
                query_rect.top,
                query_rect.width,
                query_rect.height,
            );

            ctx.fillStyle = "#e2e8f0";
            ctx.font = "13px sans-serif";
            ctx.textAlign = "left";
            ctx.fillText(
                `Balls: ${balls.length} | QuadTree.pick() found ${quadtree_picked_count} near the cursor (instead of checking all ${balls.length})`,
                10,
                canvas.height - 10,
            );

            manager.draw(ctx);

            this.animation_frame = requestAnimationFrame(render);
        };

        const get_coords = (e: MouseEvent): Vector2I => {
            const rect = canvas.getBoundingClientRect();
            return {
                x: e.clientX - rect.left,
                y: e.clientY - rect.top,
            };
        };

        const on_mouse_down = (e: MouseEvent) => {
            manager.pointer_down(get_coords(e));
            e.preventDefault();
        };
        const on_mouse_up = (e: MouseEvent) => {
            manager.pointer_up(get_coords(e));
            e.preventDefault();
        };
        const on_mouse_move = (e: MouseEvent) => {
            const coords = get_coords(e);
            manager.pointer_move(coords);
            mouse_over_scene = coords.y >= scene_top;
            if (mouse_over_scene) {
                query_rect = {
                    left: coords.x - 45,
                    top: coords.y - 45,
                    width: 90,
                    height: 90,
                };
            }
        };
        const on_mouse_leave = () => {
            manager.pointer_exit();
            mouse_over_scene = false;
        };

        canvas.addEventListener("mousedown", on_mouse_down);
        canvas.addEventListener("mouseup", on_mouse_up);
        canvas.addEventListener("mousemove", on_mouse_move);
        canvas.addEventListener("mouseleave", on_mouse_leave);

        render();

        console.log(
            "Playground demo created. UI sliders/checkbox drive gravity, ball count and QuadTree visibility live, while the balls bounce and a mouse-driven QuadTree query highlights nearby balls without scanning them all.",
        );
    }
}
