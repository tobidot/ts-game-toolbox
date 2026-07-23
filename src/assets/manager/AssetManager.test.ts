import { describe, it, expect, vi, beforeEach } from "vitest";
import { AssetManager } from "./AssetManager";
import { Progress } from "../../flow";

describe("AssetManager", () => {
    let assetManager: AssetManager;
    let progress: Progress;

    beforeEach(() => {
        assetManager = new AssetManager();
        progress = new Progress();
        
        // Mocking Image and Audio for JSDOM environment
        // In JSDOM, Image and Audio exist but we might need to trigger events manually
        // or mock them if we want to avoid real network requests (though they are just set to src)
    });

    it("should initialize with empty maps", () => {
        expect(assetManager.images.size).toBe(0);
        expect(assetManager.audios.size).toBe(0);
        expect(assetManager.list_pending().length).toBe(0);
    });

    it("should load images correctly", async () => {
        const assets = {
            "test-image": "test-url.png"
        };

        let resolveLoad: () => void;
        const loadPromise = new Promise<void>((r) => resolveLoad = r);

        // We need to mock Image behavior because JSDOM doesn't actually load images
        const imageMock = function() {
            return {
                addEventListener: vi.fn((event, cb) => {
                    if (event === "load") {
                        setTimeout(() => {
                            cb();
                            resolveLoad();
                        }, 10);
                    }
                }),
                set src(val: string) {},
                set crossOrigin(val: string) {}
            };
        };
        vi.stubGlobal("Image", imageMock);

        const assetPromise = assetManager.load_images(assets, progress);
        
        expect(assetManager.list_pending()).toContain("test-image");
        
        await assetPromise;
        await loadPromise;

        expect(assetManager.images.has("test-image")).toBe(true);
        expect(assetManager.images.get("test-image")?.url).toBe("test-url.png");
        expect(assetManager.list_pending().length).toBe(0);
        expect(progress.get_percent()).toBe(1);
    });

    it("should load audio correctly", async () => {
        const assets = {
            "test-audio": "test-url.mp3"
        };

        let resolveCanPlay: () => void;
        const canPlayPromise = new Promise<void>((r) => resolveCanPlay = r);

        const audioMock = function() {
            return {
                addEventListener: vi.fn((event, cb) => {
                    if (event === "canplay") {
                        setTimeout(() => {
                            cb();
                            resolveCanPlay();
                        }, 10);
                    }
                }),
                load: vi.fn(),
                set src(val: string) {},
                set crossOrigin(val: string) {},
                set preload(val: string) {}
            };
        };
        vi.stubGlobal("Audio", audioMock);

        const assetPromise = assetManager.load_audio(assets, progress);
        
        expect(assetManager.list_pending()).toContain("test-audio");
        
        await assetPromise;
        await canPlayPromise;

        expect(assetManager.audios.has("test-audio")).toBe(true);
        expect(assetManager.audios.get("test-audio")?.url).toBe("test-url.mp3");
        expect(assetManager.list_pending().length).toBe(0);
        expect(progress.get_percent()).toBe(1);
    });

    it("should handle image load error", async () => {
        const assets = {
            "fail-image": "fail-url.png"
        };

        let resolveError: () => void;
        const errorPromise = new Promise<void>((r) => resolveError = r);

        const imageMock = function() {
            return {
                addEventListener: vi.fn((event, cb) => {
                    if (event === "error") {
                        setTimeout(() => {
                            cb();
                            resolveError();
                        }, 10);
                    }
                }),
                set src(val: string) {},
                set crossOrigin(val: string) {}
            };
        };
        vi.stubGlobal("Image", imageMock);
        vi.spyOn(console, "warn").mockImplementation(() => {});

        try {
            await assetManager.load_images(assets, progress);
        } catch (e) {
            // expected
        }
        await errorPromise;

        expect(assetManager.images.has("fail-image")).toBe(true); // It sets it before loading
        expect(console.warn).toHaveBeenCalledWith("Failed to load image", "fail-url.png");
        expect(progress.get_percent()).toBe(1); // Progress is marked as done even on error in implementation
    });

    it("should load combined assets", async () => {
        const assets = {
            images: { "img1": "img1.png" },
            audio: { "aud1": "aud1.mp3" }
        };

        let resolveImg: () => void;
        const imgPromise = new Promise<void>((r) => resolveImg = r);
        let resolveAud: () => void;
        const audPromise = new Promise<void>((r) => resolveAud = r);

        const imageMock = function() {
            return {
                addEventListener: vi.fn((event, cb) => {
                    if (event === "load") {
                        setTimeout(() => {
                            cb();
                            resolveImg();
                        }, 10);
                    }
                }),
                set src(val: string) {},
                set crossOrigin(val: string) {}
            };
        };
        const audioMock = function() {
            return {
                addEventListener: vi.fn((event, cb) => {
                    if (event === "canplay") {
                        setTimeout(() => {
                            cb();
                            resolveAud();
                        }, 10);
                    }
                }),
                load: vi.fn(),
                set src(val: string) {},
                set crossOrigin(val: string) {},
                set preload(val: string) {}
            };
        };

        vi.stubGlobal("Image", imageMock);
        vi.stubGlobal("Audio", audioMock);

        await assetManager.load(assets, progress);
        await Promise.all([imgPromise, audPromise]);

        expect(assetManager.images.has("img1")).toBe(true);
        expect(assetManager.audios.has("aud1")).toBe(true);
        expect(progress.get_percent()).toBe(1);
    });

    it("should track multiple pending assets with timing", async () => {
        vi.useFakeTimers();
        const assets = {
            "a": "urlA",
            "b": "urlB"
        };

        let resolveA: (value: void | PromiseLike<void>) => void;
        let resolveB: (value: void | PromiseLike<void>) => void;

        const pA = new Promise<void>((r) => resolveA = r);
        const pB = new Promise<void>((r) => resolveB = r);

        let callCount = 0;
        const callback = vi.fn(() => {
            return callCount++ === 0 ? pA : pB;
        });

        const loadPromise = assetManager.load_assets(assets, progress, callback as any);

        expect(assetManager.list_pending()).toEqual(["a", "b"]);
        
        vi.advanceTimersByTime(100);
        resolveA!(undefined);
        await pA; // Ensure pA is settled

        expect(assetManager.list_pending()).toEqual(["b"]);

        vi.advanceTimersByTime(200);
        resolveB!(undefined);
        await pB; // Ensure pB is settled

        expect(assetManager.list_pending()).toEqual([]);
        
        await loadPromise;
        vi.useRealTimers();
    });
});
