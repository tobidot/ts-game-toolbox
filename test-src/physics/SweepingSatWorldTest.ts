import { TestClass } from "../../src";
import { Rect } from "../../src";
import { Vector2I } from "../../src";
import { PhysicsBody, SweepingSatWorld } from "../../src";

type Mode = "naive" | "swept";

class Bullet {
    public body: PhysicsBody<void>;
    public width: number;
    public height: number;
    public tunneled: boolean = false;
    public blocked: boolean = false;
    public blocked_at: number | null = null;

    public constructor(body: PhysicsBody<void>, width: number, height: number) {
        this.body = body;
        this.width = width;
        this.height = height;
    }

    public get rect(): Rect {
        return new Rect(
            this.body.position.x,
            this.body.position.y,
            this.width,
            this.height,
        );
    }
}

export class SweepingSatWorldTest extends TestClass {
    private animation_frame: number | null = null;
    private canvas: HTMLCanvasElement | null = null;
    private click_handler: ((e: MouseEvent) => void) | null = null;

    public get_name(): string {
        return "Sweeping SAT Physics";
    }

    public override tear_down() {
        if (this.animation_frame !== null) {
            cancelAnimationFrame(this.animation_frame);
            this.animation_frame = null;
        }
        if (this.canvas !== null && this.click_handler !== null) {
            this.canvas.removeEventListener("click", this.click_handler);
        }
        this.canvas = null;
        this.click_handler = null;
    }

    public test_bullets_vs_wall() {
        const test_container =
            document.querySelector(".test-dashboard__test-container") ||
            document.body;

        const canvas = document.createElement("canvas");
        canvas.width = 500;
        canvas.height = 300;
        canvas.className = "test-dashboard__demo-canvas";
        test_container.appendChild(canvas);
        this.canvas = canvas;

        const ctx = canvas.getContext("2d")!;

        // A thin static wall, vertically centered on the horizontal axis.
        const wall = new Rect(canvas.width / 2 - 6, 45, 12, canvas.height - 55);
        const wall_shape = {
            points: [
                { x: 0, y: 0 },
                { x: wall.width, y: 0 },
                { x: wall.width, y: wall.height },
                { x: 0, y: wall.height },
            ],
        };
        const wall_body = new PhysicsBody<void>(
            wall_shape,
            { x: wall.left, y: wall.top },
            { x: 0, y: 0 },
            true,
        );

        const world = new SweepingSatWorld();

        let mode: Mode = "naive";
        let bullets: Array<Bullet> = [];
        let total_fired = 0;
        let tunneled_count = 0;
        let blocked_count = 0;
        let spawn_timer = 0;
        let spawn_index = 0;

        const toggle_button = new Rect(canvas.width - 112, 8, 102, 26);

        const spawn_bullet = () => {
            const size = 8;
            // Every fifth bullet is an extra "turbo" bullet, guaranteed to be
            // fast enough to reliably skip clean over the thin wall.
            const is_turbo = spawn_index % 5 === 4;
            spawn_index++;
            const speed = is_turbo
                ? 2400 + Math.random() * 600
                : 1200 + Math.random() * 800;
            const top = wall.top + Math.random() * (wall.height - size);
            const bullet_shape = {
                points: [
                    { x: 0, y: 0 },
                    { x: size, y: 0 },
                    { x: size, y: size },
                    { x: 0, y: size },
                ],
            };
            const body = new PhysicsBody<void>(
                bullet_shape,
                { x: 0, y: top },
                { x: speed, y: 0 },
                false,
            );
            bullets.push(new Bullet(body, size, size));
            total_fired++;
        };

        // Naive mode: move first, only check for an overlap afterwards.
        // A bullet whose movement carries it entirely past the wall in one
        // frame is never caught by the overlap check, so it tunnels through.
        const step_naive = (bullet: Bullet, dt: number) => {
            const before_left = bullet.body.position.x;
            bullet.body.position.x += bullet.body.velocity.x * dt;
            bullet.body.position.y += bullet.body.velocity.y * dt;
            if (
                before_left < wall.left &&
                bullet.body.position.x > wall.get_right()
            ) {
                bullet.tunneled = true;
                tunneled_count++;
            } else if (Rect.intersects(bullet.rect, wall)) {
                bullet.body.velocity.x = 0;
                bullet.blocked = true;
                bullet.blocked_at = performance.now();
            }
        };

        // Swept mode: let the SweepingSatWorld clamp movement to the time of
        // impact, so the bullet always stops exactly at the wall surface.
        const step_swept = (dt: number) => {
            world.bodies = [wall_body, ...bullets.map((bullet) => bullet.body)];
            world.update(dt);
            for (const bullet of bullets) {
                if (
                    !bullet.blocked &&
                    bullet.body.velocity.x === 0 &&
                    bullet.body.velocity.y === 0
                ) {
                    bullet.blocked = true;
                    bullet.blocked_at = performance.now();
                    blocked_count++;
                }
            }
        };

        let last_time = performance.now();
        const render = () => {
            const now = performance.now();
            const dt = Math.min(1 / 15, (now - last_time) / 1000);
            last_time = now;

            spawn_timer -= dt;
            if (spawn_timer <= 0) {
                spawn_bullet();
                spawn_timer = 0.12 + Math.random() * 0.08;
            }

            if (mode === "naive") {
                for (const bullet of bullets) {
                    if (bullet.blocked) continue;
                    step_naive(bullet, dt);
                }
            } else {
                step_swept(dt);
            }

            bullets = bullets.filter((bullet) => {
                if (bullet.body.position.x > canvas.width + 20) return false;
                if (
                    bullet.blocked &&
                    bullet.blocked_at !== null &&
                    now - bullet.blocked_at > 1000
                ) {
                    return false;
                }
                return true;
            });

            ctx.clearRect(0, 0, canvas.width, canvas.height);

            ctx.fillStyle = "#1f2937";
            ctx.fillRect(wall.left, wall.top, wall.width, wall.height);

            for (const bullet of bullets) {
                ctx.fillStyle = bullet.tunneled
                    ? "#dc2626"
                    : bullet.blocked
                      ? "#f59e0b"
                      : "#2563eb";
                ctx.fillRect(
                    bullet.body.position.x,
                    bullet.body.position.y,
                    bullet.width,
                    bullet.height,
                );
            }

            ctx.fillStyle = mode === "naive" ? "#dc2626" : "#16a34a";
            ctx.fillRect(
                toggle_button.left,
                toggle_button.top,
                toggle_button.width,
                toggle_button.height,
            );
            ctx.fillStyle = "#fff";
            ctx.font = "12px sans-serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(
                mode === "naive" ? "Mode: Naive" : "Mode: Swept",
                toggle_button.center.x,
                toggle_button.center.y,
            );
            ctx.textAlign = "left";
            ctx.textBaseline = "alphabetic";

            ctx.fillStyle = "#111";
            ctx.font = "13px sans-serif";
            ctx.fillText(`Fired: ${total_fired}`, 10, 18);
            ctx.fillText(`Tunneled: ${tunneled_count}`, 10, 34);
            ctx.fillText(`Blocked: ${blocked_count}`, 140, 34);

            this.animation_frame = requestAnimationFrame(render);
        };

        render();

        const get_coords = (e: MouseEvent): Vector2I => {
            const bounding_rect = canvas.getBoundingClientRect();
            return {
                x: e.clientX - bounding_rect.left,
                y: e.clientY - bounding_rect.top,
            };
        };

        this.click_handler = (e: MouseEvent) => {
            const coords = get_coords(e);
            if (toggle_button.contains(coords)) {
                mode = mode === "naive" ? "swept" : "naive";
            }
        };
        canvas.addEventListener("click", this.click_handler);

        console.log(
            "Sweeping SAT physics demo created. In 'Naive' mode fast bullets visually tunnel straight through the thin wall because the overlap check runs after they already moved past it; toggle to 'Swept' mode to see SweepingSatWorld's swept-AABB time-of-impact test clamp every bullet exactly at the wall surface, no matter how fast it travels.",
        );
    }
}
