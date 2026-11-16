// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Vector2I } from "../geometries";
import { PAD_BUTTONS } from "../input/actions/ActionBindings";
import { GamepadLike } from "../input/actions/Gamepads";
import { MenuInput } from "../input/MenuInput";
import { IntroGate } from "../stage/IntroGate";
import { Menu } from "../ui/menu/Menu";
import { MenuView } from "../ui/widgets/MenuView";
import { CanvasGameElement } from "./CanvasGameElement";
import { CanvasGameLogic } from "./CanvasGameLogic";
import { CanvasGameProperties, UNPLACED } from "./CanvasGameProperties";
import { CanvasGameRenderer } from "./CanvasGameRenderer";
import { CanvasGameSettings } from "./CanvasGameSettings";

/** What the game saw of the actions, frame by frame. */
class Game {
    public readonly moves: Vector2I[] = [];
    public confirms = 0;
    public presses = 0;
    public readonly picked: string[] = [];
}

const LAYOUT = {
    width: 960,
    height: 640,
    menu: { left: 600, top: 40, width: 300, height: 200 },
};

class Settings extends CanvasGameSettings<typeof LAYOUT> {
    public override readonly layouts = [LAYOUT];
    public override readonly touch_stick: boolean = true;
    public override readonly touch_buttons: boolean = true;
}

class MenuSettings extends Settings {
    public override readonly touch_stick: boolean = false;
    public override readonly touch_buttons: boolean = false;
}

class Properties<S extends Settings> extends CanvasGameProperties<Game, S> {
    public readonly menu = new Menu<string>([
        { label: "Erde", value: "erde" },
        { label: "Mond", value: "mond" },
    ]);
    public readonly menu_input = new MenuInput(this.menu);

    public constructor(settings: S, intro: IntroGate) {
        super(settings, intro);
        this.place(
            new MenuView(this.menu_input, UNPLACED),
            (layout) => layout.menu,
        );
    }
}

class Renderer extends CanvasGameRenderer<Game, Settings> {
    protected paint(): void {}
}

class Logic extends CanvasGameLogic<Game, Settings, Properties<Settings>> {
    protected create_game(): Game {
        return new Game();
    }

    protected override update(game: Game): boolean {
        const actions = this.properties.actions;
        game.moves.push(actions.vector("move"));
        if (actions.just_pressed("confirm")) {
            game.confirms += 1;
        }
        game.picked.push(...this.properties.menu_input.choices());
        return true;
    }

    protected override on_press(): void {
        const game = this.properties.game;
        if (game !== null) {
            game.presses += 1;
        }
    }
}

class ActionsElement extends CanvasGameElement<Logic> {
    public readonly logic = this.assemble({
        settings: Settings,
        properties: Properties,
        renderer: Renderer,
        logic: Logic,
    });
}

class MenuElement extends CanvasGameElement<Logic> {
    public readonly logic = this.assemble({
        settings: MenuSettings,
        properties: Properties,
        renderer: Renderer,
        logic: Logic,
    });
}

customElements.define("test-actions-shell", ActionsElement);
customElements.define("test-actions-menu-shell", MenuElement);

function fake_pad(mapping: string = "standard"): GamepadLike & {
    buttons: { pressed: boolean; value: number }[];
    axes: number[];
} {
    return {
        id: mapping === "standard" ? "Fake Pad" : "Odd Stick",
        index: 0,
        connected: true,
        mapping,
        buttons: Array.from({ length: 17 }, () => ({
            pressed: false,
            value: 0,
        })),
        axes: [0, 0, 0, 0],
    };
}

/** DOM init keys are camelCase; the toolbox's naming rule is for its own code. */
function touch_init(id: number): PointerEventInit {
    /* eslint-disable @typescript-eslint/naming-convention */
    return {
        pointerType: "touch",
        pointerId: id,
        isPrimary: id === 1,
        bubbles: true,
    };
    /* eslint-enable @typescript-eslint/naming-convention */
}

describe("the shell's ActionMap", () => {
    let frames: FrameRequestCallback[] = [];
    let time_ms = 0;
    let pads: GamepadLike[] = [];
    let host: ActionsElement;

    function run_frames(count: number = 1): void {
        for (let frame = 0; frame < count; frame++) {
            time_ms += 100;
            const due = frames;
            frames = [];
            for (const callback of due) {
                callback(time_ms);
            }
        }
    }

    function mount(tag: string, intro: boolean = false): ActionsElement {
        const element = document.createElement(tag) as ActionsElement;
        element.setAttribute("init-intro", String(intro));
        document.body.append(element);
        run_frames(2);
        return element;
    }

    /** A finger at `point` in layout coordinates. */
    function touch(
        type: string,
        id: number,
        point: Vector2I,
        element: ActionsElement = host,
    ): void {
        const stage = element.logic.references.stage;
        vi.spyOn(stage, "to_layout").mockReturnValue(point);
        stage.$canvas.dispatchEvent(new PointerEvent(type, touch_init(id)));
    }

    function game_of(element: ActionsElement = host): Game {
        const game = element.logic.properties.game;
        if (game === null) {
            throw new Error("no game");
        }
        return game;
    }

    beforeEach(() => {
        frames = [];
        pads = [];
        vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
            new Proxy(
                { canvas: { width: 960, height: 640 } },
                {
                    get: (target, name) =>
                        name in target
                            ? (target as Record<string | symbol, unknown>)[name]
                            : name === "measureText"
                              ? () => ({ width: 10 })
                              : vi.fn(),
                    set: () => true,
                },
            ) as unknown as CanvasRenderingContext2D,
        );
        vi.stubGlobal(
            "requestAnimationFrame",
            (callback: FrameRequestCallback) => frames.push(callback),
        );
        vi.stubGlobal("cancelAnimationFrame", vi.fn());
        vi.stubGlobal(
            "ResizeObserver",
            class {
                public observe(): void {}
                public disconnect(): void {}
            },
        );
        Object.defineProperty(navigator, "getGamepads", {
            value: () => pads,
            configurable: true,
        });
        host = mount("test-actions-shell");
    });

    afterEach(() => {
        document.body.replaceChildren();
        Reflect.deleteProperty(navigator, "getGamepads");
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it("reads the keys by code before the game's update", () => {
        host.dispatchEvent(
            new KeyboardEvent("keydown", { key: "d", code: "KeyD" }),
        );
        run_frames();
        expect(game_of().moves.at(-1)).toEqual({ x: 1, y: 0 });
        expect(host.logic.properties.actions.last_device).toBe("keyboard");
    });

    it("moves the same with a gamepad, and a press counts once", () => {
        const pad = fake_pad();
        pads.push(pad);
        pad.axes[0] = 1;
        pad.buttons[PAD_BUTTONS.a] = { pressed: true, value: 1 };
        run_frames(3);
        const game = game_of();
        expect(game.moves.at(-1)?.x).toBeCloseTo(1);
        expect(game.confirms).toBe(1);
        expect(host.logic.properties.actions.last_device).toBe("gamepad");
    });

    it("steers with the touch stick, and that touch never reaches on_press", () => {
        touch("pointerdown", 1, { x: 200, y: 400 });
        touch("pointermove", 1, { x: 200, y: 300 });
        run_frames();
        const game = game_of();
        expect(game.moves.at(-1)?.y).toBeCloseTo(-1);
        expect(game.presses).toBe(0);
        const controls = host.logic.properties.touch_controls;
        expect(controls.is_shown).toBe(true);
        expect(host.logic.properties.actions.last_device).toBe("touch");
        // The other thumb presses the confirm button meanwhile.
        const [button] = controls.buttons;
        expect(button.action).toBe("confirm");
        touch("pointerdown", 2, button.center);
        run_frames();
        expect(game.confirms).toBe(1);
        touch("pointerup", 2, button.center);
        touch("pointerup", 1, { x: 200, y: 300 });
        run_frames();
        expect(game.moves.at(-1)).toEqual({ x: 0, y: 0 });
        // A touch on the right half, off the buttons, is the game's.
        touch("pointerdown", 3, { x: 700, y: 300 });
        expect(game.presses).toBe(1);
    });

    it("leaves touches to the game when the touch controls are off", () => {
        const menu = mount("test-actions-menu-shell");
        touch("pointerdown", 1, { x: 200, y: 400 }, menu);
        expect(game_of(menu).presses).toBe(1);
        expect(menu.logic.properties.touch_controls.is_shown).toBe(false);
    });

    it("works a menu on the page with a gamepad", () => {
        host.remove();
        const menu = mount("test-actions-menu-shell");
        const pad = fake_pad();
        pads.push(pad);
        run_frames();
        pad.buttons[PAD_BUTTONS.down] = { pressed: true, value: 1 };
        run_frames();
        pad.buttons[PAD_BUTTONS.down] = { pressed: false, value: 0 };
        run_frames();
        pad.buttons[PAD_BUTTONS.a] = { pressed: true, value: 1 };
        run_frames();
        expect(game_of(menu).picked).toEqual(["mond"]);
    });

    it("says on the page that a pad without the standard mapping is not supported", () => {
        pads.push(fake_pad(""));
        run_frames();
        const properties = host.logic.properties;
        expect(properties.actions.unsupported_pad).toBe("Odd Stick");
        expect(properties.pad_notice.text).toMatch(/Standardbelegung/);
        run_frames(80);
        expect(properties.pad_notice.text).toBeNull();
    });

    it("leaves the start screen on A, and the hint names the device", () => {
        host.remove();
        const render_start = vi.spyOn(Renderer.prototype, "render_start");
        const waiting = mount("test-actions-shell", true);
        expect(waiting.logic.properties.intro.state).toBe("waiting");
        expect(render_start.mock.lastCall?.[1]).toMatch(/Klicken/);
        const pad = fake_pad();
        pads.push(pad);
        pad.axes[0] = 1;
        run_frames();
        expect(render_start.mock.lastCall?.[1]).toMatch(/Gamepad|A drücken/);
        expect(waiting.logic.properties.intro.state).toBe("waiting");
        pad.buttons[PAD_BUTTONS.a] = { pressed: true, value: 1 };
        run_frames();
        expect(waiting.logic.properties.intro.state).not.toBe("waiting");
    });
});
