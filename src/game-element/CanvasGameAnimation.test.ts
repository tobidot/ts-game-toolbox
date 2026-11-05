import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RgbColor } from "../data/RgbColor";
import { IntroGate } from "../stage/IntroGate";
import { set_theme_clock } from "../ui/theme/ThemeClock";
import { theme_rules_from } from "../ui/theme/ThemeRuleBuilder";
import { Button } from "../ui/widgets/Button";
import { CanvasGameElement } from "./CanvasGameElement";
import { CanvasGameLogic } from "./CanvasGameLogic";
import { CanvasGameProperties, UNPLACED } from "./CanvasGameProperties";
import { CanvasGameRenderer } from "./CanvasGameRenderer";
import { CanvasGameSettings } from "./CanvasGameSettings";
import { theme_pulse } from "../ui/theme/ThemeValueAnimator";

const RED = new RgbColor(200, 0, 0);
const BLUE = new RgbColor(0, 0, 200);

class Properties extends CanvasGameProperties<object> {
    public readonly button: Button;
    public constructor(settings: CanvasGameSettings, intro: IntroGate) {
        super(
            settings,
            intro,
            theme_rules_from([
                ["button", { background_color: RED, transition_seconds: 0.5 }],
                ["button:hover", { background_color: BLUE }],
                [
                    "button.late",
                    { background_color: theme_pulse(RED, BLUE, 1) },
                ],
            ]),
        );
        this.button = this.place(new Button("b", UNPLACED), () => ({
            left: 0,
            top: 0,
            width: 100,
            height: 40,
        }));
    }
}

let paints = 0;

class Renderer extends CanvasGameRenderer<object> {
    protected paint(): void {
        paints += 1;
    }
}

/** A game that never says its screen changed: all repaints come from what the test does. */
class Logic extends CanvasGameLogic<object, CanvasGameSettings, Properties> {
    protected create_game(): object {
        return {};
    }
}

class IdleElement extends CanvasGameElement<Logic> {
    public readonly logic = this.assemble({
        settings: CanvasGameSettings,
        properties: Properties,
        renderer: Renderer,
        logic: Logic,
    });
}

customElements.define("test-animation", IdleElement);

describe("an idle game with a moving theme value", () => {
    let frames: FrameRequestCallback[] = [];
    let time_ms = 0;
    let $element: IdleElement;

    /** Frames 100 ms apart, on the theme's clock too. */
    function run_frames(count: number): void {
        for (let frame = 0; frame < count; frame++) {
            time_ms += 100;
            const due = frames;
            frames = [];
            for (const callback of due) {
                callback(time_ms);
            }
        }
    }

    function button(): Button {
        return $element.logic.properties.button;
    }

    beforeEach(() => {
        frames = [];
        time_ms = 0;
        paints = 0;
        set_theme_clock(() => time_ms / 1000);
        vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
            new Proxy({}, { get: () => vi.fn() }) as CanvasRenderingContext2D,
        );
        vi.stubGlobal(
            "requestAnimationFrame",
            (callback: FrameRequestCallback) => {
                frames.push(callback);
                return frames.length;
            },
        );
        vi.stubGlobal("cancelAnimationFrame", () => {
            frames = [];
        });
        $element = document.createElement("test-animation") as IdleElement;
        $element.setAttribute("init-intro", "false");
        document.body.append($element);
        run_frames(3);
        paints = 0;
    });

    afterEach(() => {
        document.body.innerHTML = "";
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
        set_theme_clock(null);
    });

    it("paints nothing while nothing moves", () => {
        run_frames(10);
        expect(paints).toBe(0);
    });

    it("keeps painting through a transition, shows its end, then stops", () => {
        button().update_mouse_hover_status(true);
        run_frames(4);
        expect(paints).toBe(4);
        run_frames(2);
        expect(button().theme.background_color.equals(BLUE)).toBe(true);
        const after_the_end = paints;
        expect(after_the_end).toBeGreaterThanOrEqual(5);
        run_frames(10);
        expect(paints).toBe(after_the_end);
    });

    it("keeps painting for as long as an animator applies", () => {
        button().class = "late";
        run_frames(20);
        expect(paints).toBe(20);
        button().class = null;
        run_frames(10);
        const settled = paints;
        run_frames(10);
        expect(paints).toBe(settled);
    });

    it("asks for nothing from a hidden widget", () => {
        button().class = "late";
        button().is_visible = false;
        run_frames(10);
        expect(paints).toBe(0);
    });
});
