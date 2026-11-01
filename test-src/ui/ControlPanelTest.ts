import {
    TestClass,
    UiManager,
    UiPage,
    Slider,
    CheckBox,
    ElementChangeEvent,
    Vector2,
    Rect,
    Vector2I,
} from "../../src";

class Ball {
    public position: Vector2;
    public velocity: Vector2;
    public trail: Vector2[] = [];
    public radius: number = 8;
    public color: string;

    constructor(x: number, y: number, color: string) {
        this.position = new Vector2(x, y);
        this.velocity = new Vector2(
            (Math.random() - 0.5) * 300,
            (Math.random() - 0.5) * 300,
        );
        this.color = color;
    }

    public update(
        dt: number,
        gravity: number,
        bounds: Rect,
        show_trails: boolean,
    ) {
        if (show_trails) {
            this.trail.push(this.position.cpy());
            if (this.trail.length > 15) {
                this.trail.shift();
            }
        } else {
            this.trail = [];
        }

        this.velocity.y += gravity * dt;
        this.position.add(this.velocity.cpy().mul(dt));

        // Bounce left/right
        if (this.position.x - this.radius < bounds.left) {
            this.position.x = bounds.left + this.radius;
            this.velocity.x *= -0.8;
        } else if (this.position.x + this.radius > bounds.get_right()) {
            this.position.x = bounds.get_right() - this.radius;
            this.velocity.x *= -0.8;
        }

        // Bounce top/bottom
        if (this.position.y - this.radius < bounds.top) {
            this.position.y = bounds.top + this.radius;
            this.velocity.y *= -0.8;
        } else if (this.position.y + this.radius > bounds.get_bottom()) {
            this.position.y = bounds.get_bottom() - this.radius;
            this.velocity.y *= -0.8;
        }
    }

    public draw(ctx: CanvasRenderingContext2D, show_trails: boolean) {
        if (show_trails && this.trail.length > 1) {
            ctx.beginPath();
            ctx.strokeStyle = this.color;
            ctx.globalAlpha = 0.3;
            ctx.lineWidth = this.radius * 1.5;
            ctx.lineCap = "round";
            ctx.lineJoin = "round";
            ctx.moveTo(this.trail[0].x, this.trail[0].y);
            for (let i = 1; i < this.trail.length; i++) {
                ctx.lineTo(this.trail[i].x, this.trail[i].y);
            }
            ctx.stroke();
            ctx.globalAlpha = 1.0;
        }

        ctx.beginPath();
        ctx.arc(this.position.x, this.position.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.fill();
        ctx.strokeStyle = "white";
        ctx.lineWidth = 2;
        ctx.stroke();
    }
}

export class ControlPanelTest extends TestClass {
    private animation_frame: number | null = null;
    private canvas: HTMLCanvasElement | null = null;
    private pointer_listeners: Map<string, EventListener> = new Map();

    public get_name(): string {
        return "UI: Live Control Panel";
    }

    public override tear_down() {
        if (this.animation_frame !== null) {
            cancelAnimationFrame(this.animation_frame);
            this.animation_frame = null;
        }
        if (this.canvas) {
            for (const [event, listener] of this.pointer_listeners) {
                this.canvas.removeEventListener(event, listener);
            }
            this.canvas.remove();
            this.canvas = null;
        }
    }

    public test_live_control_panel() {
        const test_container =
            document.querySelector(".test-dashboard__test-container") ||
            document.body;

        const canvas = document.createElement("canvas");
        canvas.width = 560;
        canvas.height = 360;
        canvas.className = "test-dashboard__demo-canvas";
        test_container.appendChild(canvas);
        this.canvas = canvas;

        const ctx = canvas.getContext("2d")!;
        const manager = new UiManager();

        const gravity_slider = new Slider("Gravity", 0, 800, 400, {
            left: 20,
            top: 25,
            width: 150,
            height: 40,
        });
        const ball_count_slider = new Slider("Ball Count", 1, 15, 5, {
            left: 190,
            top: 25,
            width: 150,
            height: 40,
        });
        const trails_checkbox = new CheckBox(true, {
            left: 360,
            top: 25,
            width: 180,
            height: 40,
        });

        const ui_height = 90;
        const page = new UiPage(
            { x: canvas.width, y: canvas.height },
            { left: 0, top: 0, width: 1, height: ui_height / canvas.height },
            { left: 0, top: 0, width: canvas.width, height: ui_height },
        );
        page.add(gravity_slider);
        page.add(ball_count_slider);
        page.add(trails_checkbox);
        manager.active_menu = page;

        const simulation_bounds = new Rect(
            0,
            ui_height,
            canvas.width,
            canvas.height - ui_height,
        );
        const balls: Ball[] = [];

        const colors = [
            "#2563eb",
            "#16a34a",
            "#dc2626",
            "#9333ea",
            "#ea580c",
            "#0891b2",
        ];

        const sync_balls = () => {
            const target_count = Math.round(ball_count_slider.value);
            while (balls.length < target_count) {
                const color = colors[balls.length % colors.length];
                balls.push(
                    new Ball(
                        simulation_bounds.left +
                            Math.random() * simulation_bounds.width,
                        simulation_bounds.top +
                            Math.random() * simulation_bounds.height,
                        color,
                    ),
                );
            }
            while (balls.length > target_count) {
                balls.pop();
            }
        };

        sync_balls();
        ball_count_slider.events.attach(ElementChangeEvent, sync_balls);

        let last_time = performance.now();
        const render = () => {
            const now = performance.now();
            const dt = Math.min(1 / 20, (now - last_time) / 1000);
            last_time = now;

            const gravity = gravity_slider.value;
            const show_trails = trails_checkbox.checked;

            ctx.clearRect(0, 0, canvas.width, canvas.height);

            // Simulation area background
            ctx.fillStyle = "#f8fafc";
            ctx.fillRect(0, ui_height, canvas.width, canvas.height - ui_height);

            // Divider line
            ctx.beginPath();
            ctx.moveTo(0, ui_height);
            ctx.lineTo(canvas.width, ui_height);
            ctx.strokeStyle = "#cbd5e1";
            ctx.lineWidth = 2;
            ctx.stroke();

            for (const ball of balls) {
                ball.update(dt, gravity, simulation_bounds, show_trails);
                ball.draw(ctx, show_trails);
            }

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

        const on_mousedown = ((e: MouseEvent) => {
            manager.pointer_down(get_coords(e));
            e.preventDefault();
        }) as EventListener;
        const on_mouseup = ((e: MouseEvent) => {
            manager.pointer_up(get_coords(e));
            e.preventDefault();
        }) as EventListener;
        const on_mousemove = ((e: MouseEvent) => {
            manager.pointer_move(get_coords(e));
            e.preventDefault();
        }) as EventListener;
        const on_mouseleave = (() => manager.pointer_exit()) as EventListener;

        canvas.addEventListener("mousedown", on_mousedown);
        canvas.addEventListener("mouseup", on_mouseup);
        canvas.addEventListener("mousemove", on_mousemove);
        canvas.addEventListener("mouseleave", on_mouseleave);

        this.pointer_listeners.set("mousedown", on_mousedown);
        this.pointer_listeners.set("mouseup", on_mouseup);
        this.pointer_listeners.set("mousemove", on_mousemove);
        this.pointer_listeners.set("mouseleave", on_mouseleave);

        render();

        console.log(
            "Live control panel demo created. Adjust the sliders and checkbox to see how UI elements can directly drive simulation parameters in real-time.",
        );
    }
}
