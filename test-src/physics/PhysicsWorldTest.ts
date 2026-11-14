import { TestClass } from "../../src";
import {
    COLLISION_RULES,
    PhysicsBody,
    PhysicsWorld,
    PolygonI,
    Rect,
    Vector2I,
} from "../../src";

type Kind = "crate" | "bullet" | "wall";

const BULLET_SPEED = 1800;
const BULLET_EVERY_SECONDS = 0.6;
const MAX_CRATES = 120;

/** A convex polygon of `corners` corners around the origin. */
function regular_shape(
    corners: number,
    radius: number,
    turn: number,
): PolygonI {
    const points: Vector2I[] = [];
    for (let index = 0; index < corners; index++) {
        const angle = turn + (index / corners) * Math.PI * 2;
        points.push({
            x: Math.cos(angle) * radius,
            y: Math.sin(angle) * radius,
        });
    }
    return { points };
}

/** A box around the origin. */
function box_shape(width: number, height: number): PolygonI {
    return {
        points: [
            { x: -width / 2, y: -height / 2 },
            { x: width / 2, y: -height / 2 },
            { x: width / 2, y: height / 2 },
            { x: -width / 2, y: height / 2 },
        ],
    };
}

const SHAPES: PolygonI[] = [
    box_shape(28, 28),
    regular_shape(3, 18, -Math.PI / 2),
    regular_shape(6, 16, 0),
    box_shape(44, 16),
];

/**
 * `PhysicsWorld`: a world that owns its bodies. A click drops a shape, the button switches the
 * collision rule, and a fast bullet flies at the thin wall now and then: with `AABB` it jumps
 * through, the swept rules stop it. Spielwerk step 27 (Sandkasten) is the full demo.
 */
export class PhysicsWorldTest extends TestClass {
    private animation_frame: number | null = null;
    private canvas: HTMLCanvasElement | null = null;
    private click_handler: ((event: MouseEvent) => void) | null = null;

    public get_name(): string {
        return "Physics World (rules, click to spawn)";
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

    public test_physics_world() {
        const test_container =
            document.querySelector(".test-dashboard__test-container") ||
            document.body;
        const canvas = document.createElement("canvas");
        canvas.width = 640;
        canvas.height = 400;
        canvas.className = "test-dashboard__demo-canvas";
        test_container.appendChild(canvas);
        this.canvas = canvas;
        const ctx = canvas.getContext("2d")!;

        const world = new PhysicsWorld<Kind>({
            gravity: { x: 0, y: 900 },
            restitution: 0.2,
            friction: 0.1,
        });
        let rule_index = COLLISION_RULES.indexOf(world.rule);
        const add_wall = (rect: Rect) => {
            world.add({
                shape: box_shape(rect.width, rect.height),
                position: {
                    x: rect.left + rect.width / 2,
                    y: rect.top + rect.height / 2,
                },
                is_static: true,
                data: "wall",
            });
        };
        add_wall(new Rect(0, canvas.height - 20, canvas.width, 20));
        add_wall(new Rect(0, 40, 12, canvas.height - 60));
        add_wall(new Rect(canvas.width - 12, 40, 12, canvas.height - 60));
        // The thin wall the bullets fly at.
        add_wall(new Rect(470, 150, 6, canvas.height - 170));
        // A ramp, as a still triangle.
        world.add({
            shape: {
                points: [
                    { x: 0, y: 0 },
                    { x: 160, y: 0 },
                    { x: 0, y: -90 },
                ],
            },
            position: { x: 12, y: canvas.height - 20 },
            is_static: true,
            data: "wall",
        });

        let shape_index = 0;
        let fired = 0;
        let crossed = 0;
        let bullet_seconds = 0;
        const crates: PhysicsBody<Kind>[] = [];
        const bullets: PhysicsBody<Kind>[] = [];

        const spawn_crate = (point: Vector2I) => {
            crates.push(
                world.add({
                    shape: SHAPES[shape_index % SHAPES.length],
                    position: { x: point.x, y: point.y },
                    velocity: { x: 0, y: 0 },
                    data: "crate",
                }),
            );
            shape_index += 1;
            if (crates.length > MAX_CRATES) {
                world.remove(crates.shift()!);
            }
        };
        const fire_bullet = () => {
            bullets.push(
                world.add({
                    shape: box_shape(8, 8),
                    // A step is 30 units at this speed: start each one a little
                    // further on, so the steps meet the wall in another place.
                    position: { x: 380 + ((fired * 7) % 30), y: 250 },
                    velocity: { x: BULLET_SPEED, y: -100 },
                    mass: 0.2,
                    data: "bullet",
                }),
            );
            fired += 1;
        };

        const button = new Rect(canvas.width - 170, 8, 160, 26);
        this.click_handler = (event: MouseEvent) => {
            const box = canvas.getBoundingClientRect();
            const point = {
                x: ((event.clientX - box.left) * canvas.width) / box.width,
                y: ((event.clientY - box.top) * canvas.height) / box.height,
            };
            if (button.contains(point)) {
                rule_index = (rule_index + 1) % COLLISION_RULES.length;
                world.rule = COLLISION_RULES[rule_index];
                fired = 0;
                crossed = 0;
                console.log(`Rule: ${world.rule.name}`);
                return;
            }
            spawn_crate(point);
        };
        canvas.addEventListener("click", this.click_handler);

        // A small pile to start with.
        for (let index = 0; index < 8; index++) {
            spawn_crate({ x: 230 + (index % 4) * 40, y: 80 + index * 20 });
        }

        const draw_body = (body: PhysicsBody<Kind>) => {
            const points = body.polygon.points;
            ctx.beginPath();
            ctx.moveTo(points[0].x, points[0].y);
            for (let index = 1; index < points.length; index++) {
                ctx.lineTo(points[index].x, points[index].y);
            }
            ctx.closePath();
            if (body.data === "wall") {
                ctx.fillStyle = "#1e293b";
            } else if (body.data === "bullet") {
                ctx.fillStyle = "#dc2626";
            } else if (body.is_sleeping) {
                ctx.fillStyle = "#94a3b8";
            } else {
                ctx.fillStyle = "#f59e0b";
            }
            ctx.fill();
        };

        let last_time: number | null = null;
        const frame = (time: number) => {
            const delta_seconds =
                last_time === null
                    ? 0
                    : Math.min(0.1, (time - last_time) / 1000);
            last_time = time;

            bullet_seconds += delta_seconds;
            if (bullet_seconds >= BULLET_EVERY_SECONDS) {
                bullet_seconds = 0;
                fire_bullet();
            }
            world.update(delta_seconds);
            for (let index = bullets.length - 1; index >= 0; index--) {
                const bullet = bullets[index];
                const is_gone =
                    bullet.position.x > 476 ||
                    Math.abs(bullet.velocity.x) < BULLET_SPEED / 2;
                if (is_gone) {
                    if (bullet.position.x > 476) {
                        crossed += 1;
                    }
                    world.remove(bullet);
                    bullets.splice(index, 1);
                }
            }

            ctx.clearRect(0, 0, canvas.width, canvas.height);
            for (const body of world.bodies) {
                draw_body(body);
            }

            ctx.fillStyle = "#2563eb";
            ctx.fillRect(button.left, button.top, button.width, button.height);
            ctx.fillStyle = "#ffffff";
            ctx.font = "13px sans-serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(
                `Rule: ${world.rule.name}`,
                button.left + button.width / 2,
                button.top + button.height / 2,
            );

            const stats = world.stats;
            ctx.fillStyle = "#0f172a";
            ctx.textAlign = "left";
            ctx.textBaseline = "top";
            ctx.fillText(
                `Bodies ${stats.bodies}, asleep ${stats.sleeping}, step ${stats.step_ms.toFixed(2)} ms`,
                20,
                10,
            );
            ctx.fillText(
                `Bullets ${fired}, through the thin wall ${crossed}`,
                20,
                26,
            );
            ctx.fillStyle = "#cbd5e1";
            ctx.fillText(
                "Click to drop a shape. Full demo: Spielwerk step 27 (Sandkasten)",
                20,
                canvas.height - 16,
            );
            this.animation_frame = requestAnimationFrame(frame);
        };
        this.animation_frame = requestAnimationFrame(frame);

        console.log(
            "PhysicsWorld demo: click to drop a shape, the button cycles AABB, AABB_SWEEP and SAT_SWEEP. " +
                "A bullet flies at the thin wall every 0.6 s: AABB lets it through, the swept rules stop it. " +
                "Full demo: https://www.game-object.de/pages/spielwerk/27-sandkasten",
        );
    }
}
