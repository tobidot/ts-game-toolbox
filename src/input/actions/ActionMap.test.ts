// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { KeyboardState } from "../KeyboardState";
import { ActionBindings, DEFAULT_ACTIONS, PAD_BUTTONS } from "./ActionBindings";
import { ActionMap } from "./ActionMap";
import { GamepadLike } from "./Gamepads";
import { TouchControls } from "./TouchControls";

/** A pad as the browser hands it out; `press` and `tilt` change it between frames. */
class FakePad implements GamepadLike {
    public readonly index = 0;
    public connected = true;
    public buttons = Array.from({ length: 17 }, () => ({
        pressed: false,
        value: 0,
    }));
    public axes = [0, 0, 0, 0];

    public constructor(
        public readonly id: string = "Fake Pad (STANDARD GAMEPAD)",
        public readonly mapping: string = "standard",
    ) {}

    public press(index: number, is_down: boolean = true): void {
        this.buttons[index] = { pressed: is_down, value: is_down ? 1 : 0 };
    }

    public tilt(x: number, y: number): void {
        this.axes = [x, y, 0, 0];
    }
}

interface Rig {
    actions: ActionMap;
    keyboard: KeyboardState;
    element: HTMLElement;
    pads: (GamepadLike | null)[];
    touch: TouchControls;
}

function rig(bindings: ActionBindings = DEFAULT_ACTIONS): Rig {
    const element = document.createElement("div");
    const keyboard = new KeyboardState();
    keyboard.attach(element);
    const pads: (GamepadLike | null)[] = [];
    const touch = new TouchControls({
        stick: true,
        buttons: [{ action: "confirm", label: "OK" }],
    });
    touch.layout(960, 640);
    const actions = new ActionMap({
        bindings,
        keyboard,
        gamepads: () => pads,
        touch,
    });
    return { actions, keyboard, element, pads, touch };
}

function key(
    element: HTMLElement,
    type: "keydown" | "keyup",
    code: string,
): void {
    element.dispatchEvent(new KeyboardEvent(type, { key: code, code }));
}

/** One frame as the shell runs it: the map reads, the game reads, the keyboard ends its frame. */
function frame(rig_of: Rig): void {
    rig_of.actions.update();
}

function end_frame(rig_of: Rig): void {
    rig_of.keyboard.end_frame();
}

describe("ActionMap", () => {
    it("moves the same way with each device alone", () => {
        const keys = rig();
        key(keys.element, "keydown", "KeyD");
        frame(keys);
        expect(keys.actions.vector("move")).toEqual({ x: 1, y: 0 });
        expect(keys.actions.last_device).toBe("keyboard");

        const pad = rig();
        const fake = new FakePad();
        pad.pads.push(fake);
        fake.tilt(1, 0);
        frame(pad);
        expect(pad.actions.vector("move").x).toBeCloseTo(1);
        expect(pad.actions.vector("move").y).toBeCloseTo(0);
        expect(pad.actions.last_device).toBe("gamepad");

        const touch = rig();
        touch.touch.handle_down(1, { x: 200, y: 400 });
        touch.touch.handle_move(1, { x: 400, y: 400 });
        frame(touch);
        expect(touch.actions.vector("move").x).toBeCloseTo(1);
        expect(touch.actions.vector("move").y).toBeCloseTo(0);
        expect(touch.actions.last_device).toBe("touch");
    });

    it("doesn't go faster with two devices at once, nor on a diagonal", () => {
        const both = rig();
        const fake = new FakePad();
        both.pads.push(fake);
        fake.tilt(1, 0);
        key(both.element, "keydown", "ArrowRight");
        both.touch.handle_down(1, { x: 200, y: 400 });
        both.touch.handle_move(1, { x: 400, y: 400 });
        frame(both);
        const move = both.actions.vector("move");
        expect(Math.hypot(move.x, move.y)).toBeCloseTo(1);
        expect(move.x).toBeCloseTo(1);

        const diagonal = rig();
        key(diagonal.element, "keydown", "KeyW");
        key(diagonal.element, "keydown", "KeyD");
        frame(diagonal);
        const slant = diagonal.actions.vector("move");
        expect(Math.hypot(slant.x, slant.y)).toBeCloseTo(1);
        expect(slant.x).toBeCloseTo(Math.SQRT1_2);
        expect(slant.y).toBeCloseTo(-Math.SQRT1_2);
    });

    it("lets keys against each other cancel out, and a stick against a key slow down", () => {
        const { actions, element, pads, keyboard } = rig();
        key(element, "keydown", "KeyA");
        key(element, "keydown", "KeyD");
        actions.update();
        expect(actions.vector("move")).toEqual({ x: 0, y: 0 });
        keyboard.end_frame();
        key(element, "keyup", "KeyD");
        const fake = new FakePad();
        pads.push(fake);
        fake.tilt(0.6, 0);
        actions.update();
        expect(actions.vector("move").x).toBeCloseTo(-0.5);
    });

    it("keeps a stick inside the dead zone still, slow just outside and at 1 all the way", () => {
        const { actions, pads } = rig();
        const fake = new FakePad();
        pads.push(fake);
        fake.tilt(0.15, -0.1);
        actions.update();
        expect(actions.vector("move")).toEqual({ x: 0, y: 0 });
        fake.tilt(0, 0.25);
        actions.update();
        expect(actions.vector("move").y).toBeCloseTo(0.0625);
        fake.tilt(0, -1);
        actions.update();
        expect(actions.vector("move").y).toBeCloseTo(-1);
        // A corner where the pad reports more than 1 still gives at most 1.
        fake.tilt(0.95, 0.95);
        actions.update();
        const corner = actions.vector("move");
        expect(Math.hypot(corner.x, corner.y)).toBeCloseTo(1);
    });

    it("takes the dead zone from its options", () => {
        const pads: GamepadLike[] = [new FakePad()];
        const actions = new ActionMap({ gamepads: () => pads, dead_zone: 0.5 });
        (pads[0] as FakePad).tilt(0.4, 0);
        actions.update();
        expect(actions.vector("move").x).toBe(0);
        (pads[0] as FakePad).tilt(0.75, 0);
        actions.update();
        expect(actions.vector("move").x).toBeCloseTo(0.5);
    });

    it("reads the cross of a pad as a direction", () => {
        const { actions, pads } = rig();
        const fake = new FakePad();
        pads.push(fake);
        fake.press(PAD_BUTTONS.up);
        fake.press(PAD_BUTTONS.left);
        actions.update();
        const move = actions.vector("move");
        expect(move.x).toBeCloseTo(-Math.SQRT1_2);
        expect(move.y).toBeCloseTo(-Math.SQRT1_2);
    });

    it("says just_pressed for exactly one frame, for a key, a pad button and a touch button", () => {
        const keys = rig();
        key(keys.element, "keydown", "Space");
        frame(keys);
        expect(keys.actions.just_pressed("confirm")).toBe(true);
        expect(keys.actions.is_down("confirm")).toBe(true);
        end_frame(keys);
        frame(keys);
        expect(keys.actions.just_pressed("confirm")).toBe(false);
        expect(keys.actions.is_down("confirm")).toBe(true);
        key(keys.element, "keyup", "Space");
        end_frame(keys);
        frame(keys);
        expect(keys.actions.is_down("confirm")).toBe(false);
        expect(keys.actions.just_released("confirm")).toBe(true);
        end_frame(keys);
        frame(keys);
        expect(keys.actions.just_released("confirm")).toBe(false);

        const pad = rig();
        const fake = new FakePad();
        pad.pads.push(fake);
        frame(pad);
        fake.press(PAD_BUTTONS.a);
        frame(pad);
        expect(pad.actions.just_pressed("confirm")).toBe(true);
        expect(pad.actions.just_pressed("confirm", "gamepad")).toBe(true);
        expect(pad.actions.just_pressed("confirm", "keyboard")).toBe(false);
        frame(pad);
        expect(pad.actions.just_pressed("confirm")).toBe(false);
        expect(pad.actions.is_down("confirm")).toBe(true);

        const touch = rig();
        const [button] = touch.touch.buttons;
        touch.touch.handle_down(5, button.center);
        frame(touch);
        expect(touch.actions.just_pressed("confirm")).toBe(true);
        frame(touch);
        expect(touch.actions.just_pressed("confirm")).toBe(false);
        expect(touch.actions.is_down("confirm")).toBe(true);
        touch.touch.handle_up(5);
        frame(touch);
        expect(touch.actions.just_released("confirm")).toBe(true);
    });

    it("counts a key pressed and released between two frames as one press", () => {
        const { actions, element, keyboard } = rig();
        key(element, "keydown", "Enter");
        key(element, "keyup", "Enter");
        actions.update();
        expect(actions.just_pressed("confirm")).toBe(true);
        keyboard.end_frame();
        actions.update();
        expect(actions.is_down("confirm")).toBe(false);
        expect(actions.just_released("confirm")).toBe(true);
    });

    it("knows the last device by the last input", () => {
        const { actions, element, pads, touch, keyboard } = rig();
        expect(actions.last_device).toBe("keyboard");
        const fake = new FakePad();
        pads.push(fake);
        actions.update();
        // A pad that is only plugged in is no input yet.
        expect(actions.last_device).toBe("keyboard");
        fake.press(PAD_BUTTONS.x);
        actions.update();
        expect(actions.last_device).toBe("gamepad");
        touch.handle_down(1, { x: 100, y: 100 });
        actions.update();
        expect(actions.last_device).toBe("touch");
        // A key the game doesn't bind counts too: someone is at the keyboard.
        key(element, "keydown", "KeyQ");
        actions.update();
        expect(actions.last_device).toBe("keyboard");
        keyboard.end_frame();
        // A stick that drifts inside the dead zone is nobody.
        fake.tilt(0.1, 0);
        actions.update();
        expect(actions.last_device).toBe("keyboard");
        fake.tilt(0.9, 0);
        actions.update();
        expect(actions.last_device).toBe("gamepad");
        actions.note_device("touch");
        expect(actions.last_device).toBe("touch");
    });

    it("starts from the device it is told", () => {
        const actions = new ActionMap({ gamepads: () => [], device: "touch" });
        expect(actions.last_device).toBe("touch");
    });

    it("ignores a pad without the standard mapping and names it", () => {
        const { actions, pads } = rig();
        const odd = new FakePad("Odd Stick 0810-0001", "");
        pads.push(odd);
        odd.press(PAD_BUTTONS.a);
        odd.tilt(1, 0);
        actions.update();
        expect(actions.is_down("confirm")).toBe(false);
        expect(actions.vector("move")).toEqual({ x: 0, y: 0 });
        expect(actions.last_device).toBe("keyboard");
        expect(actions.pad).toBeNull();
        expect(actions.unsupported_pad).toBe("Odd Stick 0810-0001");
        const good = new FakePad();
        pads.push(good);
        good.press(PAD_BUTTONS.a);
        actions.update();
        expect(actions.is_down("confirm")).toBe(true);
        expect(actions.pad).toBe(good.id);
        pads.length = 0;
        actions.update();
        expect(actions.unsupported_pad).toBeNull();
        expect(actions.pad).toBeNull();
        expect(actions.is_down("confirm")).toBe(false);
    });

    it("skips a pad that is not connected", () => {
        const { actions, pads } = rig();
        const gone = new FakePad();
        gone.connected = false;
        gone.press(PAD_BUTTONS.a);
        pads.push(null, gone);
        actions.update();
        expect(actions.is_down("confirm")).toBe(false);
        expect(actions.pad).toBeNull();
    });

    it("nudges once when a direction passes half way, for menus", () => {
        const { actions, pads } = rig();
        const fake = new FakePad();
        pads.push(fake);
        fake.tilt(0, 0.4);
        actions.update();
        expect(actions.nudge("move")).toEqual({ x: 0, y: 0 });
        fake.tilt(0, 0.9);
        actions.update();
        expect(actions.nudge("move")).toEqual({ x: 0, y: 1 });
        expect(actions.nudge("move", "gamepad")).toEqual({ x: 0, y: 1 });
        expect(actions.nudge("move", "keyboard")).toEqual({ x: 0, y: 0 });
        actions.update();
        expect(actions.nudge("move")).toEqual({ x: 0, y: 0 });
        fake.tilt(0, -1);
        actions.update();
        expect(actions.nudge("move")).toEqual({ x: 0, y: -1 });
    });

    it("takes a game's own actions as plain data", () => {
        const { actions, element, pads } = rig({
            steer: { kind: "vector", stick: "right" },
            boost: { kind: "button", keys: ["ShiftLeft"], pad: ["rt"] },
        });
        const fake = new FakePad();
        pads.push(fake);
        fake.axes = [0, 0, 0, 1];
        key(element, "keydown", "ShiftLeft");
        actions.update();
        expect(actions.vector("steer").y).toBeCloseTo(1);
        expect(actions.is_down("boost")).toBe(true);
        expect(actions.has("boost")).toBe(true);
        expect(actions.has("move")).toBe(false);
        expect(() => actions.is_down("move")).toThrow(/no action "move"/);
        expect(() => actions.vector("boost")).toThrow(/not a vector/);
        expect(() => actions.is_down("steer")).toThrow(/not a button/);
    });

    it("forgets what is held on clear(), and a held button then is no new press", () => {
        const { actions, pads } = rig();
        const fake = new FakePad();
        pads.push(fake);
        fake.press(PAD_BUTTONS.a);
        fake.tilt(1, 0);
        actions.update();
        actions.clear();
        expect(actions.is_down("confirm")).toBe(false);
        expect(actions.vector("move")).toEqual({ x: 0, y: 0 });
        actions.update();
        expect(actions.is_down("confirm")).toBe(true);
        expect(actions.just_pressed("confirm")).toBe(false);
        fake.press(PAD_BUTTONS.a, false);
        actions.update();
        fake.press(PAD_BUTTONS.a);
        actions.update();
        expect(actions.just_pressed("confirm")).toBe(true);
    });

    it("works without any devices at all", () => {
        const actions = new ActionMap({
            keyboard: null,
            touch: null,
            gamepads: () => [],
        });
        actions.update();
        expect(actions.vector("move")).toEqual({ x: 0, y: 0 });
        expect(actions.is_down("pause")).toBe(false);
    });
});
