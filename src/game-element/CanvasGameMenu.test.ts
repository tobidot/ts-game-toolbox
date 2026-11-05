import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MenuInput } from "../input/MenuInput";
import { IntroGate } from "../stage/IntroGate";
import { Menu, MenuEntry } from "../ui/menu/Menu";
import { MenuRow, MenuView } from "../ui/widgets/MenuView";
import { CanvasGameElement } from "./CanvasGameElement";
import { CanvasGameLogic } from "./CanvasGameLogic";
import { CanvasGameProperties, UNPLACED } from "./CanvasGameProperties";
import { CanvasGameRenderer } from "./CanvasGameRenderer";
import { CanvasGameSettings } from "./CanvasGameSettings";

const FORMS: MenuEntry<string>[] = [
    { label: "Hund", value: "hund" },
    { label: "Katze", value: "katze" },
    {
        label: "Mehr",
        entries: [{ label: "Zaun", value: "zaun" }],
    },
];

class Game {
    public readonly filed: string[] = [];
}

const LAYOUT = {
    width: 400,
    height: 400,
    menu: { left: 0, top: 0, width: 400, height: 400 },
};

class Settings extends CanvasGameSettings<typeof LAYOUT> {
    public override readonly layouts = [LAYOUT];
}

/** The promise of the spec, as it stands: these three lines and one loop. */
class Properties extends CanvasGameProperties<Game, Settings> {
    public readonly forms = new Menu<string>(FORMS);
    public readonly forms_input = new MenuInput(this.forms);
    public readonly forms_view: MenuView<string>;

    public constructor(settings: Settings, intro: IntroGate) {
        super(settings, intro);
        this.forms_view = this.place(
            new MenuView(this.forms_input, UNPLACED),
            (layout) => layout.menu,
        );
    }
}

class Renderer extends CanvasGameRenderer<Game, Settings> {
    protected paint(): void {}
}

class Logic extends CanvasGameLogic<Game, Settings, Properties> {
    protected create_game(): Game {
        return new Game();
    }

    protected override update(game: Game): boolean {
        for (const form of this.properties.forms_input.choices()) {
            game.filed.push(form);
        }
        return false;
    }
}

class MenuElement extends CanvasGameElement<Logic> {
    public readonly logic = this.assemble({
        settings: Settings,
        properties: Properties,
        renderer: Renderer,
        logic: Logic,
    });
}

customElements.define("test-menu-shell", MenuElement);

describe("a MenuView on the shell's page", () => {
    let frames: FrameRequestCallback[] = [];
    let time_ms = 0;
    let host: MenuElement;
    let logic: Logic;

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

    function press(key: string, init: KeyboardEventInit = {}): void {
        host.dispatchEvent(
            new KeyboardEvent("keydown", { key, cancelable: true, ...init }),
        );
    }

    beforeEach(() => {
        frames = [];
        vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
            new Proxy(
                { canvas: { width: 400, height: 400 } },
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
        host = document.createElement("test-menu-shell") as MenuElement;
        host.setAttribute("init-intro", "false");
        document.body.append(host);
        logic = host.logic;
        run_frames(2);
    });

    afterEach(() => {
        host.remove();
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it("is known to the shell by being placed", () => {
        const { menu_inputs, forms_input } = logic.properties;
        expect([...menu_inputs]).toEqual([forms_input]);
    });

    it("gets the keys and hands the game its choices, with no other code", () => {
        press("ArrowDown");
        press("Enter");
        run_frames();
        expect(logic.properties.game?.filed).toEqual(["katze"]);
    });

    it("ends the frame: a choice is read once", () => {
        press("Enter");
        run_frames(3);
        expect(logic.properties.game?.filed).toEqual(["hund"]);
    });

    it("ages the buffer and replays it when the hold ends", () => {
        const { forms_input } = logic.properties;
        forms_input.is_held = true;
        press("ArrowDown");
        press("Enter");
        run_frames(2);
        expect(logic.properties.game?.filed).toEqual([]);
        forms_input.is_held = false;
        run_frames();
        expect(logic.properties.game?.filed).toEqual(["katze"]);
    });

    it("hears no shortcut, and a mute key stays the shell's", () => {
        press("ArrowDown", { ctrlKey: true });
        expect(logic.properties.forms.cursor).toBe(0);
    });

    it("repaints a still game after a key", () => {
        run_frames(3);
        logic.properties.is_dirty = false;
        press("ArrowDown");
        expect(logic.properties.is_dirty).toBe(true);
    });

    it("repaints a still game when a replay moved the cursor, with no draw in between", () => {
        const { forms_input } = logic.properties;
        forms_input.is_held = true;
        press("ArrowDown");
        run_frames(3);
        const before = logic.properties.forms_view.list
            .children[1] as MenuRow<string>;
        expect(before.is_selected).toBe(false);
        forms_input.is_held = false;
        run_frames(2);
        expect(before.is_selected).toBe(true);
    });
});

describe("before the intro is over", () => {
    let frames: FrameRequestCallback[] = [];

    beforeEach(() => {
        frames = [];
        vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
            new Proxy({}, { get: () => vi.fn() }) as CanvasRenderingContext2D,
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
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it("a key that leaves the start screen moves no menu", () => {
        const host = document.createElement("test-menu-shell") as MenuElement;
        document.body.append(host);
        host.dispatchEvent(
            new KeyboardEvent("keydown", {
                key: "ArrowDown",
                cancelable: true,
            }),
        );
        host.dispatchEvent(
            new KeyboardEvent("keydown", {
                key: "ArrowDown",
                cancelable: true,
            }),
        );
        expect(host.logic.properties.forms.cursor).toBe(0);
        host.remove();
    });
});
