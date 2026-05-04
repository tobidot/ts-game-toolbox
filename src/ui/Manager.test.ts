import { describe, it, expect } from "vitest";
import { UiManager } from "./UiManager";
import { Group } from "./Group";
import { Button } from "./widgets/Button";
import { CheckBox } from "./widgets/CheckBox";
import { Slider } from "./widgets/Slider";
import { Vector2I } from "../geometries/Vector2";
import { ElementClickEvent, ElementChangeEvent } from "./events";

describe('MenuManager', () => {
    it('should handle pointer interaction', () => {
        const manager = new UiManager();
        let click_count = 0;
        
        const button = new Button("Test", { left: 10, top: 10, width: 100, height: 50 });
        button.events.attach(ElementClickEvent, () => {
            click_count++;
        });
        
        const group = new Group([button], { left: 0, top: 0, width: 200, height: 200 });
        manager.active_menu = group;
        
        // Pointer down on button
        const pos: Vector2I = { x: 15, y: 15 };
        const handled_down = manager.pointer_down(pos);
        expect(handled_down).toBe(true);
        expect(manager.mouse_locked_element).toBe(button);
        expect(button.is_down).toBe(true);
        
        // Pointer up on button
        const handled_up = manager.pointer_up(pos);
        expect(handled_up).toBe(true);
        expect(click_count).toBe(1);
        expect(button.is_down).toBe(false);
        expect(manager.mouse_locked_element).toBe(null);
    });

    it('should handle pointer move and hover', () => {
        const manager = new UiManager();
        const button = new Button("Test", { left: 10, top: 10, width: 100, height: 50 });
        const group = new Group([button], { left: 0, top: 0, width: 200, height: 200 });
        manager.active_menu = group;
        
        // Move over button
        manager.pointer_move({ x: 15, y: 15 });
        expect(button.is_hovered).toBe(true);
        
        // Move out of button
        manager.pointer_move({ x: 5, y: 5 });
        expect(button.is_hovered).toBe(false);
    });

    it('should handle CheckBox toggle', () => {
        const checkbox = new CheckBox("Test", false, { left: 0, top: 0, width: 100, height: 100 });
        let change_count = 0;
        checkbox.events.attach(ElementChangeEvent, () => {
            change_count++;
        });
        
        checkbox.on_click({ x: 50, y: 50 });
        expect(checkbox.checked).toBe(true);
        expect(change_count).toBe(1);
        
        checkbox.on_click({ x: 50, y: 50 });
        expect(checkbox.checked).toBe(false);
        expect(change_count).toBe(2);
    });

    it('should handle Slider drag', () => {
        const slider = new Slider("Test", 0, 100, 50, { left: 0, top: 0, width: 100, height: 100 });
        let change_count = 0;
        slider.events.attach(ElementChangeEvent, () => {
            change_count++;
        });
        
        // Drag to 75%
        slider.drag(null, { x: 75, y: 50 });
        expect(slider.value).toBe(75);
        expect(change_count).toBe(1);
        
        // Drag to 25%
        slider.drag(null, { x: 25, y: 50 });
        expect(slider.value).toBe(25);
        expect(change_count).toBe(2);
        
        // Drag out of bounds (right)
        slider.drag(null, { x: 150, y: 50 });
        expect(slider.value).toBe(100);
        
        // Drag out of bounds (left)
        slider.drag(null, { x: -50, y: 50 });
        expect(slider.value).toBe(0);
    });
});
