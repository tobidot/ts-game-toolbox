import { describe, expect, it } from "vitest";
import { Menu, MenuEntry } from "./Menu";

/** Top level: three to choose, the middle one with a submenu. */
function battle_menu(): Menu<string> {
    return new Menu<string>([
        { label: "Angriff", value: "attack" },
        {
            label: "Zauber",
            entries: [
                { label: "Feuer", value: "fire" },
                { label: "Eis", value: "ice" },
            ],
        },
        { label: "Abwehr", value: "guard" },
    ]);
}

function labels<T>(menu: Menu<T>): string[] {
    return menu.entries.map((entry) => entry.label);
}

describe("Menu", () => {
    describe("move", () => {
        it("wraps at both ends", () => {
            const menu = battle_menu();
            menu.move(-1);
            expect(menu.cursor).toBe(2);
            menu.move(1);
            expect(menu.cursor).toBe(0);
        });

        it("walks several steps, in either direction", () => {
            const menu = battle_menu();
            menu.move(2);
            expect(menu.cursor).toBe(2);
            menu.move(-4);
            expect(menu.cursor).toBe(1);
        });

        it("skips disabled entries, past the end too", () => {
            const menu = new Menu<number>([
                { label: "a", value: 1 },
                { label: "b", value: 2, disabled: true },
                { label: "c", value: 3 },
                { label: "d", value: 4, disabled: () => true },
            ]);
            menu.move(1);
            expect(menu.cursor).toBe(2);
            menu.move(1);
            expect(menu.cursor).toBe(0);
            menu.move(-1);
            expect(menu.cursor).toBe(2);
        });

        it("stays on the only enabled entry", () => {
            const menu = new Menu<number>([
                { label: "a", value: 1, disabled: true },
                { label: "b", value: 2 },
            ]);
            expect(menu.cursor).toBe(1);
            menu.move(1);
            expect(menu.cursor).toBe(1);
        });

        it("does nothing on a step of 0", () => {
            const menu = battle_menu();
            menu.move(0);
            expect(menu.cursor).toBe(0);
        });
    });

    describe("a level where all are disabled", () => {
        const all_disabled = (): MenuEntry<number>[] => [
            { label: "a", value: 1, disabled: true },
            { label: "b", value: 2, disabled: true },
        ];

        it("keeps the cursor still and confirms nothing", () => {
            const menu = new Menu<number>(all_disabled());
            expect(menu.cursor).toBe(0);
            menu.move(1);
            expect(menu.cursor).toBe(0);
            expect(menu.confirm()).toBeNull();
        });

        it("still opens as a submenu, so its hints can say why, and lets you back", () => {
            const menu = new Menu<number>([
                { label: "Beutel", entries: all_disabled() },
            ]);
            menu.confirm();
            expect(menu.path).toEqual(["Beutel"]);
            expect(labels(menu)).toEqual(["a", "b"]);
            expect(menu.back()).toBe(true);
            expect(menu.path).toEqual([]);
        });
    });

    describe("an empty level", () => {
        it("has no current entry and does nothing", () => {
            const menu = new Menu<number>([]);
            expect(menu.current).toBeNull();
            menu.move(1);
            menu.point_at(0);
            expect(menu.cursor).toBe(0);
            expect(menu.confirm()).toBeNull();
        });
    });

    describe("confirm", () => {
        it("returns the value of the entry under the cursor and stays open", () => {
            const menu = battle_menu();
            menu.move(2);
            expect(menu.confirm()).toBe("guard");
            expect(menu.cursor).toBe(2);
        });

        it("returns a falsy value as itself", () => {
            const menu = new Menu<number>([{ label: "Null", value: 0 }]);
            expect(menu.confirm()).toBe(0);
        });

        it("does nothing on a disabled entry, even with a submenu", () => {
            const menu = new Menu<string>([
                { label: "a", value: "a" },
                { label: "b", value: "b", disabled: true },
                {
                    label: "c",
                    disabled: true,
                    entries: [{ label: "d", value: "d" }],
                },
            ]);
            menu.point_at(1);
            expect(menu.confirm()).toBeNull();
            menu.point_at(2);
            expect(menu.confirm()).toBeNull();
            expect(menu.path).toEqual([]);
        });

        it("returns null for an entry with neither value nor submenu", () => {
            const menu = new Menu<string>([{ label: "Überschrift" }]);
            expect(menu.confirm()).toBeNull();
        });

        it("asks a disabled function again at every look", () => {
            let potions = 1;
            const menu = new Menu<string>([
                {
                    label: "Trank",
                    value: "potion",
                    disabled: () => potions === 0,
                },
            ]);
            expect(menu.confirm()).toBe("potion");
            potions = 0;
            expect(menu.confirm()).toBeNull();
        });
    });

    describe("submenus", () => {
        it("opens a submenu, with its labels and path", () => {
            const menu = battle_menu();
            menu.move(1);
            expect(menu.confirm()).toBeNull();
            expect(labels(menu)).toEqual(["Feuer", "Eis"]);
            expect(menu.path).toEqual(["Zauber"]);
            expect(menu.cursor).toBe(0);
        });

        it("starts a submenu on its first enabled entry", () => {
            const menu = new Menu<string>([
                {
                    label: "Beutel",
                    entries: [
                        { label: "Trank", value: "potion", disabled: true },
                        { label: "Bombe", value: "bomb" },
                    ],
                },
            ]);
            menu.confirm();
            expect(menu.cursor).toBe(1);
        });

        it("restores the cursor on the way back", () => {
            const menu = battle_menu();
            menu.move(1);
            menu.confirm();
            menu.move(1);
            expect(menu.back()).toBe(true);
            expect(menu.cursor).toBe(1);
            expect(labels(menu)[0]).toBe("Angriff");
        });

        it("opens a submenu afresh after leaving it", () => {
            const menu = battle_menu();
            menu.move(1);
            menu.confirm();
            menu.move(1);
            menu.back();
            menu.confirm();
            expect(menu.cursor).toBe(0);
        });

        it("nests deeper, and path follows", () => {
            const menu = new Menu<string>([
                {
                    label: "a",
                    entries: [
                        {
                            label: "b",
                            entries: [{ label: "c", value: "c" }],
                        },
                    ],
                },
            ]);
            menu.confirm();
            menu.confirm();
            expect(menu.path).toEqual(["a", "b"]);
            expect(menu.confirm()).toBe("c");
            menu.back();
            expect(menu.path).toEqual(["a"]);
        });

        it("back at the top returns false and moves nothing", () => {
            const menu = battle_menu();
            menu.move(1);
            expect(menu.back()).toBe(false);
            expect(menu.cursor).toBe(1);
        });
    });

    describe("point_at", () => {
        it("moves the cursor to the entry a pointer is over", () => {
            const menu = battle_menu();
            menu.point_at(2);
            expect(menu.cursor).toBe(2);
            expect(menu.current?.label).toBe("Abwehr");
        });

        it("ignores an index outside the level", () => {
            const menu = battle_menu();
            menu.point_at(1);
            menu.point_at(-1);
            menu.point_at(3);
            menu.point_at(0.5);
            expect(menu.cursor).toBe(1);
        });

        it("lands on a disabled entry, so a tap on it chooses nothing instead of the old entry", () => {
            const menu = new Menu<string>([
                { label: "a", value: "a" },
                { label: "b", value: "b", disabled: true },
            ]);
            menu.point_at(1);
            expect(menu.cursor).toBe(1);
            expect(menu.confirm()).toBeNull();
        });

        it("drives the same tree as the keys: point, confirm, point, confirm", () => {
            const menu = battle_menu();
            menu.point_at(1);
            menu.confirm();
            menu.point_at(1);
            expect(menu.confirm()).toBe("ice");
        });
    });

    describe("hints", () => {
        it("reads strings and functions, empty without one", () => {
            let mana = 8;
            const menu = new Menu<string>([
                {
                    label: "Feuer",
                    hint: () => (mana < 6 ? "Zu wenig Mana" : "6 Mana"),
                },
                { label: "Eis", hint: "6 Mana" },
                { label: "Abwehr" },
            ]);
            const [fire, ice, guard] = menu.entries;
            expect(menu.hint_of(fire)).toBe("6 Mana");
            mana = 0;
            expect(menu.hint_of(fire)).toBe("Zu wenig Mana");
            expect(menu.hint_of(ice)).toBe("6 Mana");
            expect(menu.hint_of(guard)).toBe("");
        });
    });

    describe("reset", () => {
        it("goes back to the top, on the first enabled entry", () => {
            const menu = new Menu<string>([
                { label: "x", value: "x", disabled: true },
                {
                    label: "Zauber",
                    entries: [{ label: "Feuer", value: "fire" }],
                },
                { label: "y", value: "y" },
            ]);
            menu.confirm();
            expect(menu.path).toEqual(["Zauber"]);
            menu.reset();
            expect(menu.path).toEqual([]);
            expect(menu.cursor).toBe(1);
        });
    });
});
