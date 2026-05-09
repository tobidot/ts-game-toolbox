import { TestClass } from "../../src/testing/TestClass";
import { Rect } from "../../src/geometries/Rect";

export class RectTest extends TestClass {
    public get_name(): string {
        return "Rect Visual Test";
    }

    public test_rect_visualization() {
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
        const rect1 = new Rect(50, 50, 100, 100);
        const rect2 = new Rect(100, 100, 100, 100);

        ctx.strokeStyle = "blue";
        ctx.strokeRect(rect1.left, rect1.top, rect1.width, rect1.height);
        ctx.fillText("Rect 1", rect1.left, rect1.top - 5);

        ctx.strokeStyle = "red";
        ctx.strokeRect(rect2.left, rect2.top, rect2.width, rect2.height);
        ctx.fillText("Rect 2", rect2.left, rect2.top - 5);

        const overlaps = rect1.overlaps_with(rect2);
        ctx.fillStyle = overlaps
            ? "rgba(0, 255, 0, 0.3)"
            : "rgba(255, 0, 0, 0.3)";
        ctx.fillText(`Overlaps: ${overlaps}`, 10, 20);

        console.log(
            "Rect visualization created. Blue and Red rects should overlap (Green text indicates logic).",
        );
    }
}
