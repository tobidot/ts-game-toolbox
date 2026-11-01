import { TestClass } from "../../src";
import {
    UiManager,
    UiPage,
    Button,
    Gallery,
    ElementClickEvent,
    ElementChangeEvent,
} from "../../src";
import { Vector2I } from "../../src";

export class GalleryTest extends TestClass {
    private animation_frame: number | null = null;

    public get_name(): string {
        return "Gallery Widget Showcase";
    }

    public override tear_down() {
        if (this.animation_frame !== null) {
            cancelAnimationFrame(this.animation_frame);
            this.animation_frame = null;
        }
    }

    private create_placeholder_image(
        label: string,
        background: string,
    ): HTMLImageElement {
        const source = document.createElement("canvas");
        source.width = 240;
        source.height = 160;
        const source_ctx = source.getContext("2d")!;
        source_ctx.fillStyle = background;
        source_ctx.fillRect(0, 0, source.width, source.height);
        source_ctx.fillStyle = "#ffffff";
        source_ctx.font = "bold 20px sans-serif";
        source_ctx.textAlign = "center";
        source_ctx.textBaseline = "middle";
        source_ctx.fillText(label, source.width / 2, source.height / 2);

        const image = new Image();
        image.src = source.toDataURL();
        return image;
    }

    public test_gallery_widget() {
        const test_container =
            document.querySelector(".test-dashboard__test-container") ||
            document.body;

        const canvas = document.createElement("canvas");
        canvas.width = 400;
        canvas.height = 300;
        canvas.className = "test-dashboard__demo-canvas";
        test_container.appendChild(canvas);

        const ctx = canvas.getContext("2d")!;
        const manager = new UiManager();

        const images = [
            this.create_placeholder_image("Slide 1", "#2563eb"),
            this.create_placeholder_image("Slide 2", "#16a34a"),
            this.create_placeholder_image("Slide 3", "#dc2626"),
            this.create_placeholder_image("Slide 4", "#9333ea"),
        ];

        const gallery = new Gallery("Gallery Widget", images, {
            left: 60,
            top: 20,
            width: 280,
            height: 190,
        });
        const previous_button = new Button("< Prev", {
            left: 60,
            top: 230,
            width: 80,
            height: 40,
        });
        const next_button = new Button("Next >", {
            left: 260,
            top: 230,
            width: 80,
            height: 40,
        });

        const page = new UiPage(
            { x: 400, y: 300 },
            { left: 0, top: 0, width: 1, height: 1 },
            { left: 0, top: 0, width: 400, height: 300 },
        );
        page.add(gallery);
        page.add(previous_button);
        page.add(next_button);
        manager.active_menu = page;

        const render = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            manager.draw(ctx);
            this.animation_frame = requestAnimationFrame(render);
        };

        previous_button.events.attach(ElementClickEvent, () => {
            gallery.previous();
        });
        next_button.events.attach(ElementClickEvent, () => {
            gallery.next();
        });
        gallery.events.attach(ElementChangeEvent, () => {
            console.log(
                `Gallery switched to slide ${gallery.current_image_index + 1} of ${images.length}`,
            );
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
            e.preventDefault();
        });
        canvas.addEventListener("mouseup", (e) => {
            manager.pointer_up(get_coords(e));
            e.preventDefault();
        });
        canvas.addEventListener("mousemove", (e) => {
            manager.pointer_move(get_coords(e));
            e.preventDefault();
        });
        canvas.addEventListener("mouseleave", () => manager.pointer_exit());

        render();

        console.log(
            "Gallery widget showcase created. Click the image or the Prev/Next buttons to cycle through the slides.",
        );
    }
}
