import { TestClass } from "../../src/testing/TestClass";
import { Polygon } from "../../src/geometries/Polygon";
import { Vector2 } from "../../src/geometries/Vector2";

export class PolygonTest extends TestClass {
    public get_name(): string {
        return "Polygon Visual Test";
    }

    public test_polygon_visualization() {
        const test_container =
            document.querySelector(".test-dashboard__test-container") ||
            document.body;

        const canvas = document.createElement("canvas");
        canvas.width = 400;
        canvas.height = 300;
        canvas.style.border = "1px solid black";
        canvas.style.display = "block";
        canvas.style.marginTop = "10px";
        test_container.appendChild(canvas);

        const ctx = canvas.getContext("2d")!;
        const polygon = new Polygon([
            new Vector2(200, 50),
            new Vector2(300, 250),
            new Vector2(100, 250),
        ]);

        ctx.beginPath();
        ctx.moveTo(polygon.points[0].x, polygon.points[0].y);
        for (let i = 1; i < polygon.points.length; i++) {
            ctx.lineTo(polygon.points[i].x, polygon.points[i].y);
        }
        ctx.closePath();
        ctx.strokeStyle = "blue";
        ctx.stroke();

        const test_points = [new Vector2(200, 150), new Vector2(50, 50)];

        test_points.forEach((p) => {
            const inside = polygon.contains(p);
            ctx.fillStyle = inside ? "green" : "red";
            ctx.beginPath();
            ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillText(inside ? "Inside" : "Outside", p.x + 10, p.y);
        });

        console.log(
            "Polygon visualization created. Green dots are inside, red dots are outside.",
        );
    }
}
