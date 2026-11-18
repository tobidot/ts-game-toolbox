import { EventBase, EventSocket } from "../../signals/EventSocket";
import { default_save_store, memory_store, SaveStore } from "./SaveStore";

/** What a save file says it is, so a file of anything else is never taken for one. */
export const SAVE_FORMAT = "ts-game-toolbox/save";

/** Letters, digits, `-` and `_`: a slot name is a file name on any store. */
const SLOT_NAME = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * Turns the data of one version into the data of the next. It gets plain JSON data and returns
 * plain JSON data; it may throw, and the save then counts as broken.
 */
export type SaveMigration = (old: any) => unknown;

/** Version n to the function that makes version n + 1 of it, for every n up to the current version. */
export type SaveMigrations = Readonly<Record<number, SaveMigration>>;

/** Why a save can't be played: it can't be read, or a newer game wrote it. */
export type SaveProblem = "broken" | "newer";

/** What a save says about itself, without its data: what a slot list shows. */
export interface SaveHeader {
    readonly slot: string;
    /** The version of the data in the file (before any migration). 0 when it can't be read. */
    readonly version: number;
    /** When it was written, in milliseconds since 1970; 0 when unknown. */
    readonly saved_at: number;
    readonly seconds_played: number;
    /** The game's line for the slot list ("Tag 12, 34 Kräuter"); may be empty. */
    readonly summary: string;
    /** Null when the save can be played. */
    readonly problem: SaveProblem | null;
}

/**
 * How a load went. `empty`: nothing saved yet. `loaded`: the current version. `migrated`: an older
 * one, brought up to date. `broken`, `newer`: the file was kept aside and the data is fresh.
 * `unreachable`: the store failed, the data is fresh.
 */
export type SaveOutcome =
    | "empty"
    | "loaded"
    | "migrated"
    | "broken"
    | "newer"
    | "unreachable";

/** A load, always with something playable in `data`, and what it came from. */
export interface LoadedSave<T> {
    readonly data: T;
    /** The file's header; null when there was no file or it couldn't be read. */
    readonly header: SaveHeader | null;
    readonly outcome: SaveOutcome;
    /** The version the file was written in; null when that is unknown. */
    readonly from_version: number | null;
    /** What went wrong, for a `broken`, `newer` or `unreachable` outcome. */
    readonly reason: string | null;
}

/**
 * What happened. Fine: `fresh` (an empty slot), `loaded`, `migrated`, `saved`, `removed`,
 * `imported`, `kept` (a file was kept aside under `name`). Problems: `broken`, `newer`, `failed`
 * (the store refused something).
 */
export type SaveEventKind =
    | "fresh"
    | "loaded"
    | "migrated"
    | "saved"
    | "removed"
    | "imported"
    | "kept"
    | "broken"
    | "newer"
    | "failed";

const PROBLEMS: ReadonlySet<SaveEventKind> = new Set([
    "broken",
    "newer",
    "failed",
]);

/** One thing `SaveSlots` did or met, on `SaveSlots.events`. */
export class SaveEvent extends EventBase {
    public static readonly EVENT_NAME = "save";

    public constructor(
        public readonly kind: SaveEventKind,
        /** The slot it is about; null for the store as a whole. */
        public readonly slot: string | null,
        /** What went wrong, in English, for a problem. */
        public readonly reason: string | null = null,
        /** For `kept`: the name the file was kept under. */
        public readonly name: string | null = null,
        public readonly error: unknown = null,
    ) {
        super(SaveEvent.EVENT_NAME);
    }

    /** `broken`, `newer` or `failed`: the game played on, but something wasn't as it should be. */
    public get is_problem(): boolean {
        return PROBLEMS.has(this.kind);
    }
}

/** Tells when the page goes away or out of sight, for an autosave. */
export interface PageHideSource {
    /** Calls `listener` whenever the page hides; returns what stops that. */
    on_hide(listener: () => void): () => void;
}

/**
 * The browser's page: hidden (`visibilitychange`, a tab switched or a phone locked) or left
 * (`pagehide`). Null where there is no document.
 */
export function browser_page_hide(): PageHideSource | null {
    if (typeof document === "undefined" || typeof window === "undefined") {
        return null;
    }
    return {
        on_hide(listener) {
            const on_visibility = () => {
                if (document.visibilityState === "hidden") {
                    listener();
                }
            };
            document.addEventListener("visibilitychange", on_visibility);
            window.addEventListener("pagehide", listener);
            return () => {
                document.removeEventListener("visibilitychange", on_visibility);
                window.removeEventListener("pagehide", listener);
            };
        },
    };
}

/** What `save()` may say beyond the data. */
export interface SaveInfo {
    /** Default: the seconds of the loaded save plus the time since it was loaded. */
    readonly seconds_played?: number;
    /** Default: `options.summary(data)`, else empty. */
    readonly summary?: string;
}

export interface SaveSlotsOptions<T> {
    /** The version of the data the game saves now, a whole number from 1. */
    readonly version: number;
    /** A new game's data. Asked for every load that finds nothing playable. */
    readonly fresh: () => T;
    /**
     * From version n to n + 1, for every older version a save may have. A gap below the current
     * version throws here, in the constructor, so a test finds it before a player does.
     */
    readonly migrations?: SaveMigrations;
    /** Checks loaded (and migrated) data and returns it typed; a throw makes the save broken. */
    readonly validate?: (data: unknown) => T;
    /** The line a slot list shows for `data` ("Tag 12, 34 Kräuter"). */
    readonly summary?: (data: T) => string;
    /**
     * Where the saves go. Default: local storage under `<name>/`, memory where there is none. The
     * game shell hands in its element's store with `use_store()`.
     */
    readonly store?: SaveStore | Promise<SaveStore>;
    /** When the page hides, the autosave saves. Default: the browser's page; null for none. */
    readonly page?: PageHideSource | null;
    /** Milliseconds since 1970. Default `Date.now`; a test passes its own clock. */
    readonly now?: () => number;
    /** Says who speaks in the console. Default "SaveSlots". */
    readonly name?: string;
}

/** A save waiting for its turn: the last text asked for wins. */
interface WaitingWrite {
    text: string;
    readonly waiters: Array<(is_written: boolean) => void>;
}

interface Autosave<T> {
    readonly slot: string;
    readonly get_data: () => T | null;
    readonly seconds: number;
}

/**
 * A game's saves in named slots, versioned, in any `SaveStore`. A game says what it saves and
 * which version that is:
 *
 * ```ts
 * const saves = new SaveSlots<Garden>({ version: 2, fresh: new_garden, migrations: { 1: (old) => ({ ...old, bees: 0 }) } });
 * const garden = await saves.load("slot-1");
 * saves.save("slot-1", garden);
 * ```
 *
 * `load()` always answers with something playable: the saved data migrated up to the current
 * version, or `fresh()` when there is nothing, the file is broken, or a newer version wrote it;
 * the file is then kept aside first (`slot-1.broken-20261118-201503`), never overwritten. Saves
 * are queued in order and the last one asked for wins; `autosave()` saves on a timer and when the
 * page hides. Problems go to `events` and, once per kind, to the console, never into the game:
 * no method rejects except for a slot name that isn't one (a bug).
 *
 * A file is readable JSON: `{ format, version, saved_at, seconds_played, summary, data }`.
 */
export class SaveSlots<T> {
    /** The version this game saves. */
    public readonly version: number;
    /** Everything that happened, problems included. */
    public readonly events = new EventSocket<SaveEvent>();
    private readonly fresh: () => T;
    private readonly migrations: SaveMigrations;
    private readonly validate: ((data: unknown) => T) | null;
    private readonly summary: ((data: T) => string) | null;
    private readonly page: PageHideSource | null;
    private readonly now: () => number;
    private readonly name: string;
    private store!: Promise<SaveStore>;
    /** Every store call runs in this one line, in the order asked. */
    private chain: Promise<unknown> = Promise.resolve();
    /** Saves asked for but not started, by slot. */
    private readonly waiting = new Map<string, WaitingWrite>();
    /** What `seconds_played` counts from, by slot. */
    private readonly played = new Map<
        string,
        { seconds: number; since: number }
    >();
    /** Slots whose unplayable file could not be kept aside: never written over. */
    private readonly guarded = new Set<string>();
    private readonly warned = new Set<SaveEventKind>();
    private autosaving: Autosave<T> | null = null;
    private autosave_timer: ReturnType<typeof setInterval> | null = null;
    private stop_listening: (() => void) | null = null;

    public constructor(options: SaveSlotsOptions<T>) {
        if (!Number.isInteger(options.version) || options.version < 1) {
            throw new Error(
                `SaveSlots: the version must be a whole number from 1, not ${options.version}`,
            );
        }
        this.version = options.version;
        this.fresh = options.fresh;
        this.migrations = options.migrations ?? {};
        check_migrations(this.migrations, this.version);
        this.validate = options.validate ?? null;
        this.summary = options.summary ?? null;
        this.page =
            options.page === undefined ? browser_page_hide() : options.page;
        this.now = options.now ?? Date.now;
        this.name = options.name ?? "SaveSlots";
        this.use_store(
            options.store ?? default_save_store(`${options.name ?? "saves"}/`),
        );
    }

    /**
     * Saves go to `store` from now on. A store that never opens leaves the game playing in memory
     * (a `failed` event says so). The game shell calls it with its element's store.
     */
    public use_store(store: SaveStore | Promise<SaveStore>): void {
        this.store = Promise.resolve(store).catch((error: unknown) => {
            this.report(
                "failed",
                null,
                `the store could not be opened, saving in memory: ${message(error)}`,
                null,
                error,
            );
            return memory_store();
        });
    }

    /** Where the saves lie, for a player: the store's `label`. */
    public async where(): Promise<string> {
        return (await this.store).label;
    }

    /** The data of `slot`, always playable; see `load_save()` for how it went. */
    public async load(slot: string): Promise<T> {
        return (await this.load_save(slot)).data;
    }

    /**
     * The data of `slot` and what it came from. Waits for the saves asked for before it. An
     * unplayable file is kept aside before this resolves, and the data is `fresh()`.
     */
    public async load_save(slot: string): Promise<LoadedSave<T>> {
        check_slot(slot);
        this.waiting.delete(slot);
        return this.enqueue(() => this.read_slot(slot));
    }

    /**
     * Saves `data` (plain JSON data) into `slot`, as it is right now. Queued: a save asked for
     * while another of the same slot waits replaces that one. Resolves true once it is written,
     * false when it couldn't be (see `events`).
     */
    public save(slot: string, data: T, info: SaveInfo = {}): Promise<boolean> {
        check_slot(slot);
        let text: string;
        try {
            text = this.encode(slot, data, info);
        } catch (error) {
            this.report(
                "failed",
                slot,
                `the data can't be written as JSON: ${message(error)}`,
                null,
                error,
            );
            return Promise.resolve(false);
        }
        const waiting = this.waiting.get(slot);
        if (waiting !== undefined) {
            waiting.text = text;
            return new Promise((resolve) => waiting.waiters.push(resolve));
        }
        const write: WaitingWrite = { text, waiters: [] };
        this.waiting.set(slot, write);
        return new Promise((resolve) => {
            write.waiters.push(resolve);
            void this.enqueue(async () => {
                if (this.waiting.get(slot) === write) {
                    this.waiting.delete(slot);
                }
                const is_written = await this.write_slot(slot, write.text);
                for (const waiter of write.waiters) {
                    waiter(is_written);
                }
            });
        });
    }

    /** Forgets `slot` (files kept aside stay). Resolves whether that worked. */
    public remove(slot: string): Promise<boolean> {
        check_slot(slot);
        this.waiting.delete(slot);
        return this.enqueue(async () => {
            try {
                const store = await this.store;
                await call(() => store.remove(slot));
                this.guarded.delete(slot);
                this.played.delete(slot);
                this.report("removed", slot);
                return true;
            } catch (error) {
                this.report(
                    "failed",
                    slot,
                    `could not be removed: ${message(error)}`,
                    null,
                    error,
                );
                return false;
            }
        });
    }

    /**
     * Every slot with a file, headers only, newest first; files that can't be played come last
     * with their `problem`. Files kept aside are not slots.
     */
    public list(): Promise<SaveHeader[]> {
        return this.enqueue(async () => {
            try {
                const store = await this.store;
                const names = await call(() => store.list());
                const headers: SaveHeader[] = [];
                for (const slot of names.filter((name) =>
                    SLOT_NAME.test(name),
                )) {
                    const text = await call(() => store.read(slot));
                    if (text !== null) {
                        headers.push(this.header_of(text, slot));
                    }
                }
                return headers.sort((a, b) => b.saved_at - a.saved_at);
            } catch (error) {
                this.report(
                    "failed",
                    null,
                    `the saves could not be listed: ${message(error)}`,
                    null,
                    error,
                );
                return [];
            }
        });
    }

    /** The file of `slot` as text, for a download; null when there is none. */
    public export(slot: string): Promise<string | null> {
        check_slot(slot);
        return this.enqueue(async () => {
            try {
                const store = await this.store;
                return await call(() => store.read(slot));
            } catch (error) {
                this.report(
                    "failed",
                    slot,
                    `could not be read: ${message(error)}`,
                    null,
                    error,
                );
                return null;
            }
        });
    }

    /**
     * Reads `text` (an exported file), migrates it and saves it into `slot`. A text that isn't a
     * playable save writes nothing; the answer's `outcome` says which it was.
     */
    public async import(text: string, slot: string): Promise<LoadedSave<T>> {
        check_slot(slot);
        const loaded = this.decode(text, slot);
        if (loaded.outcome === "broken" || loaded.outcome === "newer") {
            this.report(loaded.outcome, slot, loaded.reason);
            return loaded;
        }
        const is_saved = await this.save(slot, loaded.data, {
            seconds_played: loaded.header?.seconds_played ?? 0,
            summary:
                this.summary === null
                    ? loaded.header?.summary
                    : this.summary(loaded.data),
        });
        if (is_saved) {
            this.report("imported", slot);
        }
        return loaded;
    }

    /**
     * Saves `get_data()` into `slot` every `seconds` and whenever the page hides; a null from it
     * skips that one. One autosave at a time: a new one replaces the last. Returns what stops it.
     */
    public autosave(
        slot: string,
        get_data: () => T | null,
        seconds: number = 10,
    ): () => void {
        check_slot(slot);
        this.stop_autosave();
        const autosave: Autosave<T> = { slot, get_data, seconds };
        this.autosaving = autosave;
        this.run_autosave();
        return () => {
            if (this.autosaving === autosave) {
                this.stop_autosave();
            }
        };
    }

    /** The slot the autosave writes; null without one. */
    public get autosave_slot(): string | null {
        return this.autosaving?.slot ?? null;
    }

    /** What the autosave would save, saved now. False when there is none or nothing to save. */
    public autosave_now(): Promise<boolean> {
        const autosave = this.autosaving;
        if (autosave === null) {
            return Promise.resolve(false);
        }
        let data: T | null;
        try {
            data = autosave.get_data();
        } catch (error) {
            this.report(
                "failed",
                autosave.slot,
                `the game's data for the autosave threw: ${message(error)}`,
                null,
                error,
            );
            return Promise.resolve(false);
        }
        return data === null
            ? Promise.resolve(false)
            : this.save(autosave.slot, data);
    }

    /** No more autosaves until the next `autosave()`. */
    public stop_autosave(): void {
        this.halt_autosave();
        this.autosaving = null;
    }

    /** Saves once more and holds the autosave (the game left the page); `resume_autosave()` goes on. */
    public pause_autosave(): void {
        if (this.autosaving === null || this.autosave_timer === null) {
            return;
        }
        void this.autosave_now();
        this.halt_autosave();
    }

    /** Goes on with a paused autosave; nothing happens when it runs or there is none. */
    public resume_autosave(): void {
        if (this.autosaving !== null && this.autosave_timer === null) {
            this.run_autosave();
        }
    }

    /** Resolves when everything asked for so far is written. */
    public async flush(): Promise<void> {
        await this.enqueue(() => Promise.resolve());
    }

    /**
     * Reads a save file's text, migrated and checked, without touching the store: what `load()`
     * does with a file. Never throws.
     */
    public decode(text: string, slot: string = ""): LoadedSave<T> {
        let file: unknown;
        try {
            file = JSON.parse(text);
        } catch (error) {
            return this.unplayable("broken", `not JSON: ${message(error)}`);
        }
        const header = read_header(file, slot);
        if (header === null) {
            return this.unplayable(
                "broken",
                `not a save file (format "${SAVE_FORMAT}" with a version from 1 and data)`,
            );
        }
        if (header.version > this.version) {
            return this.unplayable(
                "newer",
                `version ${header.version} is newer than this game's ${this.version}`,
                { ...header, problem: "newer" },
            );
        }
        try {
            let data = (file as { data: unknown }).data;
            for (let from = header.version; from < this.version; from++) {
                const migration = this.migrations[from];
                if (migration === undefined) {
                    throw new Error(`no migration from version ${from}`);
                }
                data = migration(data);
            }
            return {
                data:
                    this.validate === null ? (data as T) : this.validate(data),
                header,
                outcome: header.version < this.version ? "migrated" : "loaded",
                from_version: header.version,
                reason: null,
            };
        } catch (error) {
            return this.unplayable("broken", message(error), {
                ...header,
                problem: "broken",
            });
        }
    }

    /** The file `save()` writes for `data`; throws when JSON can't hold it. */
    public encode(slot: string, data: T, info: SaveInfo = {}): string {
        const now = this.now();
        const seconds_played =
            info.seconds_played ?? this.seconds_played(slot, now);
        this.played.set(slot, { seconds: seconds_played, since: now });
        return JSON.stringify(
            {
                format: SAVE_FORMAT,
                version: this.version,
                saved_at: new Date(now).toISOString(),
                seconds_played: Math.round(seconds_played * 1000) / 1000,
                summary: info.summary ?? this.summary?.(data) ?? "",
                data,
            },
            null,
            2,
        );
    }

    private enqueue<R>(task: () => Promise<R>): Promise<R> {
        const run = this.chain.then(task, task);
        this.chain = run.catch(() => undefined);
        return run;
    }

    private async read_slot(slot: string): Promise<LoadedSave<T>> {
        let store: SaveStore;
        let text: string | null;
        try {
            store = await this.store;
            text = await call(() => store.read(slot));
        } catch (error) {
            this.report(
                "failed",
                slot,
                `could not be read: ${message(error)}`,
                null,
                error,
            );
            this.played.set(slot, { seconds: 0, since: this.now() });
            return {
                data: this.fresh(),
                header: null,
                outcome: "unreachable",
                from_version: null,
                reason: message(error),
            };
        }
        if (text === null) {
            this.played.set(slot, { seconds: 0, since: this.now() });
            this.report("fresh", slot);
            return {
                data: this.fresh(),
                header: null,
                outcome: "empty",
                from_version: null,
                reason: null,
            };
        }
        const loaded = this.decode(text, slot);
        if (loaded.outcome === "broken" || loaded.outcome === "newer") {
            this.report(loaded.outcome, slot, loaded.reason);
            await this.keep_aside(store, slot, text, loaded.outcome);
            this.played.set(slot, { seconds: 0, since: this.now() });
        } else {
            this.report(
                loaded.outcome === "migrated" ? "migrated" : "loaded",
                slot,
            );
            this.played.set(slot, {
                seconds: loaded.header?.seconds_played ?? 0,
                since: this.now(),
            });
        }
        return loaded;
    }

    /** Copies an unplayable file to a name of its own; until that worked, the slot isn't written. */
    private async keep_aside(
        store: SaveStore,
        slot: string,
        text: string,
        problem: SaveProblem,
    ): Promise<void> {
        const base = `${slot}.${problem}-${stamp(this.now())}`;
        try {
            const names = new Set(await call(() => store.list()));
            let name = base;
            for (let count = 2; names.has(name); count++) {
                name = `${base}-${count}`;
            }
            await call(() => store.write(name, text));
            this.guarded.delete(slot);
            this.report("kept", slot, null, name);
        } catch (error) {
            this.guarded.add(slot);
            this.report(
                "failed",
                slot,
                `the ${problem} file could not be kept aside, so it isn't saved over: ${message(error)}`,
                null,
                error,
            );
        }
    }

    private async write_slot(slot: string, text: string): Promise<boolean> {
        if (this.guarded.has(slot)) {
            this.report(
                "failed",
                slot,
                "not saved: the file in this slot couldn't be kept aside",
            );
            return false;
        }
        try {
            const store = await this.store;
            await call(() => store.write(slot, text));
            this.report("saved", slot);
            return true;
        } catch (error) {
            this.report(
                "failed",
                slot,
                `could not be saved: ${message(error)}`,
                null,
                error,
            );
            return false;
        }
    }

    private header_of(text: string, slot: string): SaveHeader {
        let file: unknown = null;
        try {
            file = JSON.parse(text);
        } catch {
            // A broken file has a header that says so.
        }
        const header = read_header(file, slot);
        if (header === null) {
            return {
                slot,
                version: 0,
                saved_at: 0,
                seconds_played: 0,
                summary: "",
                problem: "broken",
            };
        }
        return header.version > this.version
            ? { ...header, problem: "newer" }
            : header;
    }

    private seconds_played(slot: string, now: number): number {
        const played = this.played.get(slot);
        if (played === undefined) {
            return 0;
        }
        return played.seconds + Math.max(0, now - played.since) / 1000;
    }

    private unplayable(
        outcome: "broken" | "newer",
        reason: string,
        header: SaveHeader | null = null,
    ): LoadedSave<T> {
        return {
            data: this.fresh(),
            header,
            outcome,
            from_version: header?.version ?? null,
            reason,
        };
    }

    private run_autosave(): void {
        const autosave = this.autosaving;
        if (autosave === null) {
            return;
        }
        this.autosave_timer = setInterval(
            () => void this.autosave_now(),
            autosave.seconds * 1000,
        );
        this.stop_listening =
            this.page?.on_hide(() => void this.autosave_now()) ?? null;
    }

    private halt_autosave(): void {
        if (this.autosave_timer !== null) {
            clearInterval(this.autosave_timer);
            this.autosave_timer = null;
        }
        this.stop_listening?.();
        this.stop_listening = null;
    }

    private report(
        kind: SaveEventKind,
        slot: string | null,
        reason: string | null = null,
        name: string | null = null,
        error: unknown = null,
    ): void {
        const event = new SaveEvent(kind, slot, reason, name, error);
        if (event.is_problem && !this.warned.has(kind)) {
            this.warned.add(kind);
            console.warn(
                `${this.name}: ${slot === null ? "" : `"${slot}" `}${kind}: ${reason ?? ""} (said once per kind; see SaveSlots.events)`,
            );
        }
        try {
            this.events.dispatch(event);
        } catch (listener_error) {
            console.error(
                `${this.name}: a listener of the save events threw`,
                listener_error,
            );
        }
    }
}

/** A slot name that isn't one is a bug: it throws. */
function check_slot(slot: string): void {
    if (!SLOT_NAME.test(slot)) {
        throw new Error(
            `SaveSlots: "${slot}" is no slot name (letters, digits, "-" and "_", up to 64)`,
        );
    }
}

/** Every version from the oldest migration up to the current one needs its step. */
function check_migrations(migrations: SaveMigrations, version: number): void {
    const froms = Object.keys(migrations).map(Number);
    for (const from of froms) {
        if (!Number.isInteger(from) || from < 1 || from >= version) {
            throw new Error(
                `SaveSlots: a migration from version ${from} doesn't fit below version ${version}`,
            );
        }
    }
    if (froms.length === 0) {
        return;
    }
    for (let from = Math.min(...froms); from < version; from++) {
        if (migrations[from] === undefined) {
            throw new Error(
                `SaveSlots: no migration from version ${from} to ${from + 1}`,
            );
        }
    }
}

/** The header of a parsed save file; null when it isn't one. */
function read_header(file: unknown, slot: string): SaveHeader | null {
    if (typeof file !== "object" || file === null || !("data" in file)) {
        return null;
    }
    const fields = file as Record<string, unknown>;
    const version = fields.version;
    if (
        fields.format !== SAVE_FORMAT ||
        typeof version !== "number" ||
        !Number.isInteger(version) ||
        version < 1
    ) {
        return null;
    }
    const saved_at =
        typeof fields.saved_at === "string" ? Date.parse(fields.saved_at) : 0;
    const seconds = fields.seconds_played;
    return {
        slot,
        version,
        saved_at: Number.isFinite(saved_at) ? saved_at : 0,
        seconds_played:
            typeof seconds === "number" && seconds >= 0 ? seconds : 0,
        summary: typeof fields.summary === "string" ? fields.summary : "",
        problem: null,
    };
}

/** `20261118-201503`, in UTC: a name for a file kept aside. */
function stamp(ms: number): string {
    const iso = new Date(ms).toISOString();
    return `${iso.slice(0, 10).replaceAll("-", "")}-${iso.slice(11, 19).replaceAll(":", "")}`;
}

function message(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

/** `action()` as a promise: a store that throws instead of rejecting is the same. */
function call<R>(action: () => Promise<R>): Promise<R> {
    try {
        return Promise.resolve(action());
    } catch (error) {
        return Promise.reject(
            error instanceof Error ? error : new Error(String(error)),
        );
    }
}
