import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CanvasGameElement } from "./CanvasGameElement";
import { CanvasGameLogic } from "./CanvasGameLogic";
import { CanvasGameProperties } from "./CanvasGameProperties";
import { CanvasGameRenderer } from "./CanvasGameRenderer";
import { CanvasGameSettings } from "./CanvasGameSettings";

class Game {
    public is_over = false;
}

class Settings extends CanvasGameSettings {
    public override readonly round_end_hold_seconds = 0.5;
    public override readonly next_round_keys = [" "];
}

class Properties extends CanvasGameProperties<Game, Settings> {}

class Renderer extends CanvasGameRenderer<Game, Settings> {
    public paints = 0;
    protected paint(): void {
        this.paints += 1;
    }
}

class Logic extends CanvasGameLogic<Game, Settings, Properties> {
    public presses = 0;
    protected create_game(): Game {
        return new Game();
    }
    protected override is_round_finished(game: Game): boolean {
        return game.is_over;
    }
    protected override on_press(): void {
        this.presses += 1;
    }
}

class HoldElement extends CanvasGameElement<Logic> {
    public readonly logic = this.assemble({
        settings: Settings,
        properties: Properties,
        renderer: Renderer,
        logic: Logic,
    });
}

customElements.define("test-round-hold", HoldElement);

describe("settings.round_end_hold_seconds", () => {
    let frames: FrameRequestCallback[] = [];
    let time_ms = 0;
    let $element: HoldElement;
    let logic: Logic;

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

    function press(): void {
        $element.shadowRoot
            ?.querySelector("canvas")
            ?.dispatchEvent(new MouseEvent("pointerdown"));
    }

    function game(): Game {
        return logic.properties.game as Game;
    }

    beforeEach(() => {
        frames = [];
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
        $element = document.createElement("test-round-hold") as HoldElement;
        $element.setAttribute("init-intro", "false");
        document.body.append($element);
        logic = $element.logic;
        run_frames(2);
    });

    afterEach(() => {
        document.body.innerHTML = "";
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it("swallows a press and a key on a fresh end card, and takes them after the hold", () => {
        const first = game();
        first.is_over = true;
        run_frames(1);
        press();
        $element.dispatchEvent(new KeyboardEvent("keydown", { key: " " }));
        expect(game()).toBe(first);
        expect(logic.presses).toBe(0);
        expect(logic.is_round_end_ready).toBe(false);
        run_frames(6);
        expect(logic.is_round_end_ready).toBe(true);
        press();
        expect(game()).not.toBe(first);
    });

    it("starts counting again in the next round", () => {
        game().is_over = true;
        run_frames(8);
        press();
        expect(logic.is_round_end_ready).toBe(false);
        expect(logic.properties.round_over_seconds).toBe(0);
    });

    it("doesn't count while the round runs", () => {
        run_frames(10);
        expect(logic.properties.round_over_seconds).toBe(0);
    });
});
