// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { PointerInput } from "./PointerInput";

/** DOM init keys are camelCase; the toolbox's naming rule is for its own code. */
function pointer_init(
    x: number,
    y: number,
    type: string,
    button: number,
    id: number,
    primary: boolean,
): PointerEventInit {
    /* eslint-disable @typescript-eslint/naming-convention */
    return {
        clientX: x,
        clientY: y,
        pointerType: type,
        button,
        pointerId: id,
        isPrimary: primary,
        bubbles: true,
        cancelable: true,
    };
    /* eslint-enable @typescript-eslint/naming-convention */
}

function fire(
    target: EventTarget,
    name: string,
    x: number,
    y: number,
    options: {
        type?: string;
        button?: number;
        id?: number;
        primary?: boolean;
    } = {},
): void {
    target.dispatchEvent(
        new PointerEvent(
            name,
            pointer_init(
                x,
                y,
                options.type ?? "mouse",
                options.button ?? 0,
                options.id ?? 1,
                options.primary ?? true,
            ),
        ),
    );
}

function setup(options?: ConstructorParameters<typeof PointerInput>[0]): {
    pointer: PointerInput;
    element: HTMLElement;
} {
    const element = document.createElement("div");
    const pointer = new PointerInput(options);
    pointer.attach(element);
    return { pointer, element };
}

describe("PointerInput", () => {
    it("starts unknown and follows the position while hovering", () => {
        const { pointer, element } = setup();
        expect(pointer.state.position).toBeNull();
        expect(pointer.state.pointer_type).toBe("none");
        fire(element, "pointermove", 10, 20);
        expect(pointer.state.position).toEqual({ x: 10, y: 20 });
        expect(pointer.state.is_down).toBe(false);
        expect(pointer.state.pointer_type).toBe("mouse");
        fire(element, "pointerleave", 10, 20);
        expect(pointer.state.position).toBeNull();
    });

    it("reports a press and a release without movement as one tap", () => {
        const { pointer, element } = setup();
        fire(element, "pointerdown", 30, 40);
        expect(pointer.state.is_down).toBe(true);
        expect(pointer.state.down_position).toEqual({ x: 30, y: 40 });
        expect(pointer.state.button).toBe(0);
        expect(pointer.taps()).toEqual([]);
        fire(element, "pointermove", 31, 41); // inside the threshold
        expect(pointer.state.drag).toBeNull();
        fire(element, "pointerup", 31, 41);
        expect(pointer.state.is_down).toBe(false);
        expect(pointer.state.down_position).toBeNull();
        expect(pointer.taps()).toEqual([{ x: 30, y: 40 }]);
        expect(pointer.drops()).toEqual([]);
        pointer.end_frame();
        expect(pointer.taps()).toEqual([]);
    });

    it("turns a press that moves past the threshold into a drag and a drop", () => {
        const { pointer, element } = setup({ drag_threshold: 6 });
        fire(element, "pointerdown", 100, 100);
        fire(element, "pointermove", 104, 100);
        expect(pointer.state.drag).toBeNull();
        fire(element, "pointermove", 110, 108);
        expect(pointer.state.drag).toEqual({
            start: { x: 100, y: 100 },
            current: { x: 110, y: 108 },
            delta: { x: 10, y: 8 },
        });
        fire(element, "pointermove", 103, 101); // back inside: still a drag
        expect(pointer.state.drag?.delta).toEqual({ x: 3, y: 1 });
        fire(element, "pointerup", 150, 120);
        expect(pointer.taps()).toEqual([]);
        expect(pointer.drops()).toEqual([
            { start: { x: 100, y: 100 }, end: { x: 150, y: 120 } },
        ]);
        expect(pointer.state.drag).toBeNull();
        expect(pointer.state.position).toEqual({ x: 150, y: 120 });
    });

    it("maps every position through the transform option", () => {
        const { pointer, element } = setup({
            transform: (x, y) => ({ x: x / 2, y: y / 2 - 10 }),
        });
        fire(element, "pointerdown", 40, 60);
        expect(pointer.state.down_position).toEqual({ x: 20, y: 20 });
        fire(element, "pointermove", 80, 100);
        expect(pointer.state.drag?.current).toEqual({ x: 40, y: 40 });
        fire(element, "pointerup", 80, 100);
        expect(pointer.drops()[0]).toEqual({
            start: { x: 20, y: 20 },
            end: { x: 40, y: 40 },
        });
    });

    it("reads touch as button -1 and ignores a second finger", () => {
        const { pointer, element } = setup();
        fire(element, "pointerdown", 10, 10, { type: "touch", id: 7 });
        expect(pointer.state.pointer_type).toBe("touch");
        expect(pointer.state.button).toBe(-1);
        fire(element, "pointerdown", 200, 200, {
            type: "touch",
            id: 8,
            primary: false,
        });
        fire(element, "pointermove", 210, 210, {
            type: "touch",
            id: 8,
            primary: false,
        });
        expect(pointer.state.position).toEqual({ x: 10, y: 10 });
        fire(element, "pointerup", 210, 210, {
            type: "touch",
            id: 8,
            primary: false,
        });
        expect(pointer.state.is_down).toBe(true);
        fire(element, "pointerup", 10, 10, { type: "touch", id: 7 });
        expect(pointer.state.is_down).toBe(false);
        expect(pointer.taps()).toEqual([{ x: 10, y: 10 }]);
    });

    it("keeps the position during a press that leaves and drops nothing on cancel", () => {
        const { pointer, element } = setup();
        fire(element, "pointerdown", 5, 5);
        fire(element, "pointerleave", 5, 5);
        expect(pointer.state.position).toEqual({ x: 5, y: 5 });
        fire(element, "pointermove", 50, 50);
        fire(element, "pointercancel", 50, 50);
        expect(pointer.state.is_down).toBe(false);
        expect(pointer.state.drag).toBeNull();
        expect(pointer.taps()).toEqual([]);
        expect(pointer.drops()).toEqual([]);
    });

    it("sums wheel events as ±1 steps per frame and swallows the context menu", () => {
        const { pointer, element } = setup();
        /* eslint-disable @typescript-eslint/naming-convention */
        element.dispatchEvent(new WheelEvent("wheel", { deltaY: 120 }));
        element.dispatchEvent(new WheelEvent("wheel", { deltaY: 3 }));
        element.dispatchEvent(new WheelEvent("wheel", { deltaY: -50 }));
        /* eslint-enable @typescript-eslint/naming-convention */
        expect(pointer.wheel()).toBe(1);
        pointer.end_frame();
        expect(pointer.wheel()).toBe(0);
        const menu = new MouseEvent("contextmenu", { cancelable: true });
        element.dispatchEvent(menu);
        expect(menu.defaultPrevented).toBe(true);
    });

    it("can be driven without events through the handle_* core", () => {
        const pointer = new PointerInput({ drag_threshold: 2 });
        pointer.handle_down({ x: 0, y: 0 }, 2, "pen");
        expect(pointer.state.button).toBe(2);
        expect(pointer.state.pointer_type).toBe("pen");
        pointer.handle_down({ x: 9, y: 9 }); // a second press while pressed is ignored
        expect(pointer.state.down_position).toEqual({ x: 0, y: 0 });
        pointer.handle_move({ x: 3, y: 4 });
        expect(pointer.state.drag?.delta).toEqual({ x: 3, y: 4 });
        pointer.handle_up({ x: 3, y: 4 });
        expect(pointer.drops()).toHaveLength(1);
    });

    it("stops listening on detach and on the abort signal", () => {
        const { pointer, element } = setup();
        fire(element, "pointerdown", 1, 1);
        pointer.detach();
        expect(pointer.state.is_down).toBe(false);
        expect(pointer.state.position).toBeNull();
        fire(element, "pointermove", 2, 2);
        expect(pointer.state.position).toBeNull();

        const controller = new AbortController();
        pointer.attach(element, controller.signal);
        fire(element, "pointermove", 3, 3);
        expect(pointer.state.position).toEqual({ x: 3, y: 3 });
        controller.abort();
        fire(element, "pointermove", 4, 4);
        expect(pointer.state.position).toBeNull();
    });
});
