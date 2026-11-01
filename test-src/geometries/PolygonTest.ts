import { TestClass } from "../../src/testing/TestClass";
import { Polygon } from "../../src/geometries/Polygon";
import { Vector2 } from "../../src/geometries/Vector2";

class FallingBall {
    public position: Vector2;
    public velocity: Vector2;
    public radius: number;

    public constructor(position: Vector2, velocity: Vector2, radius: number) {
        this.position = position;
        this.velocity = velocity;
        this.radius = radius;
    }

    public step(
        gravity: number,
        bounds_width: number,
        bounds_height: number,
        dt: number,
    ): void {
        this.velocity.y += gravity * dt;
        this.position.add(this.velocity.cpy().mul(dt));

        if (this.position.x - this.radius < 0) {
            this.position.x = this.radius;
            this.velocity.x *= -0.9;
        }
        if (this.position.x + this.radius > bounds_width) {
            this.position.x = bounds_width - this.radius;
            this.velocity.x *= -0.9;
        }
        if (this.position.y + this.radius > bounds_height) {
            this.position.y = bounds_height - this.radius;
            this.velocity.y *= -0.7;
        }
        if (this.position.y - this.radius < 0) {
            this.position.y = this.radius;
            this.velocity.y *= -0.7;
        }
    }
}

export class PolygonTest extends TestClass {
    private animation_frame: number | null = null;

    public get_name(): string {
        return "Polygon Containment Physics";
    }

    public override tear_down() {
        if (this.animation_frame !== null) {
            cancelAnimationFrame(this.animation_frame);
            this.animation_frame = null;
        }
    }

    public test_polygon_containment_physics() {
        const test_container =
            document.querySelector(".test-dashboard__test-container") ||
            document.body;

        const canvas = document.createElement("canvas");
        canvas.width = 400;
        canvas.height = 300;
        canvas.className = "test-dashboard__demo-canvas";
        test_container.appendChild(canvas);

        const ctx = canvas.getContext("2d")!;
        const center = new Vector2(200, 170);

        // A slowly spinning hexagon acting as the "bowl" the balls fall into
        const build_polygon = (angle: number): Polygon => {
            const points = [];
            const sides = 6;
            const radius = 90;
            for (let i = 0; i < sides; i++) {
                const point_angle = angle + (i / sides) * Math.PI * 2;
                points.push(
                    new Vector2(center).add(
                        Vector2.from_angle(point_angle, radius),
                    ),
                );
            }
            return new Polygon(points);
        };

        const balls = [
            new FallingBall(new Vector2(150, 20), new Vector2(30, 0), 10),
            new FallingBall(new Vector2(220, 40), new Vector2(-20, 0), 12),
            new FallingBall(new Vector2(280, 10), new Vector2(-40, 0), 8),
        ];

        const gravity = 220;
        const start_time = performance.now();
        let last_time = start_time;
        const render = () => {
            const now = performance.now();
            const dt = Math.min(1 / 20, (now - last_time) / 1000);
            last_time = now;

            const angle = (now - start_time) / 4000;
            const polygon = build_polygon(angle);

            let inside_count = 0;
            balls.forEach((ball) => {
                ball.step(gravity, canvas.width, canvas.height, dt);
            });

            ctx.clearRect(0, 0, canvas.width, canvas.height);

            ctx.beginPath();
            ctx.moveTo(polygon.points[0].x, polygon.points[0].y);
            for (let i = 1; i < polygon.points.length; i++) {
                ctx.lineTo(polygon.points[i].x, polygon.points[i].y);
            }
            ctx.closePath();
            ctx.strokeStyle = "#2563eb";
            ctx.lineWidth = 2;
            ctx.stroke();

            balls.forEach((ball) => {
                const inside = polygon.contains(ball.position);
                if (inside) inside_count++;
                ctx.fillStyle = inside ? "#16a34a" : "#dc2626";
                ctx.beginPath();
                ctx.arc(
                    ball.position.x,
                    ball.position.y,
                    ball.radius,
                    0,
                    Math.PI * 2,
                );
                ctx.fill();
            });

            ctx.fillStyle = "#111";
            ctx.font = "14px sans-serif";
            ctx.fillText(
                `Polygon.contains(): ${inside_count}/${balls.length} balls currently inside the hexagon`,
                10,
                20,
            );

            this.animation_frame = requestAnimationFrame(render);
        };

        render();

        console.log(
            "Polygon containment physics demo created. Gravity-driven balls turn green while Polygon.contains() reports them inside the spinning hexagon, red otherwise.",
        );
    }
}
