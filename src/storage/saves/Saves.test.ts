/* eslint-disable @typescript-eslint/naming-convention -- slot names and version numbers as keys, as a store holds them */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    default_save_store,
    local_storage_store,
    memory_store,
    SaveStore,
} from "./SaveStore";
import {
    PageHideSource,
    SAVE_FORMAT,
    SaveEvent,
    SaveSlots,
    SaveSlotsOptions,
} from "./SaveSlots";

/** The garden of these tests: version 3 has bees (since 2) and a basket per herb (since 3). */
interface Garden {
    day: number;
    herbs: string[];
    bees: number;
    basket: Record<string, number>;
}

const new_garden = (): Garden => ({
    day: 1,
    herbs: [],
    bees: 2,
    basket: {},
});

/** Version 1 had no bees, version 2 kept the basket as one number. */
const MIGRATIONS = {
    1: (old: { day: number; herbs: string[]; basket: number }) => ({
        ...old,
        bees: 2,
    }),
    2: (old: {
        day: number;
        herbs: string[];
        bees: number;
        basket: number;
    }) => ({
        ...old,
        basket: { kresse: old.basket },
    }),
};

/** A clock the test moves. */
function test_clock(start = Date.UTC(2026, 10, 18, 20, 0, 0)) {
    const clock = { ms: start, now: () => clock.ms };
    return clock;
}

/** A page whose hiding the test triggers. */
function test_page() {
    const listeners = new Set<() => void>();
    const page: PageHideSource & { hide(): void; listeners: number } = {
        on_hide(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        hide() {
            for (const listener of listeners) {
                listener();
            }
        },
        get listeners() {
            return listeners.size;
        },
    };
    return page;
}

function make_saves(
    store: SaveStore,
    options: Partial<SaveSlotsOptions<Garden>> = {},
): SaveSlots<Garden> {
    return new SaveSlots<Garden>({
        version: 3,
        fresh: new_garden,
        migrations: MIGRATIONS,
        store,
        page: null,
        ...options,
    });
}

/** A save file as the slots write it, of any version. */
function save_text(version: number, data: unknown, extra: object = {}): string {
    return JSON.stringify({
        format: SAVE_FORMAT,
        version,
        saved_at: "2026-11-17T10:00:00.000Z",
        seconds_played: 60,
        summary: "",
        data,
        ...extra,
    });
}

/** Every event of `saves`, as kinds. */
function record(saves: SaveSlots<Garden>): SaveEvent[] {
    const events: SaveEvent[] = [];
    saves.events.attach(SaveEvent, (event) => events.push(event));
    return events;
}

/** A store that counts and may fail. */
function counting_store(fail: Partial<Record<keyof SaveStore, boolean>> = {}) {
    const inner = memory_store();
    const calls: string[] = [];
    const store: SaveStore = {
        label: "test",
        read: (name) => {
            calls.push(`read ${name}`);
            return fail.read === true
                ? Promise.reject(new Error("read failed"))
                : inner.read(name);
        },
        write: (name, text) => {
            calls.push(`write ${name}`);
            return fail.write === true
                ? Promise.reject(new Error("write failed"))
                : inner.write(name, text);
        },
        remove: (name) => {
            calls.push(`remove ${name}`);
            return fail.remove === true
                ? Promise.reject(new Error("remove failed"))
                : inner.remove(name);
        },
        list: () => {
            calls.push("list");
            return fail.list === true
                ? Promise.reject(new Error("list failed"))
                : inner.list();
        },
    };
    return { store, calls, inner };
}

describe("SaveStore", () => {
    it("keeps text in memory, lists the names and forgets removed ones", async () => {
        const store = memory_store();
        expect(await store.read("slot-1")).toBeNull();
        await store.write("slot-1", "eins");
        await store.write("slot-2", "zwei");
        expect(await store.read("slot-1")).toBe("eins");
        expect((await store.list()).sort()).toEqual(["slot-1", "slot-2"]);
        await store.remove("slot-1");
        await store.remove("nothing");
        expect(await store.list()).toEqual(["slot-2"]);
        expect(store.files.get("slot-2")).toBe("zwei");
    });

    it("keeps text in local storage under a prefix, apart from other games", async () => {
        localStorage.clear();
        localStorage.setItem("other-game/slot-1", "fremd");
        const store = local_storage_store("tce-garden/");
        await store.write("slot-1", "mein Garten");
        expect(localStorage.getItem("tce-garden/slot-1")).toBe("mein Garten");
        expect(await store.read("slot-1")).toBe("mein Garten");
        expect(await store.list()).toEqual(["slot-1"]);
        await store.remove("slot-1");
        expect(await store.read("slot-1")).toBeNull();
        expect(localStorage.getItem("other-game/slot-1")).toBe("fremd");
        localStorage.clear();
    });

    it("takes local storage when it is there and memory when it is not", () => {
        expect(default_save_store("x/").label).toBe("Browser");
        const denied = {
            get localStorage(): Storage {
                throw new Error("SecurityError");
            },
        };
        expect(default_save_store("x/", denied).label).toBe("Arbeitsspeicher");
    });
});

describe("SaveSlots", () => {
    let warn: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    });

    afterEach(() => {
        warn.mockRestore();
        vi.useRealTimers();
    });

    it("loads a fresh garden when nothing was saved", async () => {
        const saves = make_saves(memory_store());
        const events = record(saves);
        const loaded = await saves.load_save("slot-1");
        expect(loaded.outcome).toBe("empty");
        expect(loaded.header).toBeNull();
        expect(loaded.data).toEqual(new_garden());
        expect(await saves.load("slot-2")).toEqual(new_garden());
        expect(events.map((event) => event.kind)).toEqual(["fresh", "fresh"]);
        expect(warn).not.toHaveBeenCalled();
    });

    it("loads what it saved, as a copy, with a readable header", async () => {
        const clock = test_clock();
        const store = memory_store();
        const saves = make_saves(store, {
            now: clock.now,
            summary: (garden) =>
                `Tag ${garden.day}, ${garden.herbs.length} Kräuter`,
        });
        const garden: Garden = {
            day: 12,
            herbs: ["basilikum", "minze"],
            bees: 3,
            basket: { kresse: 4 },
        };
        await saves.load_save("slot-1");
        clock.ms += 90_000;
        expect(await saves.save("slot-1", garden)).toBe(true);
        garden.day = 99;
        const loaded = await saves.load_save("slot-1");
        expect(loaded.outcome).toBe("loaded");
        expect(loaded.data).toEqual({ ...garden, day: 12 });
        expect(loaded.header).toEqual({
            slot: "slot-1",
            version: 3,
            saved_at: clock.ms,
            seconds_played: 90,
            summary: "Tag 12, 2 Kräuter",
            problem: null,
        });
        const file = JSON.parse(store.files.get("slot-1")!);
        expect(file.format).toBe(SAVE_FORMAT);
        expect(file.saved_at).toBe("2026-11-18T20:01:30.000Z");
        expect(store.files.get("slot-1")).toContain('\n  "data": {');
    });

    it("counts the seconds played on from the loaded save", async () => {
        const clock = test_clock();
        const store = memory_store({
            "slot-1": save_text(3, new_garden(), { seconds_played: 600 }),
        });
        const saves = make_saves(store, { now: clock.now });
        await saves.load("slot-1");
        clock.ms += 30_000;
        await saves.save("slot-1", new_garden());
        expect((await saves.list())[0].seconds_played).toBe(630);
        await saves.save("slot-1", new_garden(), { seconds_played: 5 });
        clock.ms += 1_000;
        await saves.save("slot-1", new_garden());
        expect((await saves.list())[0].seconds_played).toBe(6);
    });

    it("migrates version 1 data through two steps up to the current version", async () => {
        const store = memory_store({
            "slot-1": save_text(1, { day: 4, herbs: ["kresse"], basket: 7 }),
        });
        const saves = make_saves(store);
        const events = record(saves);
        const loaded = await saves.load_save("slot-1");
        expect(loaded.outcome).toBe("migrated");
        expect(loaded.from_version).toBe(1);
        expect(loaded.data).toEqual({
            day: 4,
            herbs: ["kresse"],
            bees: 2,
            basket: { kresse: 7 },
        });
        expect(events.map((event) => event.kind)).toEqual(["migrated"]);
        expect(store.files.get("slot-1")).toContain('"version":1');
    });

    it("refuses migrations with a missing step when it is made, not when a player loads", () => {
        expect(() =>
            make_saves(memory_store(), {
                migrations: { 1: MIGRATIONS[1] },
            }),
        ).toThrow(/version 2 to 3/);
        expect(() =>
            make_saves(memory_store(), {
                migrations: { ...MIGRATIONS, 3: (old: unknown) => old },
            }),
        ).toThrow(/version 3/);
        expect(() =>
            make_saves(memory_store(), { version: 0, migrations: {} }),
        ).toThrow();
        // Starting at a later version is fine: older saves just can't be read.
        expect(() =>
            make_saves(memory_store(), { migrations: { 2: MIGRATIONS[2] } }),
        ).not.toThrow();
    });

    it("gives a fresh garden for broken JSON and keeps the broken text aside", async () => {
        const clock = test_clock();
        const store = memory_store({ "slot-1": '{"format": "ts-game-' });
        const saves = make_saves(store, { now: clock.now });
        const events = record(saves);
        const loaded = await saves.load_save("slot-1");
        expect(loaded.outcome).toBe("broken");
        expect(loaded.data).toEqual(new_garden());
        expect(loaded.reason).toMatch(/JSON/);
        expect(store.files.get("slot-1.broken-20261118-200000")).toBe(
            '{"format": "ts-game-',
        );
        await saves.save("slot-1", { ...new_garden(), day: 2 });
        expect(store.files.get("slot-1.broken-20261118-200000")).toBe(
            '{"format": "ts-game-',
        );
        expect(events.map((event) => event.kind)).toEqual([
            "broken",
            "kept",
            "saved",
        ]);
        expect(events[1].name).toBe("slot-1.broken-20261118-200000");
        expect(warn).toHaveBeenCalledTimes(1);
    });

    it("treats a file of another shape, a failing migration or a failed check as broken", async () => {
        const store = memory_store({
            a: JSON.stringify({ day: 3 }),
            b: save_text(2, { basket: null }),
            c: save_text(3, { day: "zwölf" }),
            d: save_text(0, {}),
        });
        const saves = make_saves(store, {
            migrations: {
                ...MIGRATIONS,
                2: () => {
                    throw new Error("kaputt");
                },
            },
            validate: (data) => {
                const garden = data as Garden;
                if (typeof garden.day !== "number") {
                    throw new Error("day is not a number");
                }
                return garden;
            },
        });
        for (const slot of ["a", "b", "c", "d"]) {
            const loaded = await saves.load_save(slot);
            expect(loaded.outcome).toBe("broken");
            expect(loaded.data).toEqual(new_garden());
        }
        expect((await saves.load_save("b")).reason).toMatch(/kaputt/);
        expect((await saves.load_save("c")).reason).toMatch(/day/);
        expect(warn).toHaveBeenCalledTimes(1);
    });

    it("never overwrites a save of a newer version: it is kept aside first", async () => {
        const clock = test_clock();
        const newer = save_text(4, { day: 50, herbs: [], bees: 9, rain: true });
        const store = memory_store({ "slot-1": newer });
        const saves = make_saves(store, { now: clock.now });
        const loaded = await saves.load_save("slot-1");
        expect(loaded.outcome).toBe("newer");
        expect(loaded.from_version).toBe(4);
        expect(loaded.data).toEqual(new_garden());
        await saves.save("slot-1", new_garden());
        expect(store.files.get("slot-1.newer-20261118-200000")).toBe(newer);
        const headers = await saves.list();
        expect(headers.map((header) => header.slot)).toEqual(["slot-1"]);
    });

    it("doesn't save over a file it could not keep aside", async () => {
        const { store, inner } = counting_store();
        await inner.write("slot-1", "kaputt");
        const saves = make_saves({
            ...store,
            write: (name, text) =>
                name === "slot-1"
                    ? inner.write(name, text)
                    : Promise.reject(new Error("full")),
        });
        const events = record(saves);
        await saves.load_save("slot-1");
        expect(await saves.save("slot-1", new_garden())).toBe(false);
        expect(inner.files.get("slot-1")).toBe("kaputt");
        expect(events.map((event) => event.kind)).toEqual([
            "broken",
            "failed",
            "failed",
        ]);
        await saves.remove("slot-1");
        expect(await saves.save("slot-1", new_garden())).toBe(true);
    });

    it("keeps a second broken file of the same second under another name", async () => {
        const clock = test_clock();
        const store = memory_store({ "slot-1": "eins" });
        const saves = make_saves(store, { now: clock.now });
        await saves.load_save("slot-1");
        await store.write("slot-1", "zwei");
        await saves.load_save("slot-1");
        expect(store.files.get("slot-1.broken-20261118-200000")).toBe("eins");
        expect(store.files.get("slot-1.broken-20261118-200000-2")).toBe("zwei");
    });

    it("ends ten quick saves with the last one, in fewer writes", async () => {
        const { store, calls, inner } = counting_store();
        const saves = make_saves(store);
        const results: Promise<boolean>[] = [];
        for (let day = 1; day <= 10; day++) {
            results.push(saves.save("slot-1", { ...new_garden(), day }));
        }
        expect(await Promise.all(results)).toEqual(Array(10).fill(true));
        expect(JSON.parse(inner.files.get("slot-1")!).data.day).toBe(10);
        const writes = calls.filter((call) => call === "write slot-1");
        expect(writes.length).toBeLessThanOrEqual(2);
    });

    it("writes in the order asked, and a remove waits its turn", async () => {
        const { store, calls } = counting_store();
        const saves = make_saves(store);
        void saves.save("slot-1", new_garden());
        void saves.save("slot-2", new_garden());
        void saves.remove("slot-1");
        await saves.flush();
        expect(calls).toEqual([
            "write slot-1",
            "write slot-2",
            "remove slot-1",
        ]);
    });

    it("never throws into the game when the store fails", async () => {
        const { store } = counting_store({
            read: true,
            write: true,
            remove: true,
            list: true,
        });
        const saves = make_saves(store);
        const events = record(saves);
        const loaded = await saves.load_save("slot-1");
        expect(loaded.outcome).toBe("unreachable");
        expect(loaded.data).toEqual(new_garden());
        expect(await saves.save("slot-1", new_garden())).toBe(false);
        expect(await saves.remove("slot-1")).toBe(false);
        expect(await saves.list()).toEqual([]);
        expect(await saves.export("slot-1")).toBeNull();
        expect(events.every((event) => event.is_problem)).toBe(true);
        expect(warn).toHaveBeenCalledTimes(1);
    });

    it("plays on in memory when the store can't be opened, and a store that throws is the same", async () => {
        const saves = make_saves(memory_store());
        const events = record(saves);
        saves.use_store(Promise.reject(new Error("no file system")));
        expect(await saves.save("slot-1", { ...new_garden(), day: 5 })).toBe(
            true,
        );
        expect((await saves.load("slot-1")).day).toBe(5);
        expect(await saves.where()).toBe("Arbeitsspeicher");
        expect(events[0].kind).toBe("failed");
        const throwing: SaveStore = {
            label: "wirft",
            read: () => {
                throw new Error("sync");
            },
            write: () => {
                throw new Error("sync");
            },
            remove: () => {
                throw new Error("sync");
            },
            list: () => {
                throw new Error("sync");
            },
        };
        saves.use_store(throwing);
        expect((await saves.load_save("slot-1")).outcome).toBe("unreachable");
        expect(await saves.save("slot-1", new_garden())).toBe(false);
    });

    it("doesn't throw on data JSON can't hold", async () => {
        const saves = make_saves(memory_store());
        const cyclic: Garden & { self?: unknown } = new_garden();
        cyclic.self = cyclic;
        expect(await saves.save("slot-1", cyclic)).toBe(false);
    });

    it("refuses a slot name that isn't one, as a bug", async () => {
        const saves = make_saves(memory_store());
        expect(() => saves.save("../etc", new_garden())).toThrow(/slot/);
        await expect(saves.load("a.b")).rejects.toThrow(/slot/);
    });

    it("lists headers only, newest first, the broken ones last", async () => {
        const clock = test_clock();
        const store = memory_store({ "slot-3": "kaputt" });
        const saves = make_saves(store, {
            now: clock.now,
            summary: (garden) => `Tag ${garden.day}`,
        });
        await saves.save("slot-1", { ...new_garden(), day: 1 });
        clock.ms += 1000;
        await saves.save("slot-2", { ...new_garden(), day: 2 });
        await store.write("slot-1.broken-20260101-000000", "alt");
        const headers = await saves.list();
        expect(headers.map((header) => [header.slot, header.summary])).toEqual([
            ["slot-2", "Tag 2"],
            ["slot-1", "Tag 1"],
            ["slot-3", ""],
        ]);
        expect(headers[2].problem).toBe("broken");
        expect(store.files.has("slot-3")).toBe(true);
    });

    it("removes a slot", async () => {
        const store = memory_store();
        const saves = make_saves(store);
        await saves.save("slot-1", new_garden());
        expect(await saves.remove("slot-1")).toBe(true);
        expect(await saves.list()).toEqual([]);
        expect((await saves.load_save("slot-1")).outcome).toBe("empty");
    });

    it("exports a slot as text and imports it into another, migrated", async () => {
        const store = memory_store({
            "slot-1": save_text(1, { day: 7, herbs: [], basket: 2 }),
        });
        const saves = make_saves(store);
        const text = await saves.export("slot-1");
        expect(text).toBe(store.files.get("slot-1"));
        expect(await saves.export("slot-2")).toBeNull();
        const imported = await saves.import(text!, "slot-2");
        expect(imported.outcome).toBe("migrated");
        expect(imported.data.bees).toBe(2);
        const copy = await saves.load_save("slot-2");
        expect(copy.outcome).toBe("loaded");
        expect(copy.data).toEqual(imported.data);
        expect(copy.header?.seconds_played).toBe(60);
    });

    it("imports nothing from a file that isn't a save", async () => {
        const store = memory_store();
        const saves = make_saves(store);
        const imported = await saves.import("<html>", "slot-1");
        expect(imported.outcome).toBe("broken");
        expect(store.files.size).toBe(0);
    });

    it("autosaves on a timer, at most once per interval, over ten minutes", async () => {
        vi.useFakeTimers();
        const { store, calls } = counting_store();
        const saves = make_saves(store);
        const garden = new_garden();
        saves.autosave("slot-1", () => garden, 5);
        expect(saves.autosave_slot).toBe("slot-1");
        for (let second = 0; second < 600; second++) {
            garden.day = second;
            await vi.advanceTimersByTimeAsync(1000);
        }
        const writes = calls.filter((call) => call === "write slot-1");
        expect(writes.length).toBe(120);
        saves.stop_autosave();
        await vi.advanceTimersByTimeAsync(60_000);
        expect(calls.filter((call) => call === "write slot-1").length).toBe(
            120,
        );
        expect(saves.autosave_slot).toBeNull();
    });

    it("autosaves when the page hides, and skips while the game has nothing to save", async () => {
        const page = test_page();
        const { store, calls } = counting_store();
        const saves = make_saves(store, { page });
        let garden: Garden | null = null;
        saves.autosave("slot-2", () => garden, 30);
        expect(page.listeners).toBe(1);
        page.hide();
        await saves.flush();
        expect(calls).toEqual([]);
        garden = { ...new_garden(), day: 3 };
        page.hide();
        await saves.flush();
        expect(calls).toEqual(["write slot-2"]);
        expect((await saves.load("slot-2")).day).toBe(3);
        saves.autosave("slot-3", () => garden, 30);
        expect(page.listeners).toBe(1);
        saves.stop_autosave();
        expect(page.listeners).toBe(0);
    });

    it("pauses an autosave with one last save and resumes it", async () => {
        vi.useFakeTimers();
        const page = test_page();
        const { store, calls } = counting_store();
        const saves = make_saves(store, { page });
        saves.autosave("slot-1", () => new_garden(), 10);
        saves.pause_autosave();
        await saves.flush();
        expect(calls).toEqual(["write slot-1"]);
        expect(page.listeners).toBe(0);
        await vi.advanceTimersByTimeAsync(60_000);
        expect(calls.length).toBe(1);
        saves.resume_autosave();
        expect(page.listeners).toBe(1);
        await vi.advanceTimersByTimeAsync(10_000);
        expect(calls.length).toBe(2);
        saves.resume_autosave();
        await vi.advanceTimersByTimeAsync(10_000);
        expect(calls.length).toBe(3);
    });

    it("loads the newest data even while a save of that slot is still on its way", async () => {
        const saves = make_saves(memory_store());
        void saves.save("slot-1", { ...new_garden(), day: 8 });
        expect((await saves.load("slot-1")).day).toBe(8);
    });

    it("says where it saves", async () => {
        const saves = make_saves(memory_store({}, "Dateien: /saves/garten"));
        expect(await saves.where()).toBe("Dateien: /saves/garten");
    });
});
