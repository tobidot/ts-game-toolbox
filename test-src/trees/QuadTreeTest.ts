import { TestClass } from "../../src/testing/TestClass";
import { QuadTree } from "../../src/trees/QuadTree";
import { TreeElementNotFoundException } from "../../src/trees/exceptions/TreeElementNotFoundException";
import { Rect, RectI } from "../../src/geometries/Rect";

export class QuadTreeTest extends TestClass {
    public base_rect: RectI = {
        left: 0, top: 0, width: 400, height: 300,
    };

    public get_name() {
        return "Quadtree Visualization"
    }

    public test_quadtree_visualization() {
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
        const tree = new QuadTree<DemoQuadElement<string>>(this.base_rect);
        
        const elements = [
            new DemoQuadElement(10, 10, 20, 20, "A"),
            new DemoQuadElement(100, 100, 50, 50, "B"),
            new DemoQuadElement(250, 50, 30, 30, "C"),
        ];

        elements.forEach(e => tree.add(e));

        ctx.strokeStyle = "#ccc";
        ctx.strokeRect(this.base_rect.left, this.base_rect.top, this.base_rect.width, this.base_rect.height);

        ctx.strokeStyle = "blue";
        elements.forEach(e => {
            ctx.strokeRect(e.left, e.top, e.width, e.height);
            ctx.fillText(e.data, e.left, e.top - 5);
        });

        const pick_rect = { left: 0, top: 0, width: 150, height: 150 };
        ctx.strokeStyle = "rgba(255, 165, 0, 0.5)";
        ctx.lineWidth = 2;
        ctx.strokeRect(pick_rect.left, pick_rect.top, pick_rect.width, pick_rect.height);
        
        const picked = tree.pick(pick_rect);
        ctx.fillStyle = "orange";
        ctx.fillText(`Picked: ${picked.map(p => p.data).join(", ")}`, 10, 290);

        console.log("Quadtree visualization created. Orange rect shows 'pick' area.");
    }
}

class DemoQuadElement<T> extends Rect {
    public constructor(
        x: number, y: number, w: number, h: number, public data: T
    ) {
        super({ left: x, top: y, width: w, height: h });
    }
}
