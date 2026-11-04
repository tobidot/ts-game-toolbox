import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Label } from "../ui/widgets/Label";
import { CanvasGameElement } from "./CanvasGameElement";
import { AttributeReader, CanvasGameLogic } from "./CanvasGameLogic";
import { CanvasGameRenderer } from "./CanvasGameRenderer";
import { CanvasGameSettings } from "./CanvasGameSettings";

/** The smallest game: a counter with a seed, enough to see the shell do its part. */
class Game {
    public clicks = 0;
    public constructor(public readonly seed: number) {}
}

class Settings extends CanvasGameSettings {
    public override readonly title = "Counter";
    public override readonly game_keys = [" "];
    public default_goal = 3;
}

class Renderer extends CanvasGameRenderer<Game> {
    public painted = 0;
    protected paint(): void {
        this.painted += 1;
    }
}

class Logic extends CanvasGameLogic<Game> {
    public goal = 0;
    public spaces = 0;
    public key_presses = 0;
    public syncs = 0;
    protected override update(): boolean {
        if (this.properties.keyboard.was_pressed(" ")) {
            this.spaces += 1;
        }
        return false;
    }
    protected create_game(seed: number): Game {
        return new Game(seed);
    }
    protected override read_attributes(read: AttributeReader): void {
        this.goal = read("init-goal", Number, 3);
    }
    protected override on_press(): void {
        if (this.properties.game) {
            this.properties.game.clicks += 1;
        }
    }
    protected override on_key_press(): void {
        this.key_presses += 1;
    }
    protected override sync(): void {
        this.syncs += 1;
    }
    protected override live_status(game: Game): string {
        return `${game.clicks} Klicks`;
    }
}

class CounterElement extends CanvasGameElement<Logic> {
    public readonly logic = this.assemble({
        settings: Settings,
        renderer: Renderer,
        logic: Logic,
    });
    public titles: string[] = [];
    protected override on_connected(title: string): void {
        this.titles.push(title);
    }
}

customElements.define("test-counter", CounterElement);

describe("CanvasGameElement", () => {
    beforeEach(() => {
        vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
            // Every drawing call is a no-op in jsdom.
            new Proxy({}, { get: () => vi.fn() }) as CanvasRenderingContext2D,
        );
    });

    afterEach(() => {
        document.body.innerHTML = "";
        vi.restoreAllMocks();
    });

    it("boots with attributes, a seeded game and the shell's DOM", () => {
        const $element = document.createElement(
            "test-counter",
        ) as CounterElement;
        $element.setAttribute("init-seed", "4711");
        $element.setAttribute("init-goal", "5");
        $element.setAttribute("init-intro", "false");
        document.body.append($element);

        const properties = $element.logic.properties;
        expect(properties.seed).toBe(4711);
        expect($element.logic.goal).toBe(5);
        expect(properties.intro.is_done).toBe(true);
        expect(Number.isInteger(properties.game?.seed)).toBe(true);
        expect($element.shadowRoot?.querySelector("canvas")).not.toBeNull();
        expect($element.titles).toEqual(["Counter"]);
        expect($element.tabIndex).toBe(0);
    });

    it("replays the same series of games for the same seed", () => {
        const seeds = () => {
            const $element = document.createElement(
                "test-counter",
            ) as CounterElement;
            $element.setAttribute("init-seed", "1");
            $element.setAttribute("init-intro", "false");
            document.body.append($element);
            const first = $element.logic.properties.game?.seed;
            $element.restart();
            return [first, $element.logic.properties.game?.seed];
        };
        expect(seeds()).toEqual(seeds());
        expect(document.querySelector("test-counter")).not.toBeNull();
    });

    it("falls back on an invalid attribute and keeps state over a reconnect", () => {
        vi.spyOn(console, "warn").mockImplementation(() => {});
        const $element = document.createElement(
            "test-counter",
        ) as CounterElement;
        $element.setAttribute("init-seed", "banana");
        $element.setAttribute("init-intro", "false");
        document.body.append($element);
        expect(console.warn).toHaveBeenCalled();
        const game = $element.logic.properties.game;
        $element.remove();
        expect($element.logic.properties.abort_controller).toBeNull();
        document.body.append($element);
        expect($element.logic.properties.game).toBe(game);
        expect($element.logic.properties.restarts).toBe(0);
    });

    it("places widgets by rule and blocks the game's keys once it runs", () => {
        const $element = document.createElement(
            "test-counter",
        ) as CounterElement;
        $element.setAttribute("init-intro", "false");
        document.body.append($element);
        const properties = $element.logic.properties;
        const label = properties.place(
            new Label("x", { left: 0, top: 0, width: 0, height: 0 }),
            (layout) => ({
                left: layout.width - 10,
                top: 0,
                width: 10,
                height: 10,
            }),
        );
        expect(label.rect.left).toBe(950);
        properties.place_widgets({ width: 600, height: 960 });
        expect(label.rect.left).toBe(590);

        const space = new KeyboardEvent("keydown", {
            key: " ",
            cancelable: true,
        });
        $element.dispatchEvent(space);
        expect(space.defaultPrevented).toBe(true);
        expect(properties.keyboard.was_pressed(" ")).toBe(true);
    });

    it("seeds game n with init-seed + n", () => {
        const $element = document.createElement(
            "test-counter",
        ) as CounterElement;
        $element.setAttribute("init-seed", "41");
        $element.setAttribute("init-intro", "false");
        document.body.append($element);
        expect($element.logic.properties.game?.seed).toBe(41);
        $element.restart();
        $element.restart();
        expect($element.logic.properties.game?.seed).toBe(43);
    });

    it("counts a held key once in on_key_press", () => {
        const $element = document.createElement(
            "test-counter",
        ) as CounterElement;
        $element.setAttribute("init-intro", "false");
        document.body.append($element);
        for (const repeat of [false, true, true]) {
            $element.dispatchEvent(
                new KeyboardEvent("keydown", { key: "a", repeat }),
            );
        }
        expect($element.logic.key_presses).toBe(1);
    });

    it("syncs before a repaint and keeps a live status line", () => {
        const frames: FrameRequestCallback[] = [];
        vi.spyOn(window, "requestAnimationFrame").mockImplementation(
            (callback) => frames.push(callback),
        );
        const $element = document.createElement(
            "test-counter",
        ) as CounterElement;
        $element.setAttribute("init-intro", "false");
        document.body.append($element);
        const game = $element.logic.properties.game;
        if (game) {
            game.clicks = 2;
        }
        frames[frames.length - 1](1000);
        expect($element.logic.syncs).toBe(1);
        const $status = $element.shadowRoot?.querySelector(".game__status");
        expect($status?.textContent).toBe("2 Klicks");
        // nothing changed: no repaint, no sync
        frames[frames.length - 1](2000);
        expect($element.logic.syncs).toBe(1);
    });
});
