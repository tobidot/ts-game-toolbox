import { TestClass } from "../../src/testing/TestClass";
import {
    MenuManager,
    MenuGroup,
    MenuButton,
    MenuCheckBox,
    MenuSlider,
    MenuValueLabel,
    ElementClickEvent,
    ElementChangeEvent,
} from "../../src/ui";
import { Vector2I } from "../../src/geometries/Vector2";

export class MenuTest extends TestClass {
    private animation_frame: number | null = null;

    public get_name(): string {
        return "Menu System Test";
    }

    public override tear_down() {
        if (this.animation_frame !== null) {
            cancelAnimationFrame(this.animation_frame);
            this.animation_frame = null;
        }
    }

    public test_interactive_menu() {
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
        const manager = new MenuManager();

        const button = new MenuButton("Click Me", {
            left: 20,
            top: 20,
            width: 120,
            height: 40,
        });
        const checkbox = new MenuCheckBox("Toggle Feature", false, {
            left: 20,
            top: 80,
            width: 200,
            height: 30,
        });
        const slider = new MenuSlider("Volume", 0, 100, 50, {
            left: 20,
            top: 130,
            width: 300,
            height: 50,
        });
        const valuelabel = new MenuValueLabel("Current State", "Ready", {
            left: 20,
            top: 200,
            width: 200,
            height: 30,
        });

        const group = new MenuGroup([button, checkbox, slider, valuelabel], {
            left: 0,
            top: 0,
            width: 400,
            height: 300,
        });
        manager.active_menu = group;

        const render = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            manager.draw(ctx);
            this.animation_frame = requestAnimationFrame(render);
        };

        button.events.attach(ElementClickEvent, () => {
            console.log("Button Clicked!");
            valuelabel.value = "Button Clicked";
        });
        checkbox.events.attach(ElementChangeEvent, () => {
            console.log("Checkbox Changed:", checkbox.checked);
            valuelabel.value = `Checkbox: ${checkbox.checked ? "ON" : "OFF"}`;
            button.label = checkbox.checked ? "ENABLED" : "Click Me";
        });
        slider.events.attach(ElementChangeEvent, () => {
            console.log("Slider Changed:", slider.value);
            valuelabel.value = `Slider: ${slider.value.toFixed(1)}`;
        });

        const get_coords = (e: MouseEvent): Vector2I => {
            const rect = canvas.getBoundingClientRect();
            return {
                x: e.clientX - rect.left,
                y: e.clientY - rect.top,
            };
        };

        canvas.addEventListener("mousedown", (e) => {
            manager.pointer_down(get_coords(e));
            render();
            e.preventDefault();
        });
        canvas.addEventListener("mouseup", (e) => {
            manager.pointer_up(get_coords(e));
            render();
            e.preventDefault();
        });
        canvas.addEventListener("mousemove", (e) => {
            manager.pointer_move(get_coords(e));
            render();
            e.preventDefault();
        });
        canvas.addEventListener("mouseleave", () => manager.pointer_exit());

        render();

        console.log(
            "Interactive menu created. Try clicking the elements in the canvas below!",
        );
    }
}
