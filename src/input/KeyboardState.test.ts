// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { KeyboardState } from "./KeyboardState";

function key_down(
    target: EventTarget,
    key: string,
    init: KeyboardEventInit = {},
): void {
    target.dispatchEvent(new KeyboardEvent("keydown", { key, ...init }));
}

/** DOM init keys are camelCase; the toolbox's naming rule is for its own code. */
function with_modifiers(ctrl: boolean, alt: boolean): KeyboardEventInit {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    return { ctrlKey: ctrl, altKey: alt };
}

function key_up(target: EventTarget, key: string): void {
    target.dispatchEvent(new KeyboardEvent("keyup", { key }));
}

function setup(): { keyboard: KeyboardState; element: HTMLElement } {
    const element = document.createElement("div");
    const keyboard = new KeyboardState();
    keyboard.attach(element);
    return { keyboard, element };
}

describe("KeyboardState", () => {
    it("reports a key as down while it is held and as pressed once", () => {
        const { keyboard, element } = setup();
        expect(keyboard.is_down("ArrowLeft")).toBe(false);
        key_down(element, "ArrowLeft");
        expect(keyboard.is_down("ArrowLeft")).toBe(true);
        expect(keyboard.was_pressed("ArrowLeft")).toBe(true);
        keyboard.end_frame();
        expect(keyboard.is_down("ArrowLeft")).toBe(true);
        expect(keyboard.was_pressed("ArrowLeft")).toBe(false);
        key_up(element, "ArrowLeft");
        expect(keyboard.is_down("ArrowLeft")).toBe(false);
        expect(keyboard.was_released("ArrowLeft")).toBe(true);
        keyboard.end_frame();
        expect(keyboard.was_released("ArrowLeft")).toBe(false);
    });

    it("does not count auto-repeat as a new press but types it", () => {
        const { keyboard, element } = setup();
        key_down(element, "a");
        keyboard.end_frame();
        key_down(element, "a", { repeat: true });
        key_down(element, "a", { repeat: true });
        expect(keyboard.was_pressed("a")).toBe(false);
        expect(keyboard.is_down("a")).toBe(true);
        expect(keyboard.typed()).toEqual(["a", "a"]);
    });

    it("collects typed characters in order and skips non-printable keys", () => {
        const { keyboard, element } = setup();
        key_down(element, "H");
        key_down(element, "Shift");
        key_down(element, "ä");
        key_down(element, "Enter");
        key_down(element, " ");
        key_down(element, "x", with_modifiers(true, false));
        key_down(element, "@", with_modifiers(true, true));
        expect(keyboard.typed()).toEqual(["H", "ä", " ", "@"]);
        expect(keyboard.was_pressed("Enter")).toBe(true);
        keyboard.end_frame();
        expect(keyboard.typed()).toEqual([]);
    });

    it("forgets held keys on blur", () => {
        const { keyboard, element } = setup();
        key_down(element, "ArrowUp");
        element.dispatchEvent(new Event("blur"));
        expect(keyboard.is_down("ArrowUp")).toBe(false);
        expect(keyboard.was_pressed("ArrowUp")).toBe(false);
        // A key that went down while unfocused never reported a release.
        key_up(element, "ArrowUp");
        expect(keyboard.was_released("ArrowUp")).toBe(false);
    });

    it("stops listening on detach and when the signal aborts", () => {
        const { keyboard, element } = setup();
        keyboard.detach();
        key_down(element, "a");
        expect(keyboard.is_down("a")).toBe(false);

        const controller = new AbortController();
        keyboard.attach(element, controller.signal);
        key_down(element, "b");
        expect(keyboard.is_down("b")).toBe(true);
        controller.abort();
        expect(keyboard.is_down("b")).toBe(false);
        key_down(element, "c");
        expect(keyboard.is_down("c")).toBe(false);
    });

    it("moves to the new target when attached again", () => {
        const { keyboard, element } = setup();
        const other = document.createElement("div");
        keyboard.attach(other);
        key_down(element, "a");
        key_down(other, "b");
        expect(keyboard.is_down("a")).toBe(false);
        expect(keyboard.is_down("b")).toBe(true);
    });
});
