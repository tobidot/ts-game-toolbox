/** One line of a menu: something to choose, or a submenu to open. */
export interface MenuEntry<T> {
    label: string;
    /** What confirming this entry returns. */
    value?: T;
    /** A submenu: confirming this entry opens it instead of returning a value. */
    entries?: MenuEntry<T>[];
    /** Can't be chosen, right now if it is a function: asked again at every look. */
    disabled?: boolean | (() => boolean);
    /** Says what the entry does, or why it can't be chosen right now. */
    hint?: string | (() => string);
    /** Confirming this entry goes one level back, so a game doesn't catch a value for it. */
    back?: boolean;
    /** The letter that picks this entry directly on its level. */
    key?: string;
}

/** One open level: its entries, the label of the entry that opened it, where its cursor stands. */
export interface MenuLevel<T> {
    readonly entries: readonly MenuEntry<T>[];
    readonly label: string | null;
    cursor: number;
}

export interface MenuOptions {
    /**
     * Let the cursor stop on disabled entries, as an office program does, so a key can read their
     * hints too, and the way to an entry doesn't depend on what is enabled. Default false: `move()`
     * skips them.
     */
    stops_on_disabled?: boolean;
}

/**
 * A menu as a tree and a cursor: which level is open, which entry the cursor is on, the way back.
 * It knows no drawing, no DOM, no keys and no pointer, so a game paints it its own way and any
 * input can drive it: keys call `move()`, a pointer calls `point_at()`, both call `confirm()`.
 */
export class Menu<T> {
    private open_levels: MenuLevel<T>[];
    private root: readonly MenuEntry<T>[];
    private readonly stops_on_disabled: boolean;
    private _tree_version: number = 0;

    public constructor(
        root: readonly MenuEntry<T>[],
        options: MenuOptions = {},
    ) {
        this.root = root;
        this.stops_on_disabled = options.stops_on_disabled ?? false;
        this.open_levels = [this.open_level(root, null)];
    }

    /** The open levels from the top down, so a view can draw the parents too. */
    public get levels(): readonly Readonly<MenuLevel<T>>[] {
        return this.open_levels;
    }

    /** Goes up by one each time `set_entries()` replaced the tree. */
    public get tree_version(): number {
        return this._tree_version;
    }

    /** The entries of the open level. */
    public get entries(): readonly MenuEntry<T>[] {
        return this.level.entries;
    }

    /** The index of the entry the cursor is on, in `entries`. */
    public get cursor(): number {
        return this.level.cursor;
    }

    /** The entry the cursor is on; null only on a level without entries. */
    public get current(): MenuEntry<T> | null {
        return this.entries[this.cursor] ?? null;
    }

    /** The labels of the open submenus, outermost first; empty at the top. */
    public get path(): readonly string[] {
        return this.open_levels.slice(1).map((level) => level.label ?? "");
    }

    /** Whether `entry` can't be chosen right now. */
    public is_disabled(entry: MenuEntry<T>): boolean {
        const disabled = entry.disabled ?? false;
        return typeof disabled === "function" ? disabled() : disabled;
    }

    /** What `entry` says about itself right now; empty when it has no hint. */
    public hint_of(entry: MenuEntry<T>): string {
        const hint = entry.hint ?? "";
        return typeof hint === "function" ? hint() : hint;
    }

    /**
     * Moves the cursor `step` enabled entries on, backwards when negative, wrapping at the ends.
     * On a level with nothing enabled it stays where it is. With `stops_on_disabled` it walks over
     * every entry.
     */
    public move(step: number): void {
        const level = this.level;
        const direction = Math.sign(step);
        for (let count = Math.abs(step); count > 0; count -= 1) {
            const next = this.next_enabled(level, direction);
            if (next === null) {
                return;
            }
            level.cursor = next;
        }
    }

    /**
     * A pointer over the entry `index`. Unlike `move()` this may land on a disabled entry: it is
     * what the pointer points at, its hint can tell why, and the `confirm()` of a tap on it must
     * not choose the entry the cursor happened to be on. An index outside the level does nothing.
     */
    public point_at(index: number): void {
        if (
            Number.isInteger(index) &&
            index >= 0 &&
            index < this.entries.length
        ) {
            this.level.cursor = index;
        }
    }

    /**
     * Chooses the entry under the cursor. A submenu opens and null comes back; an entry with a
     * value returns it and the menu stays as it is, for the game to `reset()` when it is done. A
     * disabled entry, or one with neither, does nothing and returns null. A `back` entry goes one
     * level back and returns null.
     */
    public confirm(): T | null {
        const entry = this.current;
        if (entry === null || this.is_disabled(entry)) {
            return null;
        }
        if (entry.back === true) {
            this.back();
            return null;
        }
        if (entry.entries !== undefined) {
            this.open_levels.push(this.open_level(entry.entries, entry.label));
            return null;
        }
        return entry.value ?? null;
    }

    /** Closes the open submenu; the cursor is back where it was. False when already at the top. */
    public back(): boolean {
        if (this.open_levels.length === 1) {
            return false;
        }
        this.open_levels.pop();
        return true;
    }

    /**
     * Back to the level at `depth`, 0 being the top, closing what is open below it: a press on a
     * parent. False when that level isn't open, or is the open one.
     */
    public back_to(depth: number): boolean {
        if (depth < 0 || depth >= this.open_levels.length - 1) {
            return false;
        }
        this.open_levels.length = depth + 1;
        return true;
    }

    /** Where the entry with the letter `key` is on the open level, in any case; -1 if none has it. */
    public index_of_key(key: string): number {
        const wanted = key.toLowerCase();
        return this.entries.findIndex(
            (entry) => entry.key?.toLowerCase() === wanted,
        );
    }

    /** Whether any entry anywhere in the tree has a `key`. */
    public get has_keys(): boolean {
        const has_key = (entries: readonly MenuEntry<T>[]): boolean =>
            entries.some(
                (entry) =>
                    entry.key !== undefined ||
                    (entry.entries !== undefined && has_key(entry.entries)),
            );
        return has_key(this.root);
    }

    /**
     * Replaces the tree while it is open. An entry stays the same entry if its level has one with
     * the same label: the cursor stays on it, wherever it is now. An open submenu whose entry is
     * gone closes, and whatever is below it, and the cursor then stays where it stood, or as near
     * as the level allows.
     */
    public set_entries(root: readonly MenuEntry<T>[]): void {
        const old_levels = this.open_levels;
        this.root = root;
        this._tree_version += 1;
        const first = this.open_level(root, null);
        const levels = [first];
        this.keep_cursor(first, old_levels[0]);
        for (let depth = 1; depth < old_levels.length; depth += 1) {
            const opened_by = old_levels[depth].label;
            const parent = levels[depth - 1];
            const index = parent.entries.findIndex(
                (entry) => entry.label === opened_by,
            );
            const entries = parent.entries[index]?.entries;
            if (entries === undefined) {
                break;
            }
            parent.cursor = index;
            const level = this.open_level(entries, opened_by);
            this.keep_cursor(level, old_levels[depth]);
            levels.push(level);
        }
        this.open_levels = levels;
    }

    /** Back to the top with the cursor on the first enabled entry. */
    public reset(): void {
        this.open_levels = [this.open_level(this.root, null)];
    }

    private get level(): MenuLevel<T> {
        return this.open_levels[this.open_levels.length - 1];
    }

    /** The cursor of `level`, a new one, on the entry `old` stood on if it is still there. */
    private keep_cursor(level: MenuLevel<T>, old: MenuLevel<T>): void {
        const label = old.entries[old.cursor]?.label;
        const same = level.entries.findIndex((entry) => entry.label === label);
        const last = Math.max(0, level.entries.length - 1);
        level.cursor = same >= 0 ? same : Math.min(old.cursor, last);
    }

    private open_level(
        entries: readonly MenuEntry<T>[],
        label: string | null,
    ): MenuLevel<T> {
        const first = this.stops_on_disabled
            ? 0
            : entries.findIndex((entry) => !this.is_disabled(entry));
        return { entries, label, cursor: Math.max(0, first) };
    }

    /** The next enabled entry from the cursor in `direction`, which may be itself; null if none. */
    private next_enabled(
        level: MenuLevel<T>,
        direction: number,
    ): number | null {
        const length = level.entries.length;
        for (let offset = 1; offset <= length; offset += 1) {
            const index =
                (level.cursor + direction * offset + length * offset) % length;
            if (
                this.stops_on_disabled ||
                !this.is_disabled(level.entries[index])
            ) {
                return index;
            }
        }
        return null;
    }
}
