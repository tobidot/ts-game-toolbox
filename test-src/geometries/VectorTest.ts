import { TestClass } from "../../src/testing/TestClass";
import { Vector2 } from "../../src/geometries/Vector2";
import { Ray } from "../../src/geometries/Ray";

export class VectorTest extends TestClass {
    private animation_frame: number | null = null;

    public get_name(): string {
        return "Vector2 & Ray Visualization";
    }

    public override tear_down() {
        if (this.animation_frame !== null) {
            cancelAnimationFrame(this.animation_frame);
            this.animation_frame = null;
        }
    }

    public test_vector_and_ray_visualization() {
        const test_container =
            document.querySelector(".test-dashboard__test-container") ||
            document.body;

        const canvas = document.createElement("canvas");
        canvas.width = 400;
        canvas.height = 300;
        canvas.className = "test-dashboard__demo-canvas";
        test_container.appendChild(canvas);

        const ctx = canvas.getContext("2d")!;
        const origin = new Vector2(200, 150);

        // A fixed ray used as a "wall" to cast against
        const wall = Ray.from_points({ x: 50, y: 200 }, { x: 200, y: 290 });

        const draw_arrow = (
            from: Vector2,
            to: Vector2,
            color: string,
            label?: string,
        ) => {
            ctx.strokeStyle = color;
            ctx.fillStyle = color;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(from.x, from.y);
            ctx.lineTo(to.x, to.y);
            ctx.stroke();

            const head = to.cpy().sub(from).normalize().mul(10);
            const left = head.cpy().rotate_radians_clockwise((Math.PI * 3) / 4);
            const right = head
                .cpy()
                .rotate_radians_clockwise((-Math.PI * 3) / 4);
            ctx.beginPath();
            ctx.moveTo(to.x, to.y);
            ctx.lineTo(to.x + left.x, to.y + left.y);
            ctx.lineTo(to.x + right.x, to.y + right.y);
            ctx.closePath();
            ctx.fill();

            if (label) {
                ctx.fillText(label, to.x + 6, to.y - 6);
            }
        };

        const start_time = performance.now();
        const render = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            // draw the static "wall" ray
            const wall_end = wall.point.cpy().add(wall.direction);
            ctx.strokeStyle = "#888";
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(wall.point.x, wall.point.y);
            ctx.lineTo(wall_end.x, wall_end.y);
            ctx.stroke();
            ctx.fillStyle = "#888";
            ctx.fillText("wall", wall_end.x - 30, wall_end.y - 6);

            // rotating unit vector, driven by time
            const t = (performance.now() - start_time) / 1000;
            const angle = t * 0.8;
            const tip = new Vector2(origin).add(Vector2.from_angle(angle, 90));
            draw_arrow(origin, tip, "#2563eb", "rotating");

            // static reference vector
            const reference_tip = new Vector2(origin).add(
                Vector2.from_angle(Math.PI / 4, 90),
            );
            draw_arrow(origin, reference_tip, "#16a34a", "reference");

            // dot product / angle between the two vectors
            const rotating_normal = tip.cpy().sub(origin).normalize();
            const reference_normal = reference_tip
                .cpy()
                .sub(origin)
                .normalize();
            const dot = rotating_normal.dot(reference_normal);
            const angle_between =
                (Math.acos(Math.max(-1, Math.min(1, dot))) * 180) / Math.PI;

            // cast the rotating vector as a ray against the wall
            const rotating_ray = new Ray(origin, rotating_normal);
            const intersections = rotating_ray.get_ray_intersections(wall);
            const is_forward_hit = intersections.find((hit) => {
                const projection = rotating_ray.get_vector_projection(hit);
                return projection > 0;
            });
            const wall_projection = is_forward_hit
                ? wall.get_vector_projection(is_forward_hit)
                : 0;
            const is_wall_hit =
                is_forward_hit &&
                wall_projection > 0 &&
                wall_projection < wall.direction.len();

            if (is_forward_hit) {
                ctx.fillStyle = is_wall_hit ? "red" : "orange";
                ctx.beginPath();
                ctx.arc(is_forward_hit.x, is_forward_hit.y, 5, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillText("hit", is_forward_hit.x + 8, is_forward_hit.y + 4);
            }

            ctx.fillStyle = "#111";
            ctx.font = "14px sans-serif";
            ctx.fillText(
                `dot(rotating, reference) = ${dot.toFixed(2)}`,
                10,
                20,
            );
            ctx.fillText(
                `angle between = ${angle_between.toFixed(1)}°`,
                10,
                40,
            );
            ctx.fillText(
                is_forward_hit
                    ? is_wall_hit
                        ? `ray hits wall at (${is_forward_hit.x.toFixed(0)}, ${is_forward_hit.y.toFixed(0)})`
                        : `ray hits wall-straight at (${is_forward_hit.x.toFixed(0)}, ${is_forward_hit.y.toFixed(0)})`
                    : "ray does not currently hit the wall",
                10,
                60,
            );

            this.animation_frame = requestAnimationFrame(render);
        };

        render();

        console.log(
            "Vector2 & Ray visualization created. The blue vector rotates continuously, casting a ray against the gray wall.",
        );
    }
}
