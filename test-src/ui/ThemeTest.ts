import { TestClass } from "../../src";
import {
    UiManager,
    UiPage,
    Button,
    Panel,
    Label,
    theme_rules_from,
    ThemeValueAnimator,
    ThemeValueTweenNumber,
    ThemeTransformValue,
} from "../../src";
import { RgbColor } from "../../src";
import { Vector2I } from "../../src";

export class ThemeTest extends TestClass {
    private animation_frame: number | null = null;

    public get_name(): string {
        return "UiTheme & Styling";
    }

    public override tear_down() {
        if (this.animation_frame !== null) {
            cancelAnimationFrame(this.animation_frame);
            this.animation_frame = null;
        }
    }

    public test_theme_styling() {
        const test_container =
            document.querySelector(".test-dashboard__test-container") ||
            document.body;

        const canvas = document.createElement("canvas");
        canvas.width = 560;
        canvas.height = 380;
        canvas.className = "test-dashboard__demo-canvas";
        test_container.appendChild(canvas);

        const ctx = canvas.getContext("2d")!;
        const manager = new UiManager();

        // A slowly pulsing background colour, used for the "default" hover state.
        const pulse_color = (
            base: RgbColor,
            highlight: RgbColor,
            seconds: number,
        ) =>
            new ThemeValueAnimator(seconds, (t: number) =>
                base.lerp(highlight, (Math.sin(t * Math.PI * 2) + 1) / 2),
            );

        // A gentle breathing scale, used to show that even a transform can be animated on hover.
        const breathing_scale = (seconds: number, amount: number) =>
            new ThemeValueAnimator(
                seconds,
                (t: number) =>
                    new ThemeTransformValue([
                        {
                            type: "scale",
                            x: 1 + amount * Math.sin(t * Math.PI * 2),
                            y: 1 + amount * Math.sin(t * Math.PI * 2),
                        },
                    ]),
            );

        const rules = theme_rules_from([
            // Base look for every button, regardless of class.
            [
                "button",
                {
                    background_color: new RgbColor(51, 65, 85),
                    text_color: new RgbColor(241, 245, 249),
                    border_color: new RgbColor(148, 163, 184),
                    border_width: 0,
                    border_radius: 8,
                    font_size: 14,
                },
            ],
            // Hovering smoothly grows a border and pulses the background colour.
            [
                "button:hover",
                {
                    background_color: pulse_color(
                        new RgbColor(51, 65, 85),
                        new RgbColor(96, 165, 250),
                        1.4,
                    ),
                    border_width: new ThemeValueTweenNumber(0, 3, 0.25),
                },
            ],
            // Pressing gives immediate, non-animated feedback.
            [
                "button:active",
                {
                    background_color: new RgbColor(30, 41, 59),
                    border_width: 0,
                },
            ],
            // A ".primary" class variant, showing class-based theming.
            [
                "button.primary",
                {
                    background_color: new RgbColor(22, 163, 74),
                },
            ],
            [
                "button.primary:hover",
                {
                    background_color: pulse_color(
                        new RgbColor(22, 163, 74),
                        new RgbColor(134, 239, 172),
                        1.4,
                    ),
                    transform: breathing_scale(2, 0.06),
                },
            ],
            // A ".danger" class variant with an animated border-radius on hover.
            [
                "button.danger",
                {
                    background_color: new RgbColor(220, 38, 38),
                },
            ],
            [
                "button.danger:hover",
                {
                    background_color: pulse_color(
                        new RgbColor(220, 38, 38),
                        new RgbColor(248, 113, 113),
                        1.2,
                    ),
                    border_radius: new ThemeValueTweenNumber(8, 22, 0.3),
                },
            ],
            // Non-button elements can be themed too, e.g. a panel.
            [
                "panel",
                {
                    background_color: new RgbColor(15, 23, 42),
                    border_color: new RgbColor(51, 65, 85),
                    border_width: 1,
                    border_radius: 10,
                },
            ],
            [
                "panel:hover",
                {
                    border_color: new RgbColor(96, 165, 250),
                    border_width: new ThemeValueTweenNumber(1, 4, 0.3),
                },
            ],
            [
                "label",
                {
                    text_color: new RgbColor(226, 232, 240),
                    font_size: 13,
                    background_color: new RgbColor(15, 23, 42, 0),
                },
            ],
        ]);

        const default_button = new Button("Default", {
            left: 20,
            top: 20,
            width: 120,
            height: 44,
        });
        const primary_button = new Button("Primary", {
            left: 160,
            top: 20,
            width: 120,
            height: 44,
        });
        primary_button.class = "primary";
        const danger_button = new Button("Danger", {
            left: 300,
            top: 20,
            width: 120,
            height: 44,
        });
        danger_button.class = "danger";

        const panel_label = new Label("Hover this panel too", {
            left: 16,
            top: 16,
            width: 240,
            height: 20,
        });
        const panel = new Panel([panel_label], {
            left: 20,
            top: 100,
            width: 280,
            height: 60,
        });

        const page = new UiPage(
            { x: 560, y: 380 },
            { left: 0, top: 0, width: 1, height: 1 },
            { left: 0, top: 0, width: 560, height: 380 },
            true,
            rules,
        );
        page.add(default_button);
        page.add(primary_button);
        page.add(danger_button);
        page.add(panel);
        manager.active_menu = page;

        const captions: Array<{ text: string; x: number; y: number }> = [
            {
                text: "Hover/press the buttons: colours pulse, borders grow, and Primary breathes while hovered.",
                x: 20,
                y: 190,
            },
            {
                text: "Danger's corners smoothly round out on hover via a numeric tween.",
                x: 20,
                y: 212,
            },
            {
                text: "The panel below is themed the same way as buttons, via cascading type/class/state rules.",
                x: 20,
                y: 234,
            },
        ];

        const render = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            manager.draw(ctx);

            ctx.fillStyle = "#94a3b8";
            ctx.font = "13px sans-serif";
            ctx.textAlign = "left";
            ctx.textBaseline = "alphabetic";
            captions.forEach((caption) => {
                ctx.fillText(caption.text, caption.x, caption.y);
            });

            this.animation_frame = requestAnimationFrame(render);
        };

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
            "UiTheme styling demo created. Hover and click the widgets below to see cascading type/class/state theme rules drive smoothly animated colours, borders, corners and transforms.",
        );
    }
}
