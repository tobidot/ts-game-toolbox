import { describe, expect, it, vi } from "vitest";
import { Menu, MenuEntry } from "../ui/menu/Menu";
import { MenuInput, MenuInputOptions } from "./MenuInput";

/** Anträge > Steuern > Hund, Katze; Vorgang; Ende. */
function tree(): MenuEntry<string>[] {
    return [
        {
            label: "Anträge",
            key: "a",
            entries: [
                {
                    label: "Steuern",
                    key: "s",
                    entries: [
                        { label: "Hund", value: "hund", key: "h" },
                        { label: "Katze", value: "katze", key: "k" },
                        { label: "Zurück", back: true },
                    ],
                },
                { label: "Baum", value: "baum", key: "b" },
            ],
        },
        { label: "Vorgang", value: "vorgang", key: "v" },
        { label: "Ende", value: "ende", key: "e" },
    ];
}

function setup(options?: MenuInputOptions, entries = tree()) {
    const menu = new Menu<string>(entries);
    const input = new MenuInput(menu, options);
    return { menu, input };
}

/** Presses each of `keys`, in order. */
function type(input: MenuInput<string>, ...keys: string[]): void {
    for (const key of keys) {
        input.handle_key(key);
    }
}

describe("MenuInput", () => {
    describe("keys", () => {
        it("moves with Up and Down, opens with Enter and goes back with Escape", () => {
            const { menu, input } = setup();
            type(input, "ArrowDown");
            expect(menu.cursor).toBe(1);
            type(input, "ArrowUp", "Enter");
            expect(menu.path).toEqual(["Anträge"]);
            type(input, "Escape");
            expect(menu.path).toEqual([]);
        });

        it("opens with Right, but Right on an entry with a value does nothing", () => {
            const { menu, input } = setup();
            type(input, "ArrowRight");
            expect(menu.path).toEqual(["Anträge"]);
            type(input, "ArrowDown", "ArrowRight");
            expect(menu.path).toEqual(["Anträge"]);
            expect(input.choices()).toEqual([]);
        });

        it("goes back with Left, and space confirms like Enter", () => {
            const { menu, input } = setup();
            type(input, " ");
            expect(menu.path).toEqual(["Anträge"]);
            type(input, "ArrowLeft");
            expect(menu.path).toEqual([]);
        });

        it("picks an entry by its letter, on the open level only", () => {
            const { menu, input } = setup();
            type(input, "H");
            expect(menu.path).toEqual([]);
            expect(input.dropped_presses).toBe(0);
            type(input, "a", "S", "k");
            expect(input.last_choice).toBe("katze");
        });

        it("doesn't hear a letter in a tree without any", () => {
            const { input } = setup({ buffer_seconds: 1 }, [
                { label: "Eins", value: "1" },
            ]);
            input.is_held = true;
            type(input, "x");
            expect(input.waiting_presses).toBe(0);
            expect(input.dropped_presses).toBe(0);
        });

        it("repeats only Up and Down while a key is held", () => {
            const { menu, input } = setup();
            input.handle_key("ArrowDown", true);
            expect(menu.cursor).toBe(1);
            input.handle_key("ArrowUp");
            input.handle_key("Enter", true);
            expect(menu.path).toEqual([]);
        });

        it("ignores a key that means nothing", () => {
            const { menu, input } = setup();
            input.is_held = true;
            type(input, "F5", "Tab");
            input.is_held = false;
            expect(input.waiting_presses).toBe(0);
            expect(menu.cursor).toBe(0);
        });
    });

    describe("choices, like a frame of KeyboardState", () => {
        it("collects final choices in order until end_frame()", () => {
            const { input } = setup();
            type(input, "ArrowDown", "Enter", "ArrowDown", "Enter");
            expect(input.choices()).toEqual(["vorgang", "ende"]);
            expect(input.last_choice).toBe("ende");
            input.end_frame();
            expect(input.choices()).toEqual([]);
            expect(input.last_choice).toBeNull();
        });

        it("calls on_choice inside the press", () => {
            const { input } = setup();
            const chosen = vi.fn();
            input.on_choice = chosen;
            type(input, "ArrowDown", "Enter");
            expect(chosen).toHaveBeenCalledExactlyOnceWith("vorgang");
        });

        it("tells on_change about the cursor and the level, not about nothing", () => {
            const { input } = setup();
            const changed = vi.fn();
            input.on_change = changed;
            type(input, "ArrowUp");
            expect(changed).toHaveBeenCalledTimes(1);
            type(input, "ArrowDown", "Enter");
            expect(changed).toHaveBeenCalledTimes(3);
            type(input, "Escape", "Escape");
            expect(changed).toHaveBeenCalledTimes(4);
        });

        it("a value of 0 is a choice", () => {
            const menu = new Menu<number>([{ label: "Null", value: 0 }]);
            const input = new MenuInput(menu);
            input.handle_key("Enter");
            expect(input.choices()).toEqual([0]);
            expect(input.last_choice).toBe(0);
        });
    });

    describe("a disabled entry", () => {
        const entries = (): MenuEntry<string>[] => [
            { label: "a", value: "a", disabled: true, hint: "Noch nicht" },
            {
                label: "b",
                disabled: true,
                entries: [{ label: "c", value: "c" }],
            },
            { label: "d", value: "d" },
        ];

        it("says it was refused, by press, and chooses nothing", () => {
            const { input } = setup({}, entries());
            input.handle_press(0, 0);
            expect(input.last_refused?.label).toBe("a");
            expect(input.choices()).toEqual([]);
            expect(input.refusals).toBe(1);
            input.end_frame();
            expect(input.last_refused).toBeNull();
            expect(input.refusals).toBe(1);
        });

        it("refuses Right on a disabled submenu, and its letter", () => {
            const { menu, input } = setup({}, [
                {
                    label: "b",
                    key: "b",
                    disabled: true,
                    entries: [{ label: "c", value: "c" }],
                },
                { label: "d", value: "d" },
            ]);
            menu.point_at(0);
            type(input, "ArrowRight");
            expect(input.last_refused?.label).toBe("b");
            expect(menu.path).toEqual([]);
            input.end_frame();
            type(input, "b");
            expect(input.last_refused?.label).toBe("b");
        });
    });

    describe("the pointer", () => {
        it("moves the cursor by hover, disabled entries too", () => {
            const { menu, input } = setup();
            input.handle_hover(0, 2);
            expect(menu.cursor).toBe(2);
        });

        it("doesn't move anything by hovering a parent", () => {
            const { menu, input } = setup();
            type(input, "Enter", "ArrowDown");
            input.handle_hover(0, 2);
            expect(menu.path).toEqual(["Anträge"]);
            expect(menu.cursor).toBe(1);
        });

        it("presses directly, with no hover before it", () => {
            const { input } = setup();
            input.handle_press(0, 1);
            expect(input.last_choice).toBe("vorgang");
        });

        it("goes back to a parent by a press on it", () => {
            const { menu, input } = setup();
            type(input, "Enter", "Enter");
            expect(menu.path).toEqual(["Anträge", "Steuern"]);
            input.handle_press(1, 0);
            expect(menu.path).toEqual(["Anträge"]);
            expect(input.choices()).toEqual([]);
        });

        it("goes back and confirms another entry of a parent", () => {
            const { menu, input } = setup();
            type(input, "Enter", "Enter");
            input.handle_press(1, 1);
            expect(menu.path).toEqual(["Anträge"]);
            expect(input.last_choice).toBe("baum");
        });

        it("ignores a level or an entry that isn't there", () => {
            const { menu, input } = setup();
            input.handle_press(3, 0);
            input.handle_press(0, 9);
            expect(menu.cursor).toBe(0);
            expect(input.choices()).toEqual([]);
        });
    });

    describe("while held", () => {
        it("moves nothing, and replays in order when the hold ends", () => {
            const { menu, input } = setup();
            input.is_held = true;
            type(input, "ArrowDown", "ArrowDown", "Enter");
            expect(menu.cursor).toBe(0);
            expect(input.waiting_presses).toBe(3);
            input.update(0.1);
            expect(menu.cursor).toBe(0);
            input.is_held = false;
            input.update(0.1);
            expect(input.last_choice).toBe("ende");
        });

        it("replays a press that opens a submenu and starts the next wait", () => {
            const { menu, input } = setup();
            input.on_change = () => {
                if (menu.path.length > 0) {
                    input.is_held = true;
                }
            };
            input.is_held = true;
            type(input, "Enter", "ArrowDown", "Enter");
            input.is_held = false;
            input.update(0.1);
            expect(menu.path).toEqual(["Anträge"]);
            expect(menu.cursor).toBe(0);
            expect(input.waiting_presses).toBe(2);
            expect(input.is_held).toBe(true);
            input.on_change = null;
            input.is_held = false;
            input.update(0.1);
            expect(input.last_choice).toBe("baum");
        });

        it("stops the replay at a choice, so a game reading choices() can hold first", () => {
            const { input } = setup();
            input.is_held = true;
            type(input, "ArrowDown", "Enter", "ArrowDown", "Enter");
            input.is_held = false;
            input.update(0.1);
            expect(input.choices()).toEqual(["vorgang"]);
            expect(input.waiting_presses).toBe(2);
            input.end_frame();
            input.update(0.1);
            expect(input.choices()).toEqual(["ende"]);
        });

        it("keeps the order for a press coming in right after the hold, before the frame", () => {
            const { menu, input } = setup();
            input.is_held = true;
            type(input, "ArrowDown");
            input.is_held = false;
            type(input, "ArrowDown");
            expect(menu.cursor).toBe(2);
        });

        it("waits for a pointer press too, and the pointer's last place counts afterwards", () => {
            const { menu, input } = setup();
            input.is_held = true;
            input.handle_press(0, 1);
            input.handle_hover(0, 2);
            expect(menu.cursor).toBe(0);
            input.is_held = false;
            input.update(0.1);
            expect(input.last_choice).toBe("vorgang");
            input.update(0.1);
            expect(menu.cursor).toBe(2);
        });

        it("drops a press at once with no buffer", () => {
            const { menu, input } = setup({ buffer_seconds: 0 });
            input.is_held = true;
            type(input, "ArrowDown", "Enter");
            expect(input.waiting_presses).toBe(0);
            expect(input.dropped_presses).toBe(2);
            input.is_held = false;
            input.update(0.1);
            expect(menu.cursor).toBe(0);
            expect(input.choices()).toEqual([]);
        });

        it("drops all of what waits when the first runs out of time: no holes", () => {
            const { menu, input } = setup({ buffer_seconds: 0.3 });
            input.is_held = true;
            type(input, "ArrowDown");
            input.update(0.2);
            type(input, "Enter");
            input.update(0.11);
            expect(input.waiting_presses).toBe(0);
            expect(input.dropped_presses).toBe(2);
            input.is_held = false;
            input.update(0.1);
            expect(menu.cursor).toBe(0);
            expect(input.choices()).toEqual([]);
        });

        it("drops what doesn't fit, and keeps what came first", () => {
            const { menu, input } = setup({ buffer_size: 1 });
            input.is_held = true;
            type(input, "ArrowDown", "ArrowDown", "Enter");
            expect(input.dropped_presses).toBe(2);
            input.is_held = false;
            input.update(0.1);
            expect(menu.cursor).toBe(1);
            expect(input.choices()).toEqual([]);
        });

        it("drops what comes after a refused press", () => {
            const entries: MenuEntry<string>[] = [
                { label: "a", value: "a", disabled: true },
                { label: "b", value: "b" },
            ];
            const { menu, input } = setup({}, entries);
            menu.point_at(0);
            input.is_held = true;
            type(input, "Enter", "ArrowDown", "Enter");
            input.is_held = false;
            input.update(0.1);
            expect(input.last_refused?.label).toBe("a");
            expect(input.choices()).toEqual([]);
            expect(input.dropped_presses).toBe(2);
            expect(input.waiting_presses).toBe(0);
        });

        it("drops what waits when the tree changes, and counts it", () => {
            const { menu, input } = setup();
            input.is_held = true;
            type(input, "ArrowDown", "Enter");
            menu.set_entries(tree());
            input.is_held = false;
            input.update(0.1);
            expect(input.dropped_presses).toBe(2);
            expect(menu.cursor).toBe(0);
            expect(input.choices()).toEqual([]);
        });

        it("keeps a wait through a reset: the next case is typed ahead", () => {
            const { menu, input } = setup();
            input.is_held = true;
            type(input, "ArrowDown", "Enter");
            menu.reset();
            input.is_held = false;
            input.update(0.1);
            expect(input.last_choice).toBe("vorgang");
        });
    });

    describe("is_enabled and clear", () => {
        it("takes nothing while off, and forgets what waited", () => {
            const { menu, input } = setup();
            input.is_held = true;
            type(input, "Enter");
            input.is_enabled = false;
            expect(input.waiting_presses).toBe(0);
            input.is_held = false;
            type(input, "ArrowDown");
            input.handle_press(0, 1);
            input.handle_hover(0, 2);
            expect(menu.cursor).toBe(0);
            expect(input.dropped_presses).toBe(0);
            input.is_enabled = true;
            type(input, "ArrowDown");
            expect(menu.cursor).toBe(1);
        });

        it("clear() forgets without counting a drop", () => {
            const { input } = setup();
            input.is_held = true;
            type(input, "Enter");
            input.clear();
            expect(input.waiting_presses).toBe(0);
            expect(input.dropped_presses).toBe(0);
        });
    });

    describe("attach", () => {
        const key_event = (key: string, init: KeyboardEventInit = {}) =>
            new KeyboardEvent("keydown", { key, cancelable: true, ...init });

        it("hears keys on the target, and stops at detach()", () => {
            const { menu, input } = setup();
            const target = document.createElement("div");
            input.attach(target);
            const down = key_event("ArrowDown");
            target.dispatchEvent(down);
            expect(menu.cursor).toBe(1);
            expect(down.defaultPrevented).toBe(true);
            input.detach();
            target.dispatchEvent(key_event("ArrowDown"));
            expect(menu.cursor).toBe(1);
        });

        it("stops when the signal aborts, and doesn't hear shortcuts or repeats of Enter", () => {
            const { menu, input } = setup();
            const target = document.createElement("div");
            const controller = new AbortController();
            input.attach(target, controller.signal);
            target.dispatchEvent(key_event("ArrowDown", { ctrlKey: true }));
            expect(menu.cursor).toBe(0);
            const repeat = key_event("Enter", { repeat: true });
            target.dispatchEvent(repeat);
            expect(menu.path).toEqual([]);
            expect(repeat.defaultPrevented).toBe(false);
            controller.abort();
            target.dispatchEvent(key_event("ArrowDown"));
            expect(menu.cursor).toBe(0);
        });
    });
});
