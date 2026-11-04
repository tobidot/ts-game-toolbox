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
}

/** One open level: its entries and where its cursor stands. */
interface MenuLevel<T> {
    readonly entries: readonly MenuEntry<T>[];
    readonly label: string | null;
    cursor: number;
}

/**
 * A menu as a tree and a cursor: which level is open, which entry the cursor is on, the way back.
 * It knows no drawing, no DOM, no keys and no pointer, so a game paints it its own way and any
 * input can drive it: keys call `move()`, a pointer calls `point_at()`, both call `confirm()`.
 */
export class Menu<T> {
    private levels: MenuLevel<T>[];

    public constructor(private readonly root: readonly MenuEntry<T>[]) {
        this.levels = [this.open_level(root, null)];
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
        return this.levels.slice(1).map((level) => level.label ?? "");
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
     * On a level with nothing enabled it stays where it is.
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
     * disabled entry, or one with neither, does nothing and returns null.
     */
    public confirm(): T | null {
        const entry = this.current;
        if (entry === null || this.is_disabled(entry)) {
            return null;
        }
        if (entry.entries !== undefined) {
            this.levels.push(this.open_level(entry.entries, entry.label));
            return null;
        }
        return entry.value ?? null;
    }

    /** Closes the open submenu; the cursor is back where it was. False when already at the top. */
    public back(): boolean {
        if (this.levels.length === 1) {
            return false;
        }
        this.levels.pop();
        return true;
    }

    /** Back to the top with the cursor on the first enabled entry. */
    public reset(): void {
        this.levels = [this.open_level(this.root, null)];
    }

    private get level(): MenuLevel<T> {
        return this.levels[this.levels.length - 1];
    }

    private open_level(
        entries: readonly MenuEntry<T>[],
        label: string | null,
    ): MenuLevel<T> {
        const first = entries.findIndex((entry) => !this.is_disabled(entry));
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
            if (!this.is_disabled(level.entries[index])) {
                return index;
            }
        }
        return null;
    }
}
