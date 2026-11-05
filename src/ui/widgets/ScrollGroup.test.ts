import { describe, expect, it, vi } from "vitest";
import { ElementClickEvent } from "../events";
import { theme_rules_from } from "../theme/ThemeRuleBuilder";
import { UiManager } from "../UiManager";
import { UiPage } from "../UiPage";
import { Button } from "./Button";
import { ScrollGroup } from "./ScrollGroup";
import { Slider } from "./Slider";

const ROW_HEIGHT = 50;
/** The list shows four rows at 100,100 of a 400x400 page. */
const LIST = { left: 100, top: 100, width: 200, height: 4 * ROW_HEIGHT };

function setup(rows: number = 10) {
    const page = new UiPage(
        { x: 400, y: 400 },
        { left: 0, top: 0, width: 1, height: 1 },
        { left: 0, top: 0, width: 400, height: 400 },
    );
    const list = new ScrollGroup([], LIST);
    const buttons = Array.from({ length: rows }, (_, index) => {
        const button = new Button(`${index}`, {
            left: 0,
            top: index * ROW_HEIGHT,
            width: 200,
            height: ROW_HEIGHT,
        });
        list.add(button);
        return button;
    });
    page.add(list);
    const ui = new UiManager();
    ui.active_menu = page;
    const clicks = vi.fn();
    buttons.forEach((button) =>
        button.events.attach(ElementClickEvent, () => clicks(button.label)),
    );
    return { page, list, buttons, ui, clicks };
}

describe("ScrollGroup", () => {
    it("measures its content and keeps the scroll inside it", () => {
        const { list, buttons } = setup();
        expect(list.content_height).toBe(500);
        expect(list.max_scroll).toBe(300);
        list.scroll = 1000;
        expect(list.scroll).toBe(300);
        list.scroll = -5;
        expect(list.scroll).toBe(0);
        // rows going away pull the scroll back
        list.scroll = 300;
        for (const button of buttons.slice(5)) {
            list.remove(button);
        }
        expect(list.scroll).toBe(50);
    });

    it("hits through the scroll, and nothing that is clipped away", () => {
        const { page, list, buttons } = setup();
        const middle_x = 200;
        expect(page.hit({ x: middle_x, y: 125 })[0]).toBe(buttons[0]);
        list.scroll = 100;
        expect(page.hit({ x: middle_x, y: 125 })[0]).toBe(buttons[2]);
        // above and below its rect there are rows too, but they don't show
        expect(page.hit({ x: middle_x, y: 90 })[0]).toBe(page);
        expect(page.hit({ x: middle_x, y: 310 })[0]).toBe(page);
        // half a row at the bottom edge is still that row
        list.scroll = 25;
        expect(page.hit({ x: middle_x, y: 299 })[0]).toBe(buttons[4]);
    });

    it("scrolls as little as it takes to show a child", () => {
        const { list, buttons } = setup();
        list.scroll_to(buttons[2]);
        expect(list.scroll).toBe(0);
        list.scroll_to(buttons[5]);
        expect(list.scroll).toBe(6 * ROW_HEIGHT - LIST.height);
        list.scroll_to(buttons[3]);
        expect(list.scroll).toBe(6 * ROW_HEIGHT - LIST.height);
        list.scroll_to(buttons[1]);
        expect(list.scroll).toBe(ROW_HEIGHT);
    });

    it("clicks a row on a tap, even a shaky one, and doesn't scroll", () => {
        const { list, ui, clicks } = setup();
        ui.pointer_down({ x: 200, y: 125 });
        ui.pointer_move({ x: 203, y: 129 });
        ui.pointer_up({ x: 203, y: 129 });
        expect(clicks).toHaveBeenCalledTimes(1);
        expect(clicks).toHaveBeenCalledWith("0");
        expect(list.scroll).toBe(0);
    });

    it("takes a drag that starts on a row, without pressing the row", () => {
        const { list, buttons, ui, clicks } = setup();
        ui.pointer_down({ x: 200, y: 200 });
        expect(buttons[2].is_down).toBe(true);
        ui.pointer_move({ x: 200, y: 180 });
        expect(buttons[2].is_down).toBe(false);
        expect(ui.mouse_locked_element).toBe(list);
        ui.pointer_move({ x: 200, y: 130 });
        // from where it was taken: one to one, without the jump of the threshold
        expect(list.scroll).toBe(50);
        // back over the row it started on: still no click
        ui.pointer_move({ x: 200, y: 200 });
        ui.pointer_up({ x: 200, y: 200 });
        expect(clicks).not.toHaveBeenCalled();
        expect(ui.mouse_locked_element).toBe(null);
    });

    it("starts the next drag from where the last one ended", () => {
        const { list, ui } = setup();
        ui.pointer_down({ x: 200, y: 200 });
        ui.pointer_move({ x: 200, y: 180 });
        ui.pointer_move({ x: 200, y: 130 });
        ui.pointer_up({ x: 200, y: 130 });
        expect(list.scroll).toBe(50);
        ui.pointer_down({ x: 200, y: 200 });
        ui.pointer_move({ x: 200, y: 180 });
        expect(list.scroll).toBe(50);
        ui.pointer_move({ x: 200, y: 170 });
        expect(list.scroll).toBe(60);
    });

    it("leaves the click alone when there is nothing to scroll", () => {
        const { list, ui, clicks } = setup(3);
        ui.pointer_down({ x: 200, y: 125 });
        ui.pointer_move({ x: 150, y: 140 });
        ui.pointer_up({ x: 150, y: 140 });
        expect(list.scroll).toBe(0);
        expect(clicks).toHaveBeenCalledTimes(1);
    });

    it("drags from a press between the rows, at once", () => {
        const { list, buttons, ui } = setup();
        for (const button of buttons) {
            button.rect.height = ROW_HEIGHT - 10;
        }
        ui.pointer_down({ x: 200, y: 145 });
        expect(ui.mouse_locked_element).toBe(list);
        ui.pointer_move({ x: 200, y: 140 });
        expect(list.scroll).toBe(5);
    });

    it("lets a widget that drags by itself keep its drag", () => {
        const { list, ui } = setup();
        const slider = new Slider("s", 0, 100, 0, {
            left: 0,
            top: 0,
            width: 200,
            height: ROW_HEIGHT,
        });
        list.add(slider);
        ui.pointer_down({ x: 110, y: 125 });
        ui.pointer_move({ x: 110, y: 200 });
        expect(ui.mouse_locked_element).toBe(slider);
        expect(list.scroll).toBe(0);
    });

    it("takes the wheel over itself, and nowhere else", () => {
        const { list, ui } = setup();
        expect(ui.wheel({ x: 200, y: 150 }, 70)).toBe(true);
        expect(list.scroll).toBe(70);
        expect(ui.wheel({ x: 10, y: 10 }, 70)).toBe(false);
        expect(list.scroll).toBe(70);
        // also at the end, so the page behind doesn't start to scroll
        expect(ui.wheel({ x: 200, y: 150 }, 5000)).toBe(true);
        expect(list.scroll).toBe(300);
    });

    it("leaves the wheel to others with nothing to scroll", () => {
        const { ui } = setup(2);
        expect(ui.wheel({ x: 200, y: 150 }, 70)).toBe(false);
    });

    it("keeps a dead row from holding the press while it scrolls", () => {
        const { list, buttons, ui, clicks } = setup();
        ui.pointer_down({ x: 200, y: 125 });
        list.remove(buttons[0]);
        ui.pointer_move({ x: 200, y: 200 });
        ui.pointer_up({ x: 200, y: 200 });
        expect(clicks).not.toHaveBeenCalled();
        expect(list.scroll).toBe(0);
    });

    it("clips its drawing to the rect and skips rows out of sight", () => {
        const { list, buttons } = setup();
        list.scroll = 50;
        const draws = buttons.map((button) => vi.spyOn(button, "draw"));
        const calls: string[] = [];
        const ctx = new Proxy(
            { canvas: { width: 400, height: 400 } },
            {
                get: (target, name) =>
                    name in target
                        ? (target as Record<string | symbol, unknown>)[name]
                        : (...args: unknown[]) => {
                              calls.push(`${String(name)} ${args.join()}`);
                          },
                set: () => true,
            },
        ) as unknown as CanvasRenderingContext2D;
        list.draw(ctx);
        expect(calls).toContain("rect 100,100,200,200");
        expect(calls).toContain("clip ");
        expect(calls).toContain("translate 100,50");
        expect(draws.map((draw) => draw.mock.calls.length)).toEqual([
            0, 1, 1, 1, 1, 0, 0, 0, 0, 0,
        ]);
    });
});

describe("ScrollGroup stacking its rows", () => {
    function stacked(rows: number) {
        const page = new UiPage(
            { x: 400, y: 400 },
            { left: 0, top: 0, width: 1, height: 1 },
            { left: 0, top: 0, width: 400, height: 400 },
        );
        const list = new ScrollGroup([], LIST);
        list.row_height = 40;
        list.row_gap = 6;
        list.padding = 4;
        const buttons = Array.from({ length: rows }, (_, index) => {
            const button = new Button(`${index}`, {
                left: 0,
                top: 0,
                width: 0,
                height: 0,
            });
            list.add(button);
            return button;
        });
        page.add(list);
        return { page, list, buttons };
    }

    it("gives each row its place, as wide as the list leaves room", () => {
        const { list, buttons } = stacked(3);
        expect(list.content_height).toBe(4 + 3 * 40 + 2 * 6 + 4);
        expect(buttons[2].rect.top).toBe(4 + 2 * 46);
        expect(buttons[2].rect.left).toBe(4);
        expect(buttons[2].rect.height).toBe(40);
        expect(buttons[2].rect.width).toBe(200 - 2 * 4 - 10);
    });

    it("closes up when a row goes, and skips a hidden one", () => {
        const { list, buttons } = stacked(3);
        expect(buttons[1].rect.top).toBe(0);
        list.remove(buttons[0]);
        expect(list.content_height).toBe(4 + 2 * 40 + 6 + 4);
        expect(buttons[1].rect.top).toBe(4);
        buttons[1].is_visible = false;
        expect(list.content_height).toBe(4 + 40 + 4);
        expect(buttons[2].rect.top).toBe(4);
    });

    it("follows a new width and row height with no help", () => {
        const { list, buttons } = stacked(2);
        list.rect.width = 300;
        list.row_height = 60;
        expect(list.content_height).toBe(4 + 2 * 60 + 6 + 4);
        expect(buttons[1].rect.width).toBe(300 - 2 * 4 - 10);
        expect(buttons[1].rect.top).toBe(4 + 66);
    });

    it("hits a row where it is stacked, also when nothing asked for the layout first", () => {
        const { page, buttons } = stacked(3);
        // row 1 lies at 50 to 90 of the content, the list starts at 100 on the page
        expect(page.hit({ x: 150, y: 170 })[0]).toBe(buttons[1]);
    });

    it("scroll_to works on rows that weren't laid out yet", () => {
        const { list, buttons } = stacked(20);
        list.scroll_to(buttons[19]);
        expect(list.scroll).toBe(list.max_scroll);
    });

    it("leaves a child's own rect alone without a row height", () => {
        const { buttons, list } = setup(3);
        expect(list.row_height).toBeNull();
        expect(buttons[2].rect.top).toBe(2 * ROW_HEIGHT);
        expect(list.content_height).toBe(3 * ROW_HEIGHT);
    });

    it("clips with room for the widest border, so a row at the edge keeps it", () => {
        const { list } = stacked(2);
        for (const child of list.children) {
            child.theme_rules = theme_rules_from({ border_width: 3 });
            child.update_theme_instance();
        }
        const rects: number[][] = [];
        const context = new Proxy(
            {},
            {
                get:
                    (_, name) =>
                    (...args: number[]) => {
                        if (name === "rect") {
                            rects.push(args);
                        }
                    },
                set: () => true,
            },
        ) as unknown as CanvasRenderingContext2D;
        list.draw(context);
        expect(rects).toContainEqual([
            LIST.left - 3,
            LIST.top - 3,
            LIST.width + 6,
            LIST.height + 6,
        ]);
    });
});
