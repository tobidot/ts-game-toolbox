/* eslint-disable @typescript-eslint/naming-convention -- DOM event names */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UiManager } from "../ui/UiManager";
import { CanvasStage } from "./CanvasStage";
import { IntroGate } from "./IntroGate";
import { bind_stage_input } from "./StageInput";

function pointer(type: string, x = 0, y = 0): Event {
    return new MouseEvent(type, { clientX: x, clientY: y, bubbles: true });
}

describe("bind_stage_input", () => {
    let $host: HTMLDivElement;
    let stage: CanvasStage;
    let ui: UiManager;
    let controller: AbortController;

    beforeEach(() => {
        vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
            {} as CanvasRenderingContext2D,
        );
        $host = document.createElement("div");
        $host.tabIndex = 0;
        document.body.append($host);
        stage = new CanvasStage($host, [{ width: 960, height: 640 }]);
        ui = new UiManager();
        vi.spyOn(ui, "pointer_down");
        controller = new AbortController();
    });

    afterEach(() => {
        controller.abort();
        $host.remove();
        vi.restoreAllMocks();
    });

    /** An intro that is waiting until its first `leave()`, then done. */
    function waiting_intro(): IntroGate {
        let is_waiting = true;
        return {
            leave: () => is_waiting && !(is_waiting = false),
            get is_done() {
                return !is_waiting;
            },
        } as unknown as IntroGate;
    }

    it("gives the wheel to the UI after the intro, and blocks the page's scroll only if taken", () => {
        const wheel = vi.spyOn(ui, "wheel").mockReturnValue(false);
        bind_stage_input(controller.signal, {
            stage,
            ui,
            intro: waiting_intro(),
            host: $host,
        });
        const turn = (delta_mode: number = 0): WheelEvent => {
            const event = new WheelEvent("wheel", {
                deltaY: 100,
                deltaMode: delta_mode,
                cancelable: true,
            });
            stage.$canvas.dispatchEvent(event);
            return event;
        };
        expect(turn().defaultPrevented).toBe(false);
        expect(wheel).not.toHaveBeenCalled();
        stage.$canvas.dispatchEvent(pointer("pointerdown"));
        expect(turn().defaultPrevented).toBe(false);
        expect(wheel).toHaveBeenLastCalledWith(expect.anything(), 100);
        wheel.mockReturnValue(true);
        expect(turn().defaultPrevented).toBe(true);
        // a browser that counts lines scrolls about as far as one that counts pixels
        turn(WheelEvent.DOM_DELTA_LINE);
        expect(wheel).toHaveBeenLastCalledWith(expect.anything(), 2000);
    });

    it("gives the first click to the start screen only, later ones to the UI and the game", () => {
        const on_press = vi.fn();
        const on_change = vi.fn();
        bind_stage_input(
            controller.signal,
            { stage, ui, intro: waiting_intro(), host: $host },
            { on_press, on_change },
        );
        stage.$canvas.dispatchEvent(pointer("pointerdown"));
        expect(ui.pointer_down).not.toHaveBeenCalled();
        expect(on_press).not.toHaveBeenCalled();
        expect(on_change).toHaveBeenCalledTimes(1);

        stage.$canvas.dispatchEvent(pointer("pointerdown"));
        expect(ui.pointer_down).toHaveBeenCalledTimes(1);
        expect(on_press).toHaveBeenCalledTimes(1);
        expect(document.activeElement).toBe($host);
    });

    it("keeps a press a widget took away from the game", () => {
        const on_press = vi.fn();
        bind_stage_input(
            controller.signal,
            { stage, ui, host: $host },
            { on_press },
        );
        vi.mocked(ui.pointer_down).mockImplementation(() => {
            ui.mouse_locked_element = {} as UiManager["mouse_locked_element"];
            return true;
        });
        stage.$canvas.dispatchEvent(pointer("pointerdown"));
        expect(on_press).not.toHaveBeenCalled();
    });

    it("passes keys after the intro, without modifiers, and the start key nowhere", () => {
        const on_key_down = vi.fn();
        bind_stage_input(
            controller.signal,
            { stage, ui, intro: waiting_intro(), host: $host },
            { on_key_down },
        );
        const start = new KeyboardEvent("keydown", {
            key: "5",
            cancelable: true,
        });
        $host.dispatchEvent(start);
        expect(start.defaultPrevented).toBe(true);
        $host.dispatchEvent(
            new KeyboardEvent("keydown", { key: "5", ctrlKey: true }),
        );
        expect(on_key_down).not.toHaveBeenCalled();
        $host.dispatchEvent(new KeyboardEvent("keydown", { key: "5" }));
        expect(on_key_down).toHaveBeenCalledTimes(1);
    });

    it("stops listening when the signal aborts", () => {
        const on_press = vi.fn();
        bind_stage_input(
            controller.signal,
            { stage, ui, host: $host },
            { on_press },
        );
        controller.abort();
        stage.$canvas.dispatchEvent(pointer("pointerdown"));
        expect(on_press).not.toHaveBeenCalled();
    });

    it("never clicks a widget on pointercancel", () => {
        bind_stage_input(controller.signal, { stage, ui, host: $host });
        const exit = vi.spyOn(ui, "pointer_exit");
        const up = vi.spyOn(ui, "pointer_up");
        stage.$canvas.dispatchEvent(pointer("pointercancel"));
        expect(exit).toHaveBeenCalled();
        expect(up).not.toHaveBeenCalled();
    });

    it("routes shortcuts apart and blocks game keys during the intro too", () => {
        const on_key_down = vi.fn();
        const on_shortcut = vi.fn();
        let is_done = false;
        const intro = {
            leave: () => false,
            get is_done() {
                return is_done;
            },
        } as unknown as IntroGate;
        bind_stage_input(
            controller.signal,
            { stage, ui, intro, host: $host, blocked_keys: [" "] },
            { on_key_down, on_shortcut },
        );
        const early = new KeyboardEvent("keydown", {
            key: " ",
            cancelable: true,
        });
        $host.dispatchEvent(early);
        expect(early.defaultPrevented).toBe(true);
        expect(on_key_down).not.toHaveBeenCalled();
        is_done = true;
        $host.dispatchEvent(
            new KeyboardEvent("keydown", { key: "z", ctrlKey: true }),
        );
        expect(on_shortcut).toHaveBeenCalledTimes(1);
        expect(on_key_down).not.toHaveBeenCalled();
    });
});
