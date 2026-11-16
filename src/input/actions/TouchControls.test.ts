import { describe, expect, it } from "vitest";
import { TouchControls } from "./TouchControls";

function controls(): TouchControls {
    const touch = new TouchControls({
        stick: true,
        buttons: [
            { action: "fire", label: "Feuer" },
            { action: "jump", label: "Sprung" },
        ],
        stick_radius: 50,
    });
    touch.layout(960, 640);
    return touch;
}

describe("TouchControls", () => {
    it("takes nothing and shows nothing when it has neither stick nor buttons", () => {
        const touch = new TouchControls();
        touch.layout(960, 640);
        expect(touch.is_enabled).toBe(false);
        expect(touch.handle_down(1, { x: 100, y: 300 })).toBe(false);
        expect(touch.is_shown).toBe(false);
    });

    it("puts the stick where the thumb lands on the left half, and shows from the first touch", () => {
        const touch = controls();
        expect(touch.is_shown).toBe(false);
        expect(touch.handle_down(1, { x: 700, y: 100 })).toBe(false);
        expect(touch.handle_down(1, { x: 150, y: 400 })).toBe(true);
        expect(touch.is_shown).toBe(true);
        expect(touch.stick?.origin).toEqual({ x: 150, y: 400 });
        expect(touch.stick_vector()).toEqual({ x: 0, y: 0 });
        touch.handle_move(1, { x: 150, y: 350 });
        expect(touch.stick_vector().y).toBeCloseTo(-1);
        // Further than the reach: the knob stays at the edge, the vector at 1.
        touch.handle_move(1, { x: 300, y: 400 });
        expect(touch.stick?.knob).toEqual({ x: 200, y: 400 });
        expect(touch.stick_vector().x).toBeCloseTo(1);
        expect(touch.handle_up(1)).toBe(true);
        expect(touch.stick).toBeNull();
        expect(touch.stick_vector()).toEqual({ x: 0, y: 0 });
    });

    it("keeps a resting thumb still inside its small dead zone", () => {
        const touch = controls();
        touch.handle_down(1, { x: 150, y: 400 });
        touch.handle_move(1, { x: 154, y: 400 });
        expect(touch.stick_vector()).toEqual({ x: 0, y: 0 });
        touch.handle_move(1, { x: 175, y: 400 });
        expect(touch.stick_vector().x).toBeGreaterThan(0.3);
        expect(touch.stick_vector().x).toBeLessThan(0.5);
    });

    it("places the buttons in the bottom right, the first in the corner", () => {
        const touch = controls();
        const [fire, jump] = touch.buttons;
        expect(fire.center.x + fire.radius).toBeLessThan(960);
        expect(fire.center.y + fire.radius).toBeLessThan(640);
        expect(jump.center.x).toBeLessThan(fire.center.x);
        expect(jump.center.y).toBeLessThan(fire.center.y);
        expect(jump.center.x).toBeGreaterThan(480);
    });

    it("lets one thumb steer while the other holds a button", () => {
        const touch = controls();
        const [fire] = touch.buttons;
        touch.handle_down(1, { x: 150, y: 400 });
        expect(touch.handle_down(2, fire.center)).toBe(true);
        expect(touch.is_button_down("fire")).toBe(true);
        expect(touch.is_button_down("jump")).toBe(false);
        touch.handle_move(1, { x: 100, y: 400 });
        expect(touch.stick_vector().x).toBeCloseTo(-1);
        // A third finger on the left half doesn't steal the stick.
        expect(touch.handle_down(3, { x: 300, y: 200 })).toBe(false);
        expect(touch.handle_move(2, { x: 0, y: 0 })).toBe(true);
        expect(touch.handle_up(2)).toBe(true);
        expect(touch.is_button_down("fire")).toBe(false);
        expect(touch.stick).not.toBeNull();
        expect(touch.handle_up(9)).toBe(false);
        expect(touch.touch_count).toBe(2);
    });

    it("holds a button while any finger is on it", () => {
        const touch = controls();
        const [fire] = touch.buttons;
        touch.handle_down(1, fire.center);
        touch.handle_down(2, fire.center);
        touch.handle_up(1);
        expect(touch.is_button_down("fire")).toBe(true);
        touch.handle_up(2);
        expect(touch.is_button_down("fire")).toBe(false);
    });

    it("lets go of everything at once", () => {
        const touch = controls();
        touch.handle_down(1, { x: 150, y: 400 });
        touch.handle_down(2, touch.buttons[1].center);
        touch.release_all();
        expect(touch.stick).toBeNull();
        expect(touch.is_button_down("jump")).toBe(false);
        expect(touch.handle_move(2, { x: 0, y: 0 })).toBe(false);
    });
});
