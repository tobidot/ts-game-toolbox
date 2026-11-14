import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AssetKind, AssetManager, AssetManagerOptions } from "./AssetManager";

/** A media element that loads only when the test says so. */
class FakeElement {
    public readonly listeners = new Map<string, Array<() => void>>();
    public src = "";
    public preload = "";
    public crossOrigin: string | null = null;

    public constructor(public readonly kind: AssetKind) {}

    public addEventListener(type: string, listener: () => void): void {
        this.listeners.set(type, [
            ...(this.listeners.get(type) ?? []),
            listener,
        ]);
    }

    public removeEventListener(type: string, listener: () => void): void {
        this.listeners.set(
            type,
            (this.listeners.get(type) ?? []).filter(
                (each) => each !== listener,
            ),
        );
    }

    public load(): void {}

    public fire(type: string): void {
        for (const listener of this.listeners.get(type) ?? []) {
            listener();
        }
    }
}

const ORIGIN = "https://example.org";

/** A response whose body arrives in the chunks given. */
function streamed(chunks: number[], status: number = 200): Response {
    const body = new ReadableStream<Uint8Array>({
        start(controller) {
            for (const size of chunks) {
                controller.enqueue(new Uint8Array(size));
            }
            controller.close();
        },
    });
    const total = chunks.reduce((sum, size) => sum + size, 0);
    return new Response(status === 200 ? body : null, {
        status,
        headers: new Headers([
            ["Content-Length", String(total)],
            ["Content-Type", "image/png"],
        ]),
    });
}

/** Lets every promise that is ready run. */
async function settle(): Promise<void> {
    for (let index = 0; index < 10; index++) {
        await Promise.resolve();
    }
}

describe("AssetManager.request", () => {
    let elements: FakeElement[];
    let options: AssetManagerOptions;

    beforeEach(() => {
        elements = [];
        options = {
            origin: ORIGIN,
            fetch: () => Promise.reject(new Error("no network in this test")),
            create_element: (kind) => {
                const element = new FakeElement(kind);
                elements.push(element);
                return element as unknown as HTMLImageElement;
            },
        };
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    const element_of = (url: string): FakeElement => {
        const found = elements.find((element) => element.src === url);
        if (found === undefined) {
            throw new Error(`nothing loads ${url}`);
        }
        return found;
    };

    it("loads a few at a time, the lowest priority first, ties in the order asked", async () => {
        const manager = new AssetManager(options);
        manager.max_parallel = 2;
        manager.request({
            name: "a",
            url: "https://cdn.test/a.png",
            kind: "image",
            priority: 5,
        });
        manager.request({
            name: "b",
            url: "https://cdn.test/b.png",
            kind: "image",
            priority: 1,
        });
        manager.request({
            name: "c",
            url: "https://cdn.test/c.png",
            kind: "image",
            priority: 1,
        });
        manager.request({
            name: "d",
            url: "https://cdn.test/d.png",
            kind: "image",
            priority: 0,
        });
        // a and b start at once: there was room. Then d, which came later but is lower.
        expect(manager.loads.get("a")?.state).toBe("loading");
        expect(manager.loads.get("b")?.state).toBe("loading");
        expect(manager.loads.get("c")?.state).toBe("queued");
        expect(manager.loads.get("d")?.state).toBe("queued");
        element_of("https://cdn.test/a.png").fire("load");
        await settle();
        expect(manager.loads.get("d")?.state).toBe("loading");
        expect(manager.loads.get("c")?.state).toBe("queued");
    });

    it("follows a priority changed while it loads", async () => {
        const manager = new AssetManager(options);
        manager.max_parallel = 1;
        for (const name of ["a", "b", "c"]) {
            manager.request({
                name,
                url: `https://cdn.test/${name}.png`,
                kind: "image",
                priority: 0,
            });
        }
        manager.set_priority("c", -1);
        element_of("https://cdn.test/a.png").fire("load");
        await settle();
        expect(manager.loads.get("c")?.state).toBe("loading");
        expect(manager.loads.get("b")?.state).toBe("queued");
        expect(manager.loads.get("c")?.priority).toBe(-1);
    });

    it("keeps progress per file and over all of them, a file that arrives later included", async () => {
        const manager = new AssetManager(options);
        const a = manager.request({
            name: "a",
            url: "https://cdn.test/a.png",
            kind: "image",
        });
        expect(a.progress.get_percent()).toBe(0);
        expect(manager.progress.get_percent()).toBe(0);
        element_of("https://cdn.test/a.png").fire("load");
        await settle();
        expect(a.state).toBe("ready");
        expect(a.progress.get_percent()).toBe(1);
        expect(manager.progress.get_percent()).toBe(1);
        manager.request({
            name: "b",
            url: "https://cdn.test/b.wav",
            kind: "audio",
        });
        expect(manager.progress.get_percent()).toBe(0.5);
        expect(manager.counts).toEqual({
            queued: 0,
            loading: 1,
            ready: 1,
            failed: 0,
        });
    });

    it("puts a ready file into images, audios or videos under its name", async () => {
        const manager = new AssetManager(options);
        manager.request({
            name: "pic",
            url: "https://cdn.test/a.png",
            kind: "image",
        });
        manager.request({
            name: "beep",
            url: "https://cdn.test/b.wav",
            kind: "audio",
        });
        manager.request({
            name: "film",
            url: "https://cdn.test/c.mp4",
            kind: "video",
        });
        expect(manager.images.has("pic")).toBe(false);
        element_of("https://cdn.test/a.png").fire("load");
        await settle();
        element_of("https://cdn.test/b.wav").fire("canplay");
        await settle();
        element_of("https://cdn.test/c.mp4").fire("loadeddata");
        await settle();
        expect(manager.images.get("pic")?.ready).toBe(true);
        expect(manager.audios.get("beep")?.url).toBe("https://cdn.test/b.wav");
        expect(manager.videos.get("film")?.ready).toBe(true);
        expect(element_of("https://cdn.test/b.wav").preload).toBe("auto");
    });

    it("asks for a foreign file without CORS, so it loads where no CORS header comes", async () => {
        const manager = new AssetManager(options);
        manager.request({
            name: "a",
            url: "https://cdn.test/a.png",
            kind: "image",
        });
        expect(element_of("https://cdn.test/a.png").crossOrigin).toBe(null);
    });

    it("ends a file that fails in the failed state, with a reason, and goes on", async () => {
        vi.spyOn(console, "warn").mockImplementation(() => {});
        const manager = new AssetManager(options);
        manager.max_parallel = 1;
        const broken = manager.request({
            name: "a",
            url: "https://cdn.test/a.png",
            kind: "image",
        });
        const next = manager.request({
            name: "b",
            url: "https://cdn.test/b.png",
            kind: "image",
        });
        element_of("https://cdn.test/a.png").fire("error");
        await settle();
        expect(broken.state).toBe("failed");
        expect(broken.reason).toBe("could not be loaded");
        expect(manager.images.has("a")).toBe(false);
        expect(next.state).toBe("loading");
        // A failed file is finished: the total doesn't hang on it.
        expect(manager.progress.get_percent()).toBe(0.5);
        expect(manager.counts.failed).toBe(1);
    });

    it("fails a file that takes longer than timeout_ms", async () => {
        vi.useFakeTimers();
        vi.spyOn(console, "warn").mockImplementation(() => {});
        const manager = new AssetManager(options);
        manager.timeout_ms = 1000;
        const slow = manager.request({
            name: "a",
            url: "https://cdn.test/a.png",
            kind: "image",
        });
        vi.advanceTimersByTime(999);
        expect(slow.state).toBe("loading");
        vi.advanceTimersByTime(1);
        expect(slow.state).toBe("failed");
        expect(slow.reason).toBe("timed out");
        // A late load event changes nothing.
        element_of("https://cdn.test/a.png").fire("load");
        await settle();
        expect(slow.state).toBe("failed");
    });

    it("gives the load it has for a name asked for again", async () => {
        const manager = new AssetManager(options);
        const first = manager.request({
            name: "a",
            url: "https://cdn.test/a.png",
            kind: "image",
        });
        const again = manager.request({
            name: "a",
            url: "https://cdn.test/a.png",
            kind: "image",
            priority: 3,
        });
        expect(again).toBe(first);
        expect(first.priority).toBe(3);
        expect(elements.length).toBe(1);
    });

    describe("a file it may fetch (same origin, or CORS)", () => {
        beforeEach(() => {
            for (const [key, value] of [
                ["createObjectURL", () => "blob:fake"],
                ["revokeObjectURL", () => {}],
            ] as const) {
                Object.defineProperty(URL, key, {
                    value: vi.fn(value),
                    configurable: true,
                });
            }
        });

        it("counts the bytes as they come, then loads them into the element", async () => {
            const fetch = vi.fn(() => Promise.resolve(streamed([300, 700])));
            const manager = new AssetManager({ ...options, fetch });
            const load = manager.request({
                name: "a",
                url: `${ORIGIN}/a.png`,
                kind: "image",
            });
            await settle();
            expect(fetch).toHaveBeenCalledTimes(1);
            expect(load.total_bytes).toBe(1000);
            expect(load.loaded_bytes).toBe(1000);
            expect(load.state).toBe("loading");
            expect(load.progress.get_percent()).toBeGreaterThanOrEqual(0.9);
            expect(load.progress.get_percent()).toBeLessThan(1);
            element_of("blob:fake").fire("load");
            await settle();
            expect(load.state).toBe("ready");
            expect(manager.images.get("a")?.url).toBe("blob:fake");
            expect(manager.loaded_bytes).toBe(1000);
        });

        it("fetches a foreign file only when it says cors", async () => {
            const fetch = vi.fn(() => Promise.resolve(streamed([10])));
            const manager = new AssetManager({ ...options, fetch });
            manager.request({
                name: "a",
                url: "https://cdn.test/a.png",
                kind: "image",
            });
            manager.request({
                name: "b",
                url: "https://cdn.test/b.png",
                kind: "image",
                cors: true,
            });
            manager.request({
                name: "c",
                url: "data:image/png;base64,AAAA",
                kind: "image",
            });
            await settle();
            expect(fetch).toHaveBeenCalledTimes(1);
            expect(fetch.mock.calls[0]).toContain("https://cdn.test/b.png");
        });

        it("names the HTTP status of a file that isn't there", async () => {
            vi.spyOn(console, "warn").mockImplementation(() => {});
            const manager = new AssetManager({
                ...options,
                fetch: () => Promise.resolve(streamed([], 404)),
            });
            const load = manager.request({
                name: "a",
                url: `${ORIGIN}/missing.png`,
                kind: "image",
            });
            await settle();
            expect(load.state).toBe("failed");
            expect(load.reason).toBe("HTTP 404");
            expect(elements.length).toBe(0);
        });
    });
});
