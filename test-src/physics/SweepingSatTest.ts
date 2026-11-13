import { TestClass } from "../../src";
import { Rect } from "../../src";
import { PolygonI, Vector2I } from "../../src";
import { sat_move, sat_overlap } from "../../src";

type Mode = "naive" | "swept";

/** A square bullet; the game owns it and moves it, `sat_*` only answers. */
class Bullet {
    public x: number;
    public y: number;
    public velocity: Vector2I;
    public size: number;
    public tunneled: boolean = false;
    public blocked: boolean = false;
    public blocked_at: number | null = null;

    public constructor(x: number, y: number, velocity: Vector2I, size: number) {
        this.x = x;
        this.y = y;
        this.velocity = velocity;
        this.size = size;
    }

    public get rect(): Rect {
        return new Rect(this.x, this.y, this.size, this.size);
    }

    public get polygon(): PolygonI {
        return {
            points: [
                { x: this.x, y: this.y },
                { x: this.x + this.size, y: this.y },
                { x: this.x + this.size, y: this.y + this.size },
                { x: this.x, y: this.y + this.size },
            ],
        };
    }
}

export class SweepingSatTest extends TestClass {
    private animation_frame: number | null = null;
    private canvas: HTMLCanvasElement | null = null;
    private click_handler: ((e: MouseEvent) => void) | null = null;

    public get_name(): string {
        return "Sweeping SAT (sat_move)";
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
        const wall_polygon: PolygonI = {
            points: [
                { x: wall.left, y: wall.top },
                { x: wall.left + wall.width, y: wall.top },
                { x: wall.left + wall.width, y: wall.top + wall.height },
                { x: wall.left, y: wall.top + wall.height },
            ],
        };

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
            bullets.push(new Bullet(0, top, { x: speed, y: 0 }, size));
            total_fired++;
        };

        // Naive mode: move first, only check for an overlap afterwards.
        // A bullet whose movement carries it entirely past the wall in one
        // frame is never caught by the overlap check, so it tunnels through.
        const step_naive = (bullet: Bullet, dt: number) => {
            const before_left = bullet.x;
            bullet.x += bullet.velocity.x * dt;
            bullet.y += bullet.velocity.y * dt;
            if (before_left < wall.left && bullet.x > wall.get_right()) {
                bullet.tunneled = true;
                tunneled_count++;
            } else if (sat_overlap(bullet.polygon, wall_polygon) !== null) {
                bullet.velocity.x = 0;
                bullet.blocked = true;
                bullet.blocked_at = performance.now();
            }
        };

        // Swept mode: sat_move looks at the whole path of the move, so the
        // bullet always stops at the wall's surface, however fast it is.
        const step_swept = (bullet: Bullet, dt: number) => {
            const delta = {
                x: bullet.velocity.x * dt,
                y: bullet.velocity.y * dt,
            };
            const moved = sat_move(bullet.polygon, delta, [wall_polygon]);
            bullet.x += moved.offset.x;
            bullet.y += moved.offset.y;
            if (moved.hits.length > 0) {
                bullet.velocity.x = 0;
                bullet.blocked = true;
                bullet.blocked_at = performance.now();
                blocked_count++;
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

            for (const bullet of bullets) {
                if (bullet.blocked) {
                    continue;
                }
                if (mode === "naive") {
                    step_naive(bullet, dt);
                } else {
                    step_swept(bullet, dt);
                }
            }

            bullets = bullets.filter((bullet) => {
                if (bullet.x > canvas.width + 20) {
                    return false;
                }
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
                ctx.fillRect(bullet.x, bullet.y, bullet.size, bullet.size);
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
            "Sweeping SAT physics demo created. In 'Naive' mode fast bullets visually tunnel straight through the thin wall because the overlap check runs after they already moved past it; toggle to 'Swept' mode to see sat_move's swept time-of-impact test clamp every bullet exactly at the wall surface, no matter how fast it travels.",
        );
    }
}
