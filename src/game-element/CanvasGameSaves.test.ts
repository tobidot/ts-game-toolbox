/* eslint-disable @typescript-eslint/naming-convention -- slot names as keys, as a store holds them */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IntroGate } from "../stage/IntroGate";
import { SaveSlots } from "../storage/saves/SaveSlots";
import {
    memory_store,
    MemoryStore,
    SaveStore,
} from "../storage/saves/SaveStore";
import { CanvasGameElement } from "./CanvasGameElement";
import { CanvasGameLogic } from "./CanvasGameLogic";
import { CanvasGameProperties, UNPLACED } from "./CanvasGameProperties";
import { CanvasGameRenderer } from "./CanvasGameRenderer";
import { CanvasGameSettings } from "./CanvasGameSettings";
import { ago_text, SaveSlotChoice, SaveSlotsPage } from "./SaveSlotsPage";

interface Garden {
    day: number;
    bees: number;
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const LAYOUT = {
    width: 600,
    height: 400,
    slots: { left: 0, top: 0, width: 600, height: 400 },
};

class Settings extends CanvasGameSettings<typeof LAYOUT> {
    public override readonly layouts = [LAYOUT];
    public override readonly save_version = 2;
}

class TaggedSettings extends Settings {
    public override readonly save_tag = "garden";
}

class Properties extends CanvasGameProperties<Garden, Settings> {
    public override readonly saves = this.save_slots<Garden>({
        fresh: () => ({ day: 1, bees: 2 }),
        migrations: { 1: (old: { day: number }) => ({ ...old, bees: 2 }) },
        summary: (garden) => `Tag ${garden.day}`,
        page: null,
    });
    public readonly slots_page = this.place(
        new SaveSlotsPage(this.saves, UNPLACED, {
            slots: this.settings.save_slots,
        }),
        (layout) => layout.slots,
    );
}

/** A game that saves nothing: the shell leaves it alone. */
class PlainProperties extends CanvasGameProperties<Garden, Settings> {
    public constructor(settings: Settings, intro: IntroGate) {
        super(settings, intro);
    }
}

class Renderer extends CanvasGameRenderer<Garden, Settings> {
    protected paint(): void {}
}

class Logic extends CanvasGameLogic<Garden, Settings, Properties> {
    protected create_game(): Garden {
        return { day: 1, bees: 2 };
    }
}

class PlainLogic extends CanvasGameLogic<Garden, Settings, PlainProperties> {
    protected create_game(): Garden {
        return { day: 1, bees: 2 };
    }
}

/** The host's store: what a framework like game-boot hands in. */
const host_stores = new Map<string, MemoryStore>();

class SavingElement extends CanvasGameElement<Logic> {
    public readonly asked: string[] = [];
    public readonly logic = this.assemble({
        settings: Settings,
        properties: Properties,
        renderer: Renderer,
        logic: Logic,
    });

    protected override open_save_store(tag: string): Promise<SaveStore> {
        this.asked.push(tag);
        const store =
            host_stores.get(tag) ?? memory_store({}, `/saves/${tag}/`);
        host_stores.set(tag, store);
        return Promise.resolve(store);
    }
}

class TaggedElement extends CanvasGameElement<Logic> {
    public readonly asked: string[] = [];
    public readonly logic = this.assemble({
        settings: TaggedSettings,
        properties: Properties,
        renderer: Renderer,
        logic: Logic,
    });

    protected override open_save_store(tag: string): Promise<SaveStore> {
        this.asked.push(tag);
        return Promise.resolve(memory_store());
    }
}

/** No framework: the default hook keeps the saves in local storage. */
class LocalElement extends CanvasGameElement<Logic> {
    public readonly logic = this.assemble({
        settings: Settings,
        properties: Properties,
        renderer: Renderer,
        logic: Logic,
    });
}

class PlainElement extends CanvasGameElement<PlainLogic> {
    public readonly logic = this.assemble({
        settings: Settings,
        properties: PlainProperties,
        renderer: Renderer,
        logic: PlainLogic,
    });
}

customElements.define("test-saving", SavingElement);
customElements.define("test-saving-tagged", TaggedElement);
customElements.define("test-saving-local", LocalElement);
customElements.define("test-saving-plain", PlainElement);

function connect<E extends HTMLElement>(tag: string): E {
    const $element = document.createElement(tag) as E;
    $element.setAttribute("init-intro", "false");
    document.body.append($element);
    return $element;
}

/** A save file of `version` as the slots write it. */
function save_text(version: number, data: unknown, saved_at: string): string {
    return JSON.stringify({
        format: "ts-game-toolbox/save",
        version,
        saved_at,
        seconds_played: 0,
        summary: `Tag ${(data as Garden).day}`,
        data,
    });
}

describe("saves in the game shell", () => {
    beforeEach(() => {
        host_stores.clear();
        localStorage.clear();
        vi.spyOn(console, "warn").mockImplementation(() => {});
        vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
            new Proxy(
                {},
                {
                    get: (_target, key) =>
                        key === "measureText" ? () => ({ width: 10 }) : vi.fn(),
                    set: () => true,
                },
            ) as unknown as CanvasRenderingContext2D,
        );
    });

    afterEach(() => {
        vi.useRealTimers();
        document.body.innerHTML = "";
        localStorage.clear();
        vi.restoreAllMocks();
    });

    it("builds the game's slots in its save version and hands them the host's store, once, named by the tag", async () => {
        const $element = connect<SavingElement>("test-saving");
        const saves = $element.logic.properties.saves;
        expect(saves.version).toBe(2);
        $element.remove();
        document.body.append($element);
        expect($element.asked).toEqual(["test-saving"]);
        await saves.save("slot-1", { day: 3, bees: 2 });
        expect(host_stores.get("test-saving")?.files.has("slot-1")).toBe(true);
        expect(await saves.where()).toBe("/saves/test-saving/");
    });

    it("names the store by settings.save_tag when the game gives one", () => {
        const $element = connect<TaggedElement>("test-saving-tagged");
        expect($element.asked).toEqual(["garden"]);
    });

    it("keeps the saves in local storage under the tag without a host", async () => {
        const $element = connect<LocalElement>("test-saving-local");
        await $element.logic.properties.saves.save("slot-2", {
            day: 4,
            bees: 2,
        });
        expect(localStorage.getItem("test-saving-local/slot-2")).toContain(
            '"day": 4',
        );
        expect(await $element.logic.properties.saves.where()).toBe("Browser");
    });

    it("saves once more when the element leaves the page and autosaves on when it comes back", async () => {
        vi.useFakeTimers();
        const $element = connect<SavingElement>("test-saving");
        const saves = $element.logic.properties.saves;
        let day = 1;
        saves.autosave("slot-1", () => ({ day, bees: 2 }), 10);
        day = 5;
        $element.remove();
        await vi.advanceTimersByTimeAsync(0);
        const store = host_stores.get("test-saving")!;
        expect(JSON.parse(store.files.get("slot-1")!).data.day).toBe(5);
        day = 6;
        await vi.advanceTimersByTimeAsync(30_000);
        expect(JSON.parse(store.files.get("slot-1")!).data.day).toBe(5);
        document.body.append($element);
        await vi.advanceTimersByTimeAsync(10_000);
        expect(JSON.parse(store.files.get("slot-1")!).data.day).toBe(6);
        vi.useRealTimers();
    });

    it("leaves a game without saves alone", () => {
        const $element = connect<PlainElement>("test-saving-plain");
        expect($element.logic.properties.saves).toBeNull();
        $element.remove();
    });
});

describe("SaveSlotsPage", () => {
    const NOW = Date.UTC(2026, 10, 18, 20, 0, 0);

    function make_page(files: Record<string, string> = {}) {
        const store = memory_store(files);
        const saves = new SaveSlots<Garden>({
            version: 2,
            fresh: () => ({ day: 1, bees: 2 }),
            migrations: { 1: (old: { day: number }) => ({ ...old, bees: 2 }) },
            summary: (garden) => `Tag ${garden.day}`,
            store,
            page: null,
            now: () => NOW,
        });
        const page = new SaveSlotsPage(
            saves,
            { left: 0, top: 0, width: 600, height: 400 },
            { now: () => NOW },
        );
        const chosen: SaveSlotChoice[] = [];
        page.on_choose = (choice) => chosen.push(choice);
        return { store, saves, page, chosen };
    }

    /** Labels and hints of the open level. */
    function rows(page: SaveSlotsPage) {
        const menu = page.input.menu;
        return menu.entries.map(
            (entry) => `${entry.label} | ${menu.hint_of(entry)}`,
        );
    }

    it("shows three slots with their summaries and when they were played, and a way to delete", async () => {
        const { page } = make_page({
            "slot-1": save_text(
                2,
                { day: 12, bees: 3 },
                "2026-11-18T19:57:00Z",
            ),
            "slot-3": save_text(1, { day: 4 }, "2026-11-16T20:00:00Z"),
        });
        await page.refresh();
        expect(rows(page)).toEqual([
            "Platz 1 | Tag 12 · vor 3 Min.",
            "Platz 2 | leer · neues Spiel",
            "Platz 3 | Tag 4 · vor 2 Tagen",
            "Löschen … | einen Spielstand löschen",
        ]);
        expect(page.headers.get("slot-1")?.summary).toBe("Tag 12");
    });

    it("starts with the cursor on the slot played last", async () => {
        const { page } = make_page({
            "slot-1": save_text(2, { day: 3, bees: 2 }, "2026-11-17T10:00:00Z"),
            "slot-3": save_text(2, { day: 9, bees: 2 }, "2026-11-18T19:00:00Z"),
        });
        await page.refresh();
        expect(page.input.menu.cursor).toBe(2);
        page.input.handle_key("ArrowUp");
        await page.refresh();
        expect(page.input.menu.cursor).toBe(1);
    });

    it("continues a filled slot and starts a new game in an empty one", async () => {
        const { page, chosen } = make_page({
            "slot-1": save_text(
                2,
                { day: 12, bees: 3 },
                "2026-11-18T19:57:00Z",
            ),
        });
        await page.refresh();
        page.input.handle_key("1");
        page.input.handle_key("2");
        expect(chosen).toEqual([
            { action: "continue", slot: "slot-1" },
            { action: "new", slot: "slot-2" },
        ]);
    });

    it("deletes a slot only after a confirm, then lists it empty", async () => {
        const { page, chosen, store } = make_page({
            "slot-1": save_text(
                2,
                { day: 12, bees: 3 },
                "2026-11-18T19:57:00Z",
            ),
            "slot-2": save_text(2, { day: 2, bees: 3 }, "2026-11-18T19:00:00Z"),
        });
        await page.refresh();
        const input = page.input;
        input.handle_key("l");
        expect(rows(page)).toEqual([
            "Platz 1 | Tag 12",
            "Platz 2 | Tag 2",
            "Zurück | ",
        ]);
        input.handle_key("Enter");
        expect(rows(page)).toEqual([
            "Ja, Platz 1 löschen | Tag 12 ist dann weg",
            "Nein, behalten | ",
        ]);
        input.handle_key("ArrowDown");
        input.handle_key("Enter");
        expect(store.files.has("slot-1")).toBe(true);
        input.handle_key("Enter");
        input.handle_key("Enter");
        await flush();
        await flush();
        expect(store.files.has("slot-1")).toBe(false);
        expect(chosen).toEqual([{ action: "remove", slot: "slot-1" }]);
        expect(input.menu.levels.length).toBe(1);
        expect(rows(page)[0]).toBe("Platz 1 | leer · neues Spiel");
    });

    it("follows saves made elsewhere", async () => {
        const { page, saves } = make_page();
        await page.refresh();
        await saves.save("slot-2", { day: 7, bees: 2 });
        await flush();
        expect(rows(page)[1]).toBe("Platz 2 | Tag 7 · gerade eben");
        expect(rows(page).at(-1)).toBe("Löschen … | einen Spielstand löschen");
    });

    it("offers a fresh start on a broken or newer save, and says the file stays", async () => {
        const { page, chosen } = make_page({
            "slot-1": "kaputt",
            "slot-2": save_text(9, { day: 1 }, "2026-11-18T19:00:00Z"),
        });
        await page.refresh();
        expect(rows(page).slice(0, 2)).toEqual([
            "Platz 1 | beschädigt · neu beginnen, die Datei bleibt",
            "Platz 2 | von einer neueren Version · neu beginnen, die Datei bleibt",
        ]);
        page.input.handle_key("1");
        expect(chosen).toEqual([{ action: "new", slot: "slot-1" }]);
    });

    it("says how long ago in words one reads at a glance", () => {
        expect(ago_text(20)).toBe("gerade eben");
        expect(ago_text(61)).toBe("vor 1 Min.");
        expect(ago_text(3 * 3600 + 5)).toBe("vor 3 Std.");
        expect(ago_text(86400 * 1.5)).toBe("vor 1 Tag");
        expect(ago_text(86400 * 9)).toBe("vor 9 Tagen");
    });
});
