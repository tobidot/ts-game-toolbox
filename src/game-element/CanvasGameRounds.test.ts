import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CanvasGameElement } from "./CanvasGameElement";
import { CanvasGameLogic } from "./CanvasGameLogic";
import { CanvasGameProperties } from "./CanvasGameProperties";
import { CanvasGameRenderer } from "./CanvasGameRenderer";
import { CanvasGameSettings } from "./CanvasGameSettings";
import { SessionBest } from "./SessionBest";

/** A round that ends when the test says so, or by itself after enough updates. */
class Game {
    public is_over = false;
    public score = 0;
    public updates_left = Number.POSITIVE_INFINITY;
    public constructor(public readonly seed: number) {}
}

class Settings extends CanvasGameSettings {
    public override readonly title = "Rounds";
}

class Properties extends CanvasGameProperties<Game, Settings> {
    public override readonly best = new SessionBest("lower");
}

class Renderer extends CanvasGameRenderer<Game, Settings> {
    protected paint(): void {}
}

class Logic extends CanvasGameLogic<Game, Settings, Properties> {
    public finished_seeds: number[] = [];
    public presses = 0;
    public key_presses = 0;
    public next_rounds = 0;
    public is_endless = false;
    protected create_game(seed: number): Game {
        return new Game(seed);
    }
    protected override update(game: Game): boolean {
        game.updates_left -= 1;
        if (game.updates_left <= 0) {
            game.is_over = true;
        }
        return false;
    }
    protected override is_round_finished(game: Game): boolean {
        return !this.is_endless && game.is_over;
    }
    protected override on_round_finished(game: Game): void {
        this.finished_seeds.push(game.seed);
        this.properties.best.offer(game.score);
    }
    protected override start_next_round(): void {
        this.next_rounds += 1;
        super.start_next_round();
    }
    protected override on_press(): void {
        this.presses += 1;
    }
    protected override on_key_press(): void {
        this.key_presses += 1;
    }
}

class RoundsElement extends CanvasGameElement<Logic> {
    public readonly logic = this.assemble({
        settings: Settings,
        properties: Properties,
        renderer: Renderer,
        logic: Logic,
    });
}

customElements.define("test-rounds", RoundsElement);

describe("the end of a round in the shell", () => {
    let frames: FrameRequestCallback[] = [];
    let time_ms = 0;
    let $element: RoundsElement;
    let logic: Logic;

    /** Runs the frame loop by hand: `count` frames, far enough apart to tick. */
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

    function press(): void {
        const $canvas = $element.shadowRoot?.querySelector("canvas");
        $canvas?.dispatchEvent(new MouseEvent("pointerdown"));
    }

    function key(name: string, is_repeat: boolean = false): KeyboardEvent {
        const event = new KeyboardEvent("keydown", {
            key: name,
            repeat: is_repeat,
            cancelable: true,
        });
        $element.dispatchEvent(event);
        return event;
    }

    function game(): Game {
        const current = logic.properties.game;
        if (current === null) {
            throw new Error("no game");
        }
        return current;
    }

    beforeEach(() => {
        frames = [];
        time_ms = 0;
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
        $element = document.createElement("test-rounds") as RoundsElement;
        $element.setAttribute("init-seed", "10");
        $element.setAttribute("init-intro", "false");
        document.body.append($element);
        logic = $element.logic;
    });

    afterEach(() => {
        document.body.innerHTML = "";
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it("reports a finished round once, however many frames show it", () => {
        run_frames();
        expect(logic.finished_seeds).toEqual([]);
        game().score = 7;
        game().is_over = true;
        run_frames(5);
        expect(logic.finished_seeds).toEqual([10]);
        expect(logic.properties.best.value).toBe(7);
    });

    it("reports on the frame the update ended the round", () => {
        game().updates_left = 2;
        run_frames();
        expect(logic.finished_seeds).toEqual([]);
        run_frames();
        expect(logic.finished_seeds).toEqual([10]);
    });

    it("reports every round of a series, and settles the best", () => {
        game().score = 7;
        game().is_over = true;
        run_frames();
        expect(logic.properties.best.is_new).toBe(true);
        logic.restart();
        expect(logic.properties.best.is_new).toBe(false);
        expect(logic.properties.best.value).toBe(7);
        game().score = 5;
        game().is_over = true;
        run_frames();
        expect(logic.finished_seeds).toEqual([10, 11]);
        expect(logic.properties.best.value).toBe(5);
    });

    it("counts a round that ended on input just before the restart", () => {
        game().score = 3;
        game().is_over = true;
        press();
        expect(logic.finished_seeds).toEqual([10]);
        expect(logic.properties.best.value).toBe(3);
        run_frames(2);
        expect(logic.finished_seeds).toEqual([10]);
    });

    it("lets a press start the next round instead of reaching the game", () => {
        press();
        expect(logic.presses).toBe(1);
        game().is_over = true;
        run_frames();
        press();
        expect(logic.presses).toBe(1);
        expect(logic.next_rounds).toBe(1);
        expect(game().seed).toBe(11);
        press();
        expect(logic.presses).toBe(2);
    });

    it("lets Space and Enter start the next round; other keys reach the game", () => {
        game().is_over = true;
        run_frames();
        key("x");
        expect(logic.key_presses).toBe(1);
        expect(logic.next_rounds).toBe(0);
        const event = key(" ");
        expect(event.defaultPrevented).toBe(true);
        expect(logic.next_rounds).toBe(1);
        expect(logic.key_presses).toBe(1);
        game().is_over = true;
        run_frames();
        key("Enter");
        expect(logic.next_rounds).toBe(2);
        expect(game().seed).toBe(12);
    });

    it("does not let a key held since before the end start the next round", () => {
        game().is_over = true;
        run_frames();
        key(" ", true);
        expect(logic.next_rounds).toBe(0);
    });

    it("does nothing for a game that says it never ends", () => {
        logic.is_endless = true;
        game().is_over = true;
        run_frames(3);
        press();
        key(" ");
        expect(logic.finished_seeds).toEqual([]);
        expect(logic.next_rounds).toBe(0);
        expect(logic.presses).toBe(1);
        expect(logic.key_presses).toBe(1);
    });
});
