import { describe, it, expect, vi, beforeEach } from "vitest";
import { AssetManager } from "./AssetManager";
import { Progress } from "../../flow";

describe("AssetManager", () => {
    let asset_manager: AssetManager;
    let progress: Progress;

    beforeEach(() => {
        asset_manager = new AssetManager();
        progress = new Progress();

        // Mocking Image and Audio for JSDOM environment
        // In JSDOM, Image and Audio exist but we might need to trigger events manually
        // or mock them if we want to avoid real network requests (though they are just set to src)
    });

    it("should initialize with empty maps", () => {
        expect(asset_manager.images.size).toBe(0);
        expect(asset_manager.audios.size).toBe(0);
        expect(asset_manager.list_pending().length).toBe(0);
    });

    it("should load images correctly", async () => {
        const assets = {
            test_image: "test-url.png",
        };

        let resolve_load: () => void;
        const load_promise = new Promise<void>((r) => (resolve_load = r));

        // We need to mock Image behavior because JSDOM doesn't actually load images
        const image_mock = function () {
            return {
                addEventListener: vi.fn((event, cb) => {
                    if (event === "load") {
                        setTimeout(() => {
                            cb();
                            resolve_load();
                        }, 10);
                    }
                }),
                set src(val: string) {},
                set crossOrigin(val: string) {},
            };
        };
        vi.stubGlobal("Image", image_mock);

        const asset_promise = asset_manager.load_images(assets, progress);

        expect(asset_manager.list_pending()).toContain("test_image");

        await asset_promise;
        await load_promise;

        expect(asset_manager.images.has("test_image")).toBe(true);
        expect(asset_manager.images.get("test_image")?.url).toBe(
            "test-url.png",
        );
        expect(asset_manager.list_pending().length).toBe(0);
        expect(progress.get_percent()).toBe(1);
    });

    it("should load audio correctly", async () => {
        const assets = {
            test_audio: "test-url.mp3",
        };

        let resolve_can_play: () => void;
        const can_play_promise = new Promise<void>(
            (r) => (resolve_can_play = r),
        );

        const audio_mock = function () {
            return {
                addEventListener: vi.fn((event, cb) => {
                    if (event === "canplay") {
                        setTimeout(() => {
                            cb();
                            resolve_can_play();
                        }, 10);
                    }
                }),
                load: vi.fn(),
                set src(val: string) {},
                set crossOrigin(val: string) {},
                set preload(val: string) {},
            };
        };
        vi.stubGlobal("Audio", audio_mock);

        const asset_promise = asset_manager.load_audio(assets, progress);

        expect(asset_manager.list_pending()).toContain("test_audio");

        await asset_promise;
        await can_play_promise;

        expect(asset_manager.audios.has("test_audio")).toBe(true);
        expect(asset_manager.audios.get("test_audio")?.url).toBe(
            "test-url.mp3",
        );
        expect(asset_manager.list_pending().length).toBe(0);
        expect(progress.get_percent()).toBe(1);
    });

    it("should handle image load error", async () => {
        const assets = {
            fail_image: "fail-url.png",
        };

        let resolve_error: () => void;
        const error_promise = new Promise<void>((r) => (resolve_error = r));

        const image_mock = function () {
            return {
                addEventListener: vi.fn((event, cb) => {
                    if (event === "error") {
                        setTimeout(() => {
                            cb();
                            resolve_error();
                        }, 10);
                    }
                }),
                set src(val: string) {},
                set crossOrigin(val: string) {},
            };
        };
        vi.stubGlobal("Image", image_mock);
        vi.spyOn(console, "warn").mockImplementation(() => {});

        try {
            await asset_manager.load_images(assets, progress);
        } catch {
            // expected
        }
        await error_promise;

        expect(asset_manager.images.has("fail_image")).toBe(true); // It sets it before loading
        expect(console.warn).toHaveBeenCalledWith(
            "Failed to load image",
            "fail-url.png",
        );
        expect(progress.get_percent()).toBe(1); // Progress is marked as done even on error in implementation
    });

    it("should load combined assets", async () => {
        const assets = {
            images: { img1: "img1.png" },
            audio: { aud1: "aud1.mp3" },
        };

        let resolve_img: () => void;
        const img_promise = new Promise<void>((r) => (resolve_img = r));
        let resolve_aud: () => void;
        const aud_promise = new Promise<void>((r) => (resolve_aud = r));

        const image_mock = function () {
            return {
                addEventListener: vi.fn((event, cb) => {
                    if (event === "load") {
                        setTimeout(() => {
                            cb();
                            resolve_img();
                        }, 10);
                    }
                }),
                set src(val: string) {},
                set crossOrigin(val: string) {},
            };
        };
        const audio_mock = function () {
            return {
                addEventListener: vi.fn((event, cb) => {
                    if (event === "canplay") {
                        setTimeout(() => {
                            cb();
                            resolve_aud();
                        }, 10);
                    }
                }),
                load: vi.fn(),
                set src(val: string) {},
                set crossOrigin(val: string) {},
                set preload(val: string) {},
            };
        };

        vi.stubGlobal("Image", image_mock);
        vi.stubGlobal("Audio", audio_mock);

        await asset_manager.load(assets, progress);
        await Promise.all([img_promise, aud_promise]);

        expect(asset_manager.images.has("img1")).toBe(true);
        expect(asset_manager.audios.has("aud1")).toBe(true);
        expect(progress.get_percent()).toBe(1);
    });

    it("should track multiple pending assets with timing", async () => {
        vi.useFakeTimers();
        const assets = {
            a: "urlA",
            b: "urlB",
        };

        let resolve_a: (value: void | PromiseLike<void>) => void;
        let resolve_b: (value: void | PromiseLike<void>) => void;

        const p_a = new Promise<void>((r) => (resolve_a = r));
        const p_b = new Promise<void>((r) => (resolve_b = r));

        let call_count = 0;
        const callback = vi.fn(() => {
            return call_count++ === 0 ? p_a : p_b;
        });

        const load_promise = asset_manager.load_assets(
            assets,
            progress,
            callback as any,
        );

        expect(asset_manager.list_pending()).toEqual(["a", "b"]);

        vi.advanceTimersByTime(100);
        resolve_a!(undefined);
        await p_a; // Ensure p_a is settled

        expect(asset_manager.list_pending()).toEqual(["b"]);

        vi.advanceTimersByTime(200);
        resolve_b!(undefined);
        await p_b; // Ensure p_b is settled

        expect(asset_manager.list_pending()).toEqual([]);

        await load_promise;
        vi.useRealTimers();
    });
});
