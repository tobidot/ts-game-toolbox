import { RectI, Vector2I } from "../../geometries";
import { MenuInput } from "../../input/MenuInput";
import { Element } from "../Element";
import { MenuEntry } from "../menu/Menu";
import { ThemeRule } from "../theme/Theme";
import { Button } from "./Button";
import { Label } from "./Label";
import { Panel } from "./Panel";
import { ScrollGroup } from "./ScrollGroup";

const NO_RECT: Readonly<RectI> = { left: 0, top: 0, width: 0, height: 0 };

/** Between the edge and the text of a hint or a path. */
const LINE_PADDING = 8;
/** How much of the font size the key letter and the submenu mark take of a row. */
const KEY_COLUMN_FONT_SIZES = 1.5;
const MARK_COLUMN_FONT_SIZES = 1.2;

/**
 * One row of a `MenuView`: an entry to press. Its label, key letter and submenu mark are
 * `Button.columns`; `selected` is the cursor. A disabled row with the cursor on it is in the state
 * `disabled_selected`, and a `:disabled` rule holds for that too.
 *
 * Theme type `menu-row`, with the class `submenu` on an entry that opens and `back` on one going
 * back. Subclass it and override `draw()` for anything the rules can't say, and hand it to the
 * view through `create_row`.
 */
export class MenuRow<T> extends Button {
    public readonly entry: MenuEntry<T>;
    public readonly index: number;
    /** Set by the view. */
    public input: MenuInput<T> | null = null;
    /** Which level the row is on. */
    public depth: number = 0;
    /** Whether the level has key letters, so all rows keep a column for them. */
    public has_key_column: boolean = false;
    public submenu_mark: string = "›";
    public back_mark: string = "‹";

    public constructor(entry: MenuEntry<T>, index: number) {
        super(entry.label, NO_RECT);
        this.entry = entry;
        this.index = index;
        this.type = "menu-row";
        this.text_overflow = "ellipsis";
        if (entry.back === true) {
            this.class = "back";
        } else if (entry.entries !== undefined) {
            this.class = "submenu";
        }
    }

    public override get state(): string | null {
        const state = super.state;
        return state === "disabled" && this.is_selected
            ? "disabled_selected"
            : state;
    }

    /** A press goes to the input, which may make it wait; disabled rows are pressed too. */
    public override click(): void {
        this.input?.handle_press(this.depth, this.index);
    }

    /** Under a mouse the cursor follows. A finger has no hover: its press comes with `is_down`. */
    public override update_mouse_hover_status(is_hovering: boolean): boolean {
        if (is_hovering && !this.is_down) {
            this.input?.handle_hover(this.depth, this.index);
        }
        return super.update_mouse_hover_status(is_hovering);
    }

    public override draw(ctx: CanvasRenderingContext2D): void {
        this.columns = this.row_columns();
        super.draw(ctx);
    }

    /** The key letter, the label and the mark, the first and the last at their own width. */
    private row_columns(): Button["columns"] {
        const inner = Math.max(1, this.rect.width - 2 * this.text_padding);
        const font_size = this.theme_instance.get("font_size");
        const entry = this.entry;
        const key_share = this.has_key_column
            ? Math.min(0.4, (font_size * KEY_COLUMN_FONT_SIZES) / inner)
            : 0;
        const mark_share = Math.min(
            0.4,
            (font_size * MARK_COLUMN_FONT_SIZES) / inner,
        );
        const label =
            entry.back === true
                ? `${this.back_mark} ${entry.label}`
                : entry.label;
        return [
            ...(this.has_key_column
                ? [
                      {
                          text: entry.key?.toUpperCase() ?? "",
                          share: key_share,
                          align: "left" as const,
                      },
                  ]
                : []),
            {
                text: label,
                share: 1 - key_share - mark_share,
                align: "left" as const,
            },
            {
                text: entry.entries === undefined ? "" : this.submenu_mark,
                share: mark_share,
                align: "right" as const,
            },
        ];
    }
}

/**
 * The hint of the entry under the cursor, as a widget: it reads the menu when it draws, so a reason
 * that changes while the menu is open just shows. Theme type `menu-hint`, with the class `held`
 * while the input is held, when `held_text` shows instead if there is one.
 */
export class MenuHint<T> extends Label {
    /** What shows while the input is held; null keeps the hint. */
    public held_text: string | null;

    public constructor(
        private readonly input: MenuInput<T>,
        rect: RectI,
        held_text: string | null = null,
    ) {
        super("", rect);
        this.held_text = held_text;
        this.type = "menu-hint";
        this.is_wrapped = true;
        this.text_padding = LINE_PADDING;
    }

    /** Reads the menu; returns whether something shown has changed. */
    private sync(): boolean {
        const input = this.input;
        const menu = input.menu;
        const current = menu.current;
        const hint = current === null ? "" : menu.hint_of(current);
        const text = input.is_held ? (this.held_text ?? hint) : hint;
        const class_name = input.is_held ? "held" : null;
        const has_changed = text !== this.text || class_name !== this.class;
        this.text = text;
        if (class_name !== this.class) {
            this.class = class_name;
        }
        return has_changed;
    }

    public override poll_animation(): boolean {
        const has_changed = this.is_visible && this.sync();
        return super.poll_animation() || has_changed;
    }

    public override draw(ctx: CanvasRenderingContext2D): void {
        this.sync();
        super.draw(ctx);
    }
}

/** The open path as a line, "Anträge › Steuern", as a widget. Theme type `menu-path`. */
export class MenuPath<T> extends Label {
    public constructor(
        private readonly input: MenuInput<T>,
        rect: RectI,
        public separator: string = " › ",
        /** What it says on the top level, where there is no path yet. */
        public root_text: string = "",
    ) {
        super("", rect);
        this.type = "menu-path";
        this.text_padding = LINE_PADDING;
    }

    public override poll_animation(): boolean {
        const text = this.path_text();
        const has_changed = this.is_visible && text !== this.text;
        this.text = text;
        return super.poll_animation() || has_changed;
    }

    public override draw(ctx: CanvasRenderingContext2D): void {
        this.text = this.path_text();
        super.draw(ctx);
    }

    private path_text(): string {
        const path = this.input.menu.path;
        return path.length === 0 ? this.root_text : path.join(this.separator);
    }
}

export interface MenuViewOptions<T> {
    /** Theme rules for this menu and what is in it, the selectors `menu`, `menu-row`, `menu-hint`, `menu-path`. */
    style?: ThemeRule[];
    /** Which level to show, 0 being the top; it hides while that level isn't open. Default: the open one. */
    level?: number;
    /** Default 40. */
    row_height?: number;
    /** Default 2. */
    row_gap?: number;
    /** Around the rows. Default 4. */
    padding?: number;
    /** On an entry that opens. Default `›`. */
    submenu_mark?: string;
    /** The line for the hint under the rows. Default true. */
    show_hint?: boolean;
    /** The line for the open path above the rows. Default false. */
    show_path?: boolean;
    /** What the path line says on the top level. Default nothing. */
    root_text?: string;
    /** What the hint line says while the input is held; default the hint itself. */
    held_text?: string;
    /** Build a row of your own, a subclass of `MenuRow`. */
    create_row?: (entry: MenuEntry<T>, index: number) => MenuRow<T>;
}

/**
 * A menu on the screen, in a style, with no drawing code in the game: a row per entry, the cursor's
 * highlighted, a hint line, and rows that scroll when there are too many. It reads the menu when it
 * draws and when it's hit, so a game never tells it to refresh. Hover moves the cursor on a mouse; a
 * tap presses directly, so a phone never needs two taps.
 *
 * A style is a list of theme rules. Theme type `menu` is the area behind the rows, with the class
 * `held` while the input is held, and `:entering` for a moment when another level opens in it.
 *
 * It holds a `ScrollGroup` for the rows, between the path and the hint, because those two must not
 * scroll with them.
 */
export class MenuView<T> extends Panel {
    public readonly input: MenuInput<T>;
    /** The rows of the level it shows, in the `ScrollGroup` `list`. */
    public readonly list: ScrollGroup;
    public readonly hint: MenuHint<T> | null;
    public readonly path: MenuPath<T> | null;
    private readonly level: number | null;
    private readonly submenu_mark: string;
    private readonly create_row: (
        entry: MenuEntry<T>,
        index: number,
    ) => MenuRow<T>;
    private rows: MenuRow<T>[] = [];
    private shown_entries: readonly MenuEntry<T>[] | null = null;
    private shown_depth: number = -1;
    private shown_cursor: number = -1;
    private seen_refusals: number;
    /** What shows from the start hasn't arrived from anywhere. */
    private is_at_start: boolean = true;

    public constructor(
        input: MenuInput<T>,
        rect: RectI,
        options: MenuViewOptions<T> = {},
    ) {
        super([], rect, true, options.style ?? []);
        this.type = "menu";
        this.input = input;
        this.level = options.level ?? null;
        this.submenu_mark = options.submenu_mark ?? "›";
        this.create_row =
            options.create_row ?? ((entry, index) => new MenuRow(entry, index));
        this.seen_refusals = input.refusals;
        this.list = new ScrollGroup([], NO_RECT);
        this.list.row_height = options.row_height ?? 40;
        this.list.row_gap = options.row_gap ?? 2;
        this.list.padding = options.padding ?? 4;
        this.list.reserves_gutter = false;
        this.add(this.list);
        this.hint =
            (options.show_hint ?? true)
                ? new MenuHint(input, NO_RECT, options.held_text ?? null)
                : null;
        this.path =
            (options.show_path ?? false)
                ? new MenuPath(input, NO_RECT, " › ", options.root_text ?? "")
                : null;
        for (const line of [this.hint, this.path]) {
            if (line !== null) {
                this.add(line);
            }
        }
        this.sync();
        this.is_at_start = false;
    }

    /** How high a row is, and the hint and the path. A layout for a phone can ask for more. */
    public get row_height(): number {
        return this.list.row_height ?? 0;
    }

    public set row_height(value: number) {
        this.list.row_height = value;
    }

    public override hit(coords: Vector2I): Array<Element> {
        this.sync();
        return super.hit(coords);
    }

    /** A still game repaints for a change it doesn't know about, a reason that went away. */
    public override poll_animation(): boolean {
        const has_changed = this.sync();
        return super.poll_animation() || has_changed;
    }

    public override draw(ctx: CanvasRenderingContext2D): void {
        this.sync();
        super.draw(ctx);
    }

    /** Follows the menu; returns whether something it shows has changed. */
    private sync(): boolean {
        const menu = this.input.menu;
        const levels = menu.levels;
        const open_depth = levels.length - 1;
        const depth = this.level ?? open_depth;
        const level = levels[depth];
        const was_visible = this.is_visible;
        this.is_visible = level !== undefined;
        if (level === undefined) {
            this.shown_entries = null;
            this.seen_refusals = this.input.refusals;
            return was_visible;
        }
        this.arrange();
        let has_changed = !was_visible;
        if (
            level.entries !== this.shown_entries ||
            depth !== this.shown_depth
        ) {
            this.rebuild(level.entries, depth);
            has_changed = true;
        }
        if (level.cursor !== this.shown_cursor) {
            this.shown_cursor = level.cursor;
            const row = this.rows[level.cursor];
            if (row !== undefined) {
                this.list.scroll_to(row);
            }
            has_changed = true;
        }
        for (const row of this.rows) {
            const is_disabled = menu.is_disabled(row.entry);
            const is_selected = row.index === level.cursor;
            if (row.is_disabled !== is_disabled) {
                row.is_disabled = is_disabled;
                has_changed = true;
            }
            if (row.is_selected !== is_selected) {
                row.is_selected = is_selected;
                has_changed = true;
            }
        }
        const class_name = this.input.is_held ? "held" : null;
        if (class_name !== this.class) {
            this.class = class_name;
            has_changed = true;
        }
        if (this.input.refusals !== this.seen_refusals) {
            this.seen_refusals = this.input.refusals;
            if (depth === open_depth) {
                this.rows[level.cursor]?.show_refused();
                has_changed = true;
            }
        }
        return has_changed;
    }

    /** The rows between the path and the hint; each line is as high as a row. */
    private arrange(): void {
        const { width, height } = this.rect;
        const line = this.row_height;
        const top = this.path === null ? 0 : line;
        const bottom = this.hint === null ? 0 : line;
        place(this.path, 0, width, line);
        place(this.list, top, width, Math.max(0, height - top - bottom));
        place(this.hint, height - line, width, line);
    }

    private rebuild(entries: readonly MenuEntry<T>[], depth: number): void {
        for (const row of this.rows) {
            this.list.remove(row);
        }
        const has_keys = entries.some((entry) => entry.key !== undefined);
        this.rows = entries.map((entry, index) => {
            const row = this.create_row(entry, index);
            row.input = this.input;
            row.depth = depth;
            row.has_key_column = has_keys;
            row.submenu_mark = this.submenu_mark;
            this.list.add(row);
            return row;
        });
        this.shown_entries = entries;
        this.shown_depth = depth;
        this.shown_cursor = -1;
        this.list.scroll = 0;
        if (!this.is_at_start) {
            this.show_entering();
        }
    }
}

function place(
    element: Element | null,
    top: number,
    width: number,
    height: number,
): void {
    if (element !== null) {
        element.rect.left = 0;
        element.rect.top = top;
        element.rect.width = width;
        element.rect.height = height;
    }
}
