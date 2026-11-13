import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CanvasGameElement } from "./CanvasGameElement";
import { CanvasGameLogic } from "./CanvasGameLogic";
import { CanvasGameProperties } from "./CanvasGameProperties";
import { CanvasGameRenderer } from "./CanvasGameRenderer";
import { CanvasGameSettings } from "./CanvasGameSettings";

class Game {}

class Settings extends CanvasGameSettings {
    public override readonly frames_per_second = 60;
}

class Properties extends CanvasGameProperties<Game, Settings> {}

class Renderer extends CanvasGameRenderer<Game, Settings> {
    protected paint(): void {}
}

class Logic extends CanvasGameLogic<Game, Settings, Properties> {
    public deltas: number[] = [];
    public frames: number[] = [];
    protected create_game(): Game {
        return new Game();
    }
    protected override update(_game: Game, delta_seconds: number): boolean {
        this.deltas.push(delta_seconds);
        this.frames.push(this.properties.frame_seconds);
        return false;
    }
}

class FrameTimeElement extends CanvasGameElement<Logic> {
    public readonly logic = this.assemble({
        settings: Settings,
        properties: Properties,
        renderer: Renderer,
        logic: Logic,
    });
}

customElements.define("test-frame-time", FrameTimeElement);

describe("properties.frame_seconds", () => {
    let frames: FrameRequestCallback[] = [];
    let time_ms = 1000;
    let logic: Logic;

    function frame_after(milliseconds: number): void {
        time_ms += milliseconds;
        const due = frames;
        frames = [];
        for (const callback of due) {
            callback(time_ms);
        }
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
        const $element = document.createElement(
            "test-frame-time",
        ) as FrameTimeElement;
        $element.setAttribute("init-intro", "false");
        document.body.append($element);
        logic = $element.logic;
    });

    afterEach(() => {
        document.body.innerHTML = "";
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it("is the real length of the frame, where update() gets at most 0.1 s", () => {
        frame_after(20);
        frame_after(20);
        frame_after(300);
        frame_after(17);
        expect(logic.frames[0]).toBe(0);
        expect(logic.frames.slice(1)).toEqual([0.02, 0.3, 0.017]);
        expect(logic.deltas.slice(1)).toEqual([0.02, 0.1, 0.017]);
    });
});
