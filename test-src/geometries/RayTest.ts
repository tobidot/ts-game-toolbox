import { TestClass, Ray, Vector2, Rect, Polygon } from "../../src";

export class RayTest extends TestClass {
    private animation_frame: number | null = null;
    private mouse_pos: Vector2 = new Vector2(400, 175);
    private readonly origin: Vector2 = new Vector2(50, 175);
    private obstacles: Rect[] = [];

    public get_name(): string {
        return "Geometry: Raycasting";
    }

    public override tear_down(): void {
        if (this.animation_frame !== null) {
            cancelAnimationFrame(this.animation_frame);
            this.animation_frame = null;
        }
        window.removeEventListener("mousemove", this.on_mouse_move);
    }

    private on_mouse_move = (e: MouseEvent): void => {
        const canvas = document.querySelector(
            ".test-dashboard__demo-canvas",
        ) as HTMLCanvasElement;
        if (!canvas) {
            return;
        }
        const rect = canvas.getBoundingClientRect();
        this.mouse_pos.set(e.clientX - rect.left, e.clientY - rect.top);
    };

    public test_raycasting(): void {
        const test_container =
            document.querySelector(".test-dashboard__test-container") ||
            document.body;

        const canvas = document.createElement("canvas");
        canvas.width = 500;
        canvas.height = 350;
        canvas.className = "test-dashboard__demo-canvas";
        test_container.appendChild(canvas);

        window.addEventListener("mousemove", this.on_mouse_move);

        const ctx = canvas.getContext("2d");
        if (!ctx) {
            return;
        }

        this.obstacles = [
            new Rect(150, 50, 80, 80),
            new Rect(300, 120, 60, 100),
            new Rect(120, 220, 120, 40),
            new Rect(380, 40, 50, 50),
        ];
        const obstacle_polygons = this.obstacles.map(
            (rect) => new Polygon(rect.get_corners()),
        );

        const render = (): void => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            // Draw obstacles
            ctx.strokeStyle = "#16a34a";
            ctx.fillStyle = "rgba(22, 163, 74, 0.1)";
            ctx.lineWidth = 2;
            for (const rect of this.obstacles) {
                ctx.beginPath();
                ctx.rect(rect.left, rect.top, rect.width, rect.height);
                ctx.fill();
                ctx.stroke();
            }

            // Draw origin
            ctx.fillStyle = "#2563eb";
            ctx.beginPath();
            ctx.arc(this.origin.x, this.origin.y, 5, 0, Math.PI * 2);
            ctx.fill();

            // Create cast ray, aimed from the origin towards the mouse
            const cast_ray = Ray.from_points(this.origin, this.mouse_pos);

            // Ask the library for every hit against every obstacle, then
            // keep only the nearest one across all of them.
            let nearest_hit: Vector2 | null = null;
            let nearest_normal: Vector2 | null = null;
            let nearest_distance = Infinity;
            for (const polygon of obstacle_polygons) {
                const hit = cast_ray.get_nearest_polygon_hit(polygon);
                if (hit !== null && hit.distance < nearest_distance) {
                    nearest_distance = hit.distance;
                    nearest_hit = hit.point;
                    nearest_normal = hit.normal;
                }
            }

            // Draw ray path (full guide)
            ctx.setLineDash([5, 5]);
            ctx.strokeStyle = "#999";
            ctx.beginPath();
            ctx.moveTo(this.origin.x, this.origin.y);
            ctx.lineTo(this.mouse_pos.x, this.mouse_pos.y);
            ctx.stroke();
            ctx.setLineDash([]);

            if (nearest_hit) {
                // Ray up to hit
                ctx.strokeStyle = "#2563eb";
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.moveTo(this.origin.x, this.origin.y);
                ctx.lineTo(nearest_hit.x, nearest_hit.y);
                ctx.stroke();

                // Hit marker
                ctx.fillStyle = "#dc2626";
                ctx.beginPath();
                ctx.arc(nearest_hit.x, nearest_hit.y, 4, 0, Math.PI * 2);
                ctx.fill();

                // Normal
                if (nearest_normal) {
                    ctx.strokeStyle = "#dc2626";
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.moveTo(nearest_hit.x, nearest_hit.y);
                    ctx.lineTo(
                        nearest_hit.x + nearest_normal.x * 30,
                        nearest_hit.y + nearest_normal.y * 30,
                    );
                    ctx.stroke();
                }

                // Distance label
                ctx.fillStyle = "#111";
                ctx.font = "12px sans-serif";
                const dist = nearest_hit.cpy().sub(this.origin).len();
                ctx.fillText(
                    `dist: ${dist.toFixed(1)}`,
                    nearest_hit.x + 10,
                    nearest_hit.y - 10,
                );
            }

            this.animation_frame = requestAnimationFrame(render);
        };

        render();

        console.log(
            "Raycasting showcase demo created. Highlights the Ray.get_polygon_hit() library function by " +
                "casting a mouse-aimed ray against rectangular obstacles, calculating the nearest intersection " +
                "points and surface normals.",
        );
    }
}
