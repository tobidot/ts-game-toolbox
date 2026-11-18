import { RectI } from "../geometries";
import { MenuInput } from "../input/MenuInput";
import {
    SaveEvent,
    SaveEventKind,
    SaveHeader,
    SaveSlots,
} from "../storage/saves/SaveSlots";
import { Menu, MenuEntry } from "../ui/menu/Menu";
import { MenuView, MenuViewOptions } from "../ui/widgets/MenuView";

/**
 * What a player chose on a `SaveSlotsPage`: go on with a slot, start a new game in an empty (or
 * unplayable) one, or a slot was deleted (after the confirm, once it is gone).
 */
export interface SaveSlotChoice {
    readonly action: "continue" | "new" | "remove";
    readonly slot: string;
}

/** Everything a `SaveSlotsPage` says; German by default, like the rest of the shell. */
export interface SaveSlotsPageTexts {
    /** A slot's label, from its place in the list (0 first). */
    readonly slot_name: (index: number, slot: string) => string;
    readonly empty: string;
    readonly broken: string;
    readonly newer: string;
    readonly remove: string;
    readonly remove_hint: string;
    readonly confirm_remove: (name: string) => string;
    readonly confirm_hint: (summary: string) => string;
    readonly keep: string;
    readonly back: string;
    /** The line above the rows on the top level. */
    readonly title: string;
    /** "vor 3 Min.", from seconds. */
    readonly ago: (seconds: number) => string;
}

/** How long ago, in words one reads at a glance: "gerade eben", "vor 3 Min.", "vor 2 Tagen". */
export function ago_text(seconds: number): string {
    if (seconds < 60) {
        return "gerade eben";
    }
    if (seconds < 3600) {
        return `vor ${Math.floor(seconds / 60)} Min.`;
    }
    if (seconds < 86400) {
        return `vor ${Math.floor(seconds / 3600)} Std.`;
    }
    const days = Math.floor(seconds / 86400);
    return days === 1 ? "vor 1 Tag" : `vor ${days} Tagen`;
}

export const SAVE_SLOTS_PAGE_TEXTS: SaveSlotsPageTexts = {
    slot_name: (index) => `Platz ${index + 1}`,
    empty: "leer · neues Spiel",
    broken: "beschädigt · neu beginnen, die Datei bleibt",
    newer: "von einer neueren Version · neu beginnen, die Datei bleibt",
    remove: "Löschen …",
    remove_hint: "einen Spielstand löschen",
    confirm_remove: (name) => `Ja, ${name} löschen`,
    confirm_hint: (summary) =>
        summary === "" ? "ist dann weg" : `${summary} ist dann weg`,
    keep: "Nein, behalten",
    back: "Zurück",
    title: "Spielstände",
    ago: ago_text,
};

export interface SaveSlotsPageOptions extends MenuViewOptions<SaveSlotChoice> {
    /** The slots in the list. Default: `slot-1` to `slot-3` (the shell's `settings.save_slots`). */
    readonly slots?: readonly string[];
    readonly texts?: Partial<SaveSlotsPageTexts>;
    /** Milliseconds since 1970, for "vor 3 Min.". Default `Date.now`. */
    readonly now?: () => number;
}

/** The events after which the list may have changed. */
const CHANGES: ReadonlySet<SaveEventKind> = new Set([
    "saved",
    "removed",
    "imported",
    "kept",
]);

/**
 * The slot list as a ready-made menu: a row per slot with its summary and when it was played
 * (`Platz 1  Tag 12 · vor 3 Min.`), a press continues it, or starts a new game in an empty one, and
 * "Löschen …" deletes one after a confirm. It is a `MenuView`, so `properties.place()` gives it the
 * keys (1, 2, 3, L, arrows, Enter, Escape), a gamepad and the house look; a game shows it with
 * `input.is_enabled = true` and takes it away with `false`.
 *
 * It reads the slots when it first shows (the cursor then on the slot played last) and again
 * after every save, removal or import, so a game never tells it to refresh. Continue and new reach `on_choose` and `input.choices()`; a
 * delete is done by the page, then `on_choose` hears of it.
 */
export class SaveSlotsPage extends MenuView<SaveSlotChoice> {
    /** Called with every choice, inside the input's event. */
    public on_choose: ((choice: SaveSlotChoice) => void) | null = null;
    public readonly slots: readonly string[];
    private readonly saves: SaveSlots<unknown>;
    private readonly texts: SaveSlotsPageTexts;
    private readonly now: () => number;
    private shown_headers = new Map<string, SaveHeader>();
    /** Whether the list may be out of date. */
    private is_stale = true;
    private refreshing: Promise<void> | null = null;
    /** The first read puts the cursor on the newest slot. */
    private is_first_read = true;

    public constructor(
        saves: SaveSlots<any>,
        rect: RectI,
        options: SaveSlotsPageOptions = {},
    ) {
        const texts = { ...SAVE_SLOTS_PAGE_TEXTS, ...options.texts };
        super(new MenuInput(new Menu<SaveSlotChoice>([])), rect, {
            show_hint: false,
            row_hint_share: 0.62,
            show_path: true,
            root_text: texts.title,
            row_height: 48,
            ...options,
        });
        this.saves = saves;
        this.texts = texts;
        this.slots = options.slots ?? ["slot-1", "slot-2", "slot-3"];
        this.now = options.now ?? Date.now;
        this.input.on_choice = (choice) => this.choose(choice);
        this.show_entries();
        saves.events.attach(SaveEvent, (event) => {
            if (CHANGES.has(event.kind)) {
                this.is_stale = true;
                if (this.input.is_enabled) {
                    void this.refresh();
                }
            }
        });
    }

    /** The headers of the slots as last read, by slot. */
    public get headers(): ReadonlyMap<string, SaveHeader> {
        return this.shown_headers;
    }

    /** Reads the slots again. A game rarely needs it: the page follows the saves by itself. */
    public refresh(): Promise<void> {
        if (this.refreshing !== null) {
            return this.refreshing.then(() => this.refresh());
        }
        this.is_stale = false;
        this.refreshing = this.saves.list().then((headers) => {
            this.shown_headers = new Map(
                headers.map((header) => [header.slot, header]),
            );
            this.show_entries();
            if (this.is_first_read) {
                this.is_first_read = false;
                this.point_at_newest(headers);
            }
            this.refreshing = null;
        });
        return this.refreshing;
    }

    /** Reads the slots the first time it is drawn, and after a change while it was away. */
    public override poll_animation(): boolean {
        if (this.is_stale && this.input.is_enabled) {
            void this.refresh();
        }
        return super.poll_animation();
    }

    /** The cursor on the slot played last, so Enter goes on where one was. */
    private point_at_newest(headers: readonly SaveHeader[]): void {
        const newest = headers.find(
            (header) =>
                header.problem === null && this.slots.includes(header.slot),
        );
        if (newest !== undefined && this.input.menu.levels.length === 1) {
            this.input.menu.point_at(this.slots.indexOf(newest.slot));
        }
    }

    private choose(choice: SaveSlotChoice): void {
        if (choice.action !== "remove") {
            this.on_choose?.(choice);
            return;
        }
        this.input.menu.reset();
        void this.saves.remove(choice.slot).then((is_removed) => {
            if (is_removed) {
                this.shown_headers.delete(choice.slot);
                this.show_entries();
                this.on_choose?.(choice);
            }
        });
    }

    private show_entries(): void {
        const texts = this.texts;
        const filled: MenuEntry<SaveSlotChoice>[] = [];
        const rows = this.slots.map((slot, index) => {
            const name = texts.slot_name(index, slot);
            const header = this.shown_headers.get(slot) ?? null;
            const key = index < 9 ? String(index + 1) : undefined;
            if (header !== null) {
                filled.push({
                    label: name,
                    key,
                    hint: header.summary,
                    entries: [
                        {
                            label: texts.confirm_remove(name),
                            value: { action: "remove", slot },
                            hint: texts.confirm_hint(header.summary),
                        },
                        { label: texts.keep, back: true },
                    ],
                });
            }
            if (header === null || header.problem !== null) {
                return {
                    label: name,
                    key,
                    value: { action: "new" as const, slot },
                    hint:
                        header === null
                            ? texts.empty
                            : header.problem === "broken"
                              ? texts.broken
                              : texts.newer,
                };
            }
            return {
                label: name,
                key,
                value: { action: "continue" as const, slot },
                hint: () => this.played_line(header),
            };
        });
        const remove: MenuEntry<SaveSlotChoice>[] =
            filled.length === 0
                ? []
                : [
                      {
                          label: texts.remove,
                          key: "l",
                          hint: texts.remove_hint,
                          entries: [
                              ...filled,
                              { label: texts.back, back: true },
                          ],
                      },
                  ];
        this.input.menu.set_entries([...rows, ...remove]);
    }

    private played_line(header: SaveHeader): string {
        const ago = this.texts.ago(
            Math.max(0, (this.now() - header.saved_at) / 1000),
        );
        return header.summary === "" ? ago : `${header.summary} · ${ago}`;
    }
}
