import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
    default_theme,
    hex_color,
} from "../../game-element/CanvasGameProperties";
import {
    CanvasGameSettings,
    HOUSE_COLORS,
} from "../../game-element/CanvasGameSettings";
import { MenuInput } from "../../input/MenuInput";
import { Menu, MenuEntry } from "../menu/Menu";
import { set_theme_clock } from "../theme/ThemeClock";
import { theme_rules_from } from "../theme/ThemeRuleBuilder";
import { UiManager } from "../UiManager";
import { UiPage } from "../UiPage";
import {
    MenuHint,
    MenuPath,
    MenuRow,
    MenuView,
    MenuViewOptions,
} from "./MenuView";

const VIEW = { left: 100, top: 100, width: 300, height: 300 };
const ROW = 40;
const GAP = 2;
const PAD = 4;
const SILVER = hex_color("#c0c0c0");
const NAVY = hex_color("#000080");

/** A context that draws nothing, with a measure. */
function fake_context(): CanvasRenderingContext2D {
    const state: Record<string | symbol, unknown> = {
        canvas: { width: 800, height: 800 },
    };
    return new Proxy(state, {
        get: (target, name) => {
            if (name in target) {
                return target[name];
            }
            if (name === "measureText") {
                return (text: string) => ({ width: text.length * 10 });
            }
            return () => undefined;
        },
        set: (target, name, value) => {
            target[name] = value;
            return true;
        },
    }) as unknown as CanvasRenderingContext2D;
}

function tree(): MenuEntry<string>[] {
    return [
        {
            label: "Steuern",
            hint: "Was das Amt nimmt",
            entries: [
                { label: "Hund", value: "hund", hint: "Pro Hund" },
                { label: "Zurück", back: true },
            ],
        },
        { label: "Ausweis", value: "ausweis", hint: "Prüfen" },
        { label: "Ende", value: "ende" },
    ];
}

function setup(
    entries: MenuEntry<string>[] = tree(),
    options: MenuViewOptions<string> = {},
    rect = VIEW,
) {
    const menu = new Menu<string>(entries, { stops_on_disabled: true });
    const input = new MenuInput(menu);
    const view = new MenuView(input, rect, options);
    const page = new UiPage(
        { x: 800, y: 800 },
        { left: 0, top: 0, width: 1, height: 1 },
        { left: 0, top: 0, width: 800, height: 800 },
        true,
        default_theme(new CanvasGameSettings()),
    );
    page.add(view);
    const ui = new UiManager();
    ui.active_menu = page;
    return { menu, input, view, page, ui };
}

function rows_of<T>(view: MenuView<T>): MenuRow<T>[] {
    return view.list.children as MenuRow<T>[];
}

/** The middle of row `index`, on the page, with the list not scrolled. */
function row_point(index: number, rect = VIEW) {
    return {
        x: rect.left + rect.width / 2,
        y: rect.top + PAD + index * (ROW + GAP) + ROW / 2,
    };
}

function tap(ui: UiManager, point: { x: number; y: number }): void {
    ui.pointer_down(point);
    ui.pointer_up(point);
}

describe("MenuView", () => {
    describe("with no thought at all", () => {
        it("shows a row per entry of the open level, the cursor's selected", () => {
            const { view } = setup();
            const rows = rows_of(view);
            expect(rows.map((row) => row.entry.label)).toEqual([
                "Steuern",
                "Ausweis",
                "Ende",
            ]);
            expect(rows.map((row) => row.is_selected)).toEqual([
                true,
                false,
                false,
            ]);
        });

        it("follows the menu with nobody telling it, a level too", () => {
            const { view, input, page } = setup();
            input.handle_key("ArrowDown");
            page.draw(fake_context());
            expect(rows_of(view)[1].is_selected).toBe(true);
            input.handle_key("ArrowUp");
            input.handle_key("Enter");
            page.draw(fake_context());
            expect(rows_of(view).map((row) => row.entry.label)).toEqual([
                "Hund",
                "Zurück",
            ]);
        });

        it("reads when it is hit, so a press lands on what is there now", () => {
            const { ui, input } = setup();
            input.handle_key("Enter");
            tap(ui, row_point(0));
            expect(input.last_choice).toBe("hund");
        });

        it("gives the rows their classes", () => {
            const { view, input, page } = setup();
            expect(rows_of(view)[0].class).toBe("submenu");
            expect(rows_of(view)[1].class).toBeNull();
            input.handle_key("Enter");
            page.draw(fake_context());
            expect(rows_of(view)[1].class).toBe("back");
        });

        it("has its parts in their own types, and the house look on them", () => {
            const { view } = setup([], { show_path: true });
            expect(view.type).toBe("menu");
            expect(view.hint?.type).toBe("menu-hint");
            expect(view.path?.type).toBe("menu-path");
            const colors = HOUSE_COLORS;
            expect(
                view.theme.background_color.equals(hex_color(colors.card)),
            ).toBe(true);
        });

        it("fades the cursor from row to row through the house rules", () => {
            const { view, input, page } = setup();
            let now = 0;
            set_theme_clock(() => now);
            page.draw(fake_context());
            const [first, second] = rows_of(view);
            const turquoise = hex_color(HOUSE_COLORS.turquoise);
            expect(first.theme.background_color.equals(turquoise)).toBe(true);
            input.handle_key("ArrowDown");
            page.poll_animation();
            now += 0.05;
            const leaving = first.theme.background_color;
            const reaching = second.theme.background_color;
            expect(leaving.equals(turquoise)).toBe(false);
            expect(leaving.a).toBeGreaterThan(0);
            expect(reaching.equals(turquoise)).toBe(false);
            expect(reaching.a).toBeGreaterThan(0);
            now += 1;
            expect(second.theme.background_color.equals(turquoise)).toBe(true);
            set_theme_clock(null);
        });
    });

    describe("the pointer", () => {
        it("moves the cursor by hover", () => {
            const { ui, menu } = setup();
            ui.pointer_move(row_point(2));
            expect(menu.cursor).toBe(2);
        });

        it("presses directly with a tap, a phone needs no second one", () => {
            const { ui, input, menu } = setup();
            tap(ui, row_point(1));
            expect(input.last_choice).toBe("ausweis");
            expect(menu.cursor).toBe(1);
        });

        it("opens a submenu with one tap", () => {
            const { ui, menu } = setup();
            tap(ui, row_point(0));
            expect(menu.path).toEqual(["Steuern"]);
        });

        it("makes a tap wait while the input is held", () => {
            const { ui, input, menu } = setup();
            input.is_held = true;
            tap(ui, row_point(1));
            expect(input.waiting_presses).toBe(1);
            expect(menu.cursor).toBe(0);
            input.is_held = false;
            input.update(0);
            expect(input.last_choice).toBe("ausweis");
        });

        it("goes back with a tap on the back row", () => {
            const { ui, input, menu, page } = setup();
            input.handle_key("Enter");
            page.draw(fake_context());
            tap(ui, row_point(1));
            expect(menu.path).toEqual([]);
        });
    });

    describe("disabled rows", () => {
        const with_reason = (reason: { text: string | null }) => [
            {
                label: "Neu",
                value: "neu",
                disabled: () => reason.text !== null,
                hint: () => reason.text ?? "Kann los",
            },
            { label: "Ende", value: "ende" },
        ];

        it("are dimmed and still pressable, so last_refused can say why", () => {
            const reason = { text: "Ausweis fehlt" as string | null };
            const { ui, input, view, page } = setup(with_reason(reason));
            page.draw(fake_context());
            expect(rows_of(view)[0].is_disabled).toBe(true);
            tap(ui, row_point(0));
            expect(input.last_refused?.label).toBe("Neu");
            expect(input.choices()).toEqual([]);
        });

        it("show a refused press, by pointer and by key, through the state", () => {
            const reason = { text: "Ausweis fehlt" as string | null };
            const { ui, input, view, page } = setup(with_reason(reason));
            let now = 0;
            set_theme_clock(() => now);
            page.draw(fake_context());
            tap(ui, row_point(0));
            page.draw(fake_context());
            expect(rows_of(view)[0].state).toBe("refused");
            now = 1;
            page.poll_animation();
            expect(rows_of(view)[0].state).toBe("disabled_selected");
            input.handle_key("Enter");
            page.poll_animation();
            expect(rows_of(view)[0].state).toBe("refused");
            set_theme_clock(null);
        });

        it("change while the menu is open, and a still game hears of it", () => {
            const reason = { text: "Ausweis fehlt" as string | null };
            const { view, page } = setup(with_reason(reason));
            const context = fake_context();
            page.draw(context);
            expect(page.poll_animation()).toBe(false);
            reason.text = null;
            expect(page.poll_animation()).toBe(true);
            expect(rows_of(view)[0].is_disabled).toBe(false);
            expect(view.hint?.text).toBe("Kann los");
        });

        it("keep a cursor you can see: a state of its own, and :disabled still holds", () => {
            const rules = theme_rules_from([
                ["menu-row:disabled", { text_color: SILVER }],
                ["menu-row:disabled_selected", { background_color: NAVY }],
            ]);
            const { view } = setup(
                [
                    { label: "a", disabled: true },
                    { label: "b", disabled: true },
                ],
                { style: rules },
            );
            const [on_it, other] = rows_of(view);
            expect(on_it.state).toBe("disabled_selected");
            expect(other.state).toBe("disabled");
            expect(on_it.theme.text_color.equals(SILVER)).toBe(true);
            expect(on_it.theme.background_color.equals(NAVY)).toBe(true);
            expect(other.theme.background_color.equals(NAVY)).toBe(false);
        });
    });

    describe("the hint and the path", () => {
        it("shows the hint of the cursor's entry", () => {
            const { view, input, page } = setup();
            page.draw(fake_context());
            expect(view.hint?.text).toBe("Was das Amt nimmt");
            input.handle_key("ArrowDown");
            page.draw(fake_context());
            expect(view.hint?.text).toBe("Prüfen");
        });

        it("shows what it was told while held, in a class of its own", () => {
            const { view, input, page } = setup(tree(), {
                held_text: "Bitte warten…",
            });
            input.is_held = true;
            page.draw(fake_context());
            expect(view.hint?.text).toBe("Bitte warten…");
            expect(view.hint?.class).toBe("held");
            expect(view.class).toBe("held");
            input.is_held = false;
            page.draw(fake_context());
            expect(view.hint?.text).toBe("Was das Amt nimmt");
            expect(view.hint?.class).toBeNull();
        });

        it("keeps the hint while held with no such text", () => {
            const { view, input, page } = setup();
            input.is_held = true;
            page.draw(fake_context());
            expect(view.hint?.text).toBe("Was das Amt nimmt");
        });

        it("can do without both", () => {
            const { view } = setup(tree(), { show_hint: false });
            expect(view.hint).toBeNull();
            expect(view.path).toBeNull();
            expect(view.list.rect.top).toBe(0);
            expect(view.list.rect.height).toBe(VIEW.height);
        });

        it("shows the path above the rows, and the rows move down for it", () => {
            const { view, input, page } = setup(tree(), { show_path: true });
            input.handle_key("Enter");
            page.draw(fake_context());
            expect(view.path?.text).toBe("Steuern");
            expect(view.list.rect.top).toBe(ROW);
            expect(view.list.rect.height).toBe(VIEW.height - 2 * ROW);
        });

        it("stand on their own too, for a game with one status line", () => {
            const menu = new Menu<string>(tree());
            const input = new MenuInput(menu);
            const hint = new MenuHint(input, VIEW, "Warten");
            const path = new MenuPath(input, VIEW);
            input.handle_key("Enter");
            hint.draw(fake_context());
            path.draw(fake_context());
            expect(hint.text).toBe("Pro Hund");
            expect(path.text).toBe("Steuern");
            input.is_held = true;
            expect(hint.poll_animation()).toBe(true);
            expect(hint.text).toBe("Warten");
        });
    });

    describe("rows and columns", () => {
        it("makes the key letter and the mark columns of the row", () => {
            const { view, page } = setup([
                {
                    label: "Steuern",
                    key: "s",
                    entries: [{ label: "x", value: "x" }],
                },
                { label: "Ende", value: "e" },
            ]);
            page.draw(fake_context());
            const [first, second] = rows_of(view);
            expect(first.columns?.map((column) => column.text)).toEqual([
                "S",
                "Steuern",
                "›",
            ]);
            expect(second.columns?.map((column) => column.text)).toEqual([
                "",
                "Ende",
                "",
            ]);
            const total = first.columns?.reduce(
                (sum, column) => sum + column.share,
                0,
            );
            expect(total).toBeCloseTo(1);
        });

        it("has no key column on a level with no letters, and marks the back row", () => {
            const { view, input, page } = setup(tree(), {
                submenu_mark: ">",
            });
            page.draw(fake_context());
            expect(rows_of(view)[0].columns?.map((c) => c.text)).toEqual([
                "Steuern",
                ">",
            ]);
            input.handle_key("Enter");
            page.draw(fake_context());
            expect(rows_of(view)[1].columns?.[0].text).toBe("‹ Zurück");
        });

        it("ends a label too long for its row in an ellipsis", () => {
            const { view } = setup();
            expect(rows_of(view)[0].text_overflow).toBe("ellipsis");
        });

        it("uses what a game makes with create_row", () => {
            class StarRow extends MenuRow<string> {}
            const { view } = setup(tree(), {
                create_row: (entry, index) => new StarRow(entry, index),
            });
            expect(rows_of(view)[0]).toBeInstanceOf(StarRow);
        });

        it("takes row_height, row_gap and padding", () => {
            const { view, page } = setup(tree(), {
                row_height: 20,
                row_gap: 5,
                padding: 7,
            });
            page.draw(fake_context());
            const [, second] = rows_of(view);
            expect(second.rect.top).toBe(7 + 20 + 5);
            expect(second.rect.height).toBe(20);
            expect(second.rect.left).toBe(7);
            expect(second.rect.width).toBe(VIEW.width - 14);
        });
    });

    describe("too many rows", () => {
        const many = (): MenuEntry<string>[] =>
            Array.from({ length: 30 }, (_, index) => ({
                label: `Formular ${index}`,
                value: `${index}`,
            }));

        it("scrolls to follow the cursor", () => {
            const { view, input, page } = setup(many());
            page.draw(fake_context());
            expect(view.list.scroll).toBe(0);
            for (let press = 0; press < 20; press++) {
                input.handle_key("ArrowDown");
            }
            page.draw(fake_context());
            const row = rows_of(view)[20];
            expect(row.rect.top).toBeGreaterThanOrEqual(view.list.scroll);
            expect(row.rect.top + row.rect.height).toBeLessThanOrEqual(
                view.list.scroll + view.list.rect.height,
            );
        });

        it("doesn't press on a drag, scrolls, and a shaky tap stays a tap", () => {
            const { view, ui, input, menu } = setup(many());
            const from = row_point(3);
            ui.pointer_down(from);
            ui.pointer_move({ x: from.x + 2, y: from.y + 2 });
            ui.pointer_up({ x: from.x + 2, y: from.y + 2 });
            expect(input.last_choice).toBe("3");
            input.end_frame();
            ui.pointer_down(from);
            expect(menu.cursor).toBe(3);
            ui.pointer_move({ x: from.x, y: from.y - 30 });
            ui.pointer_move({ x: from.x, y: from.y - 60 });
            ui.pointer_up({ x: from.x, y: from.y - 60 });
            expect(input.choices()).toEqual([]);
            expect(view.list.scroll).toBeGreaterThan(0);
        });

        it("a finger scrolling doesn't move the cursor", () => {
            const { ui, menu } = setup(many());
            const from = row_point(3);
            ui.pointer_down(from);
            ui.pointer_move({ x: from.x, y: from.y - 60 });
            ui.pointer_move({ x: from.x, y: from.y - 80 });
            ui.pointer_up({ x: from.x, y: from.y - 80 });
            expect(menu.cursor).toBe(0);
        });

        it("takes the wheel", () => {
            const { view, ui } = setup(many());
            expect(ui.wheel(row_point(2), 50)).toBe(true);
            expect(view.list.scroll).toBe(50);
        });

        it("doesn't take the wheel from the page with nothing to scroll", () => {
            const { ui } = setup();
            expect(ui.wheel(row_point(1), 50)).toBe(false);
        });

        it("starts a new level at the top", () => {
            const entries: MenuEntry<string>[] = [
                { label: "a", entries: many() },
                ...many(),
            ];
            const { view, input, page } = setup(entries);
            for (let press = 0; press < 25; press++) {
                input.handle_key("ArrowDown");
            }
            page.draw(fake_context());
            expect(view.list.scroll).toBeGreaterThan(0);
            input.handle_key("ArrowDown");
            input.handle_key("ArrowDown");
            input.handle_key("ArrowDown");
            input.handle_key("ArrowDown");
            input.handle_key("ArrowDown");
            input.handle_key("ArrowDown");
            input.handle_key("Enter");
            page.draw(fake_context());
            expect(view.list.scroll).toBe(0);
        });
    });

    describe("level", () => {
        function cascade() {
            const menu = new Menu<string>(tree());
            const input = new MenuInput(menu);
            const page = new UiPage(
                { x: 800, y: 800 },
                { left: 0, top: 0, width: 1, height: 1 },
                { left: 0, top: 0, width: 800, height: 800 },
            );
            const views = [0, 1].map(
                (level) =>
                    new MenuView(
                        input,
                        { left: 300 * level, top: 0, width: 300, height: 300 },
                        { level, show_hint: false },
                    ),
            );
            views.forEach((view) => page.add(view));
            const ui = new UiManager();
            ui.active_menu = page;
            return { menu, input, page, views, ui };
        }

        it("shows that level, and hides while it isn't open", () => {
            const { views, input, page } = cascade();
            page.draw(fake_context());
            expect(views[1].is_visible).toBe(false);
            input.handle_key("Enter");
            page.draw(fake_context());
            expect(views[1].is_visible).toBe(true);
            expect(rows_of(views[0])[0].entry.label).toBe("Steuern");
            expect(rows_of(views[1])[0].entry.label).toBe("Hund");
            input.handle_key("Escape");
            page.draw(fake_context());
            expect(views[1].is_visible).toBe(false);
        });

        it("repaints in a still game when a level opens or closes", () => {
            const { input, page } = cascade();
            const context = fake_context();
            page.draw(context);
            expect(page.poll_animation()).toBe(false);
            input.handle_key("Enter");
            expect(page.poll_animation()).toBe(true);
        });

        it("goes back to a parent by a press on its open row, one level up", () => {
            const { menu, input, page, ui } = cascade();
            input.handle_key("Enter");
            page.draw(fake_context());
            tap(ui, { x: 150, y: PAD + ROW / 2 });
            expect(menu.path).toEqual([]);
        });

        it("presses another row of a parent, and doesn't move on its hover", () => {
            const { menu, input, page, ui } = cascade();
            input.handle_key("Enter");
            page.draw(fake_context());
            const other = { x: 150, y: PAD + (ROW + GAP) + ROW / 2 };
            ui.pointer_move(other);
            expect(menu.path).toEqual(["Steuern"]);
            tap(ui, other);
            expect(menu.path).toEqual([]);
            expect(input.last_choice).toBe("ausweis");
        });

        it("shows the refusal on the open level only", () => {
            const entries: MenuEntry<string>[] = [
                {
                    label: "a",
                    entries: [{ label: "b", disabled: true }],
                },
            ];
            const menu = new Menu<string>(entries, {
                stops_on_disabled: true,
            });
            const input = new MenuInput(menu);
            const views = [0, 1].map(
                (level) => new MenuView(input, VIEW, { level }),
            );
            input.handle_key("Enter");
            input.handle_key("Enter");
            views.forEach((view) => view.poll_animation());
            expect(rows_of(views[1])[0].is_refused).toBe(true);
            expect(rows_of(views[0])[0].is_refused).toBe(false);
        });
    });

    describe("moving by the rules", () => {
        let now = 0;

        beforeEach(() => {
            now = 0;
            set_theme_clock(() => now);
        });

        afterEach(() => {
            set_theme_clock(null);
        });

        it("is entering for a moment when its level appears, and not at the very start", () => {
            const menu = new Menu<string>([
                { label: "A", entries: [{ label: "B", value: "b" }] },
            ]);
            const input = new MenuInput(menu);
            const view = new MenuView(
                input,
                { left: 0, top: 0, width: 200, height: 300 },
                { level: 1 },
            );
            const first = new MenuView(
                input,
                { left: 0, top: 0, width: 200, height: 300 },
                { level: 0 },
            );
            view.poll_animation();
            first.poll_animation();
            expect(first.state).toBe(null);
            input.handle_key("Enter");
            view.poll_animation();
            expect(view.is_visible).toBe(true);
            expect(view.state).toBe("entering");
        });

        it("is entering for a moment when another level shows in it", () => {
            const { view, input, page } = setup();
            page.draw(fake_context());
            expect(view.state).toBe(null);
            input.handle_key("Enter");
            page.draw(fake_context());
            expect(view.state).toBe("entering");
            now = 1;
            page.poll_animation();
            expect(view.state).toBe(null);
        });

        it("takes a style's snapping: no transition at all", () => {
            const { view, input, page } = setup(tree(), {
                style: theme_rules_from([
                    ["menu-row", { transition_seconds: 0 }],
                    ["menu-row:selected", { background_color: NAVY }],
                ]),
            });
            page.draw(fake_context());
            input.handle_key("ArrowDown");
            page.draw(fake_context());
            expect(rows_of(view)[1].theme.background_color.equals(NAVY)).toBe(
                true,
            );
            expect(rows_of(view)[0].theme.background_color.equals(NAVY)).toBe(
                false,
            );
        });

        it("a refused row shakes through the house rules", () => {
            const { view, ui, page } = setup([
                { label: "a", value: "a", disabled: true },
            ]);
            page.draw(fake_context());
            tap(ui, row_point(0));
            page.draw(fake_context());
            now = 0.1;
            const statement = rows_of(view)[0].theme.transform?.statements[0];
            expect(statement?.type).toBe("translate");
        });
    });

    it("doesn't show a refusal from before its level appeared", () => {
        const menu = new Menu<string>([
            { label: "No", value: "n", disabled: true },
            { label: "A", entries: [{ label: "B", value: "b" }] },
        ]);
        const input = new MenuInput(menu);
        const rect = { left: 0, top: 0, width: 200, height: 300 };
        const view = new MenuView(input, rect, { level: 1 });
        input.handle_press(0, 0);
        expect(input.refusals).toBe(1);
        view.poll_animation();
        input.handle_press(0, 1);
        view.poll_animation();
        expect(view.is_visible).toBe(true);
        expect(view.list.children[0].state).not.toBe("refused");
    });

    it("can say something on the path line of the top level", () => {
        const menu = new Menu<string>([
            { label: "A", entries: [{ label: "B", value: "b" }] },
        ]);
        const input = new MenuInput(menu);
        const view = new MenuView(
            input,
            { left: 0, top: 0, width: 200, height: 300 },
            { show_path: true, root_text: "Hauptmenü" },
        );
        const path = view.path as MenuPath<string>;
        path.poll_animation();
        expect(path.text).toBe("Hauptmenü");
        input.handle_key("Enter");
        path.poll_animation();
        expect(path.text).toBe("A");
    });

    it("takes another row height for another layout", () => {
        const menu = new Menu<string>([{ label: "A", value: "a" }]);
        const view = new MenuView(new MenuInput(menu), {
            left: 0,
            top: 0,
            width: 200,
            height: 300,
        });
        view.row_height = 70;
        view.poll_animation();
        void view.list.max_scroll;
        const row = view.list.children[0];
        expect(row.rect.height).toBe(70);
        expect((view.hint as MenuHint<string>).rect.height).toBe(70);
    });
});
