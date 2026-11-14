import { Progress } from "../../flow";

export interface PendingAsset {
    promise: Promise<void>;
    path: string;
    url: string;
    queued_at: number;
    finished_at: number | null;
}

export interface Asset<
    T extends
        | HTMLAudioElement
        | HTMLImageElement
        | HTMLVideoElement
        | SVGElement,
> {
    element: T;
    url: string;
    ready: boolean;
}

export type AssetKind = "image" | "audio" | "video";

type MediaElement = HTMLImageElement | HTMLAudioElement | HTMLVideoElement;

/** Where one requested file stands. */
export type AssetLoadState = "queued" | "loading" | "ready" | "failed";

/** One file for `AssetManager.request()`. */
export interface AssetRequest {
    /** The name it is kept under in `images`, `audios` or `videos`. */
    name: string;
    url: string;
    kind: AssetKind;
    /** Lower loads first; equal ones in the order asked for. Default 0. */
    priority?: number;
    /**
     * The file's server sends CORS headers, so a page on another origin may fetch its bytes.
     * Same-origin files are fetched anyway; anything else goes straight into its element.
     */
    cors?: boolean;
}

/** How one requested file is doing. `AssetManager.loads` keeps one per name. */
export class AssetLoad {
    public state: AssetLoadState = "queued";
    /** Why it failed: `HTTP 404`, `timed out`, `could not be loaded`, ...; null otherwise. */
    public reason: string | null = null;
    /** Bytes that arrived; only a fetched file counts them. */
    public loaded_bytes: number = 0;
    /** The file's size when the server said it (`Content-Length`). */
    public total_bytes: number | null = null;

    public constructor(
        public readonly name: string,
        public readonly url: string,
        public readonly kind: AssetKind,
        /** Lower loads first; `AssetManager.set_priority()` changes it. */
        public priority: number,
        public readonly cors: boolean,
        /** This file's share, 0 to 1: by bytes while they come, whole when it is ready or failed. */
        public readonly progress: Progress,
        /** The how-manieth request this was, for equal priorities. */
        public readonly order: number,
    ) {}

    /** Ready or failed: nothing more will happen to it. */
    public get is_finished(): boolean {
        return this.state === "ready" || this.state === "failed";
    }
}

/** What the browser gives `AssetManager`; a test passes fakes. */
export interface AssetManagerOptions {
    /** The network. Default: the global `fetch`; null never fetches. */
    fetch?: ((url: string, init?: RequestInit) => Promise<Response>) | null;
    /** Makes the element a file of `kind` is loaded into. */
    create_element?: (kind: AssetKind) => MediaElement;
    /** The page's origin: its files are fetched as bytes. Default: `location.origin`. */
    origin?: string | null;
}

/** The share of a fetched file's progress its bytes make; the rest is the element taking them. */
const BYTES_SHARE = 0.9;

/** Events that say an element of a kind can be used. */
const READY_EVENTS: Record<AssetKind, readonly string[]> = {
    image: ["load"],
    audio: ["canplay", "loadedmetadata"],
    video: ["loadeddata", "canplay"],
};

class AssetLoadError extends Error {}

function default_create_element(kind: AssetKind): MediaElement {
    if (kind === "image") {
        return new Image();
    }
    if (kind === "audio") {
        return new Audio();
    }
    return document.createElement("video");
}

/**
 * Loads pictures, sounds and videos and keeps them by name in `images`, `audios` and `videos`,
 * where the renderer's `paint_image()`, `AudioPlayer` and the widgets find them.
 *
 * `load_images()`, `load_audio()` and `load_videos()` take a record of names and URLs at once
 * (inlined files: `import.meta.glob("/assets/images/**\/*.png", { query: "url", eager: true,
 * import: 'default' })`). `request()` is for files off the network, many of them: they wait in
 * a queue and load `max_parallel` at a time, lowest `priority` first, which the game may change
 * while they wait (the ones scrolled into view first). Each has a state, a reason when it
 * failed and its own progress; `progress` is all of them. A file on the page's own origin (or
 * one with CORS) is fetched as bytes, so its progress follows them and a missing one says
 * `HTTP 404`; any other goes straight into its element, which loads without CORS.
 */
export class AssetManager {
    public audios: Map<string, Asset<HTMLAudioElement>>;
    public images: Map<string, Asset<HTMLImageElement>>;
    public videos: Map<string, Asset<HTMLVideoElement>>;
    /** Every file asked for with `request()`, by name. */
    public readonly loads = new Map<string, AssetLoad>();
    /** Every file asked for with `request()`; a failed one counts as finished. */
    public readonly progress = new Progress(0);
    /** How many requested files load at the same time. */
    public max_parallel: number = 4;
    /** A requested file that takes longer fails with `timed out`. */
    public timeout_ms: number = 30000;
    //
    protected pending: Array<PendingAsset> = [];
    private readonly queue: AssetLoad[] = [];
    private running: number = 0;
    private requests_made: number = 0;
    private readonly fetch_bytes:
        | ((url: string, init?: RequestInit) => Promise<Response>)
        | null;
    private readonly create_element: (kind: AssetKind) => MediaElement;
    private readonly origin: string | null;

    public constructor(options: AssetManagerOptions = {}) {
        this.audios = new Map<string, Asset<HTMLAudioElement>>();
        this.images = new Map<string, Asset<HTMLImageElement>>();
        this.videos = new Map<string, Asset<HTMLVideoElement>>();
        const global_fetch =
            typeof fetch === "function"
                ? (url: string, init?: RequestInit) => fetch(url, init)
                : null;
        this.fetch_bytes =
            options.fetch === undefined ? global_fetch : options.fetch;
        this.create_element = options.create_element ?? default_create_element;
        this.origin =
            options.origin !== undefined
                ? options.origin
                : typeof location !== "undefined"
                  ? location.origin
                  : null;
    }

    /**
     * Asks for one file. It waits for its turn, then loads; the returned `AssetLoad` follows it.
     * A name asked for again gets the load it already has, with the new priority when one is given.
     */
    public request(request: AssetRequest): AssetLoad {
        const known = this.loads.get(request.name);
        if (known !== undefined) {
            if (request.priority !== undefined) {
                this.set_priority(request.name, request.priority);
            }
            return known;
        }
        const load = new AssetLoad(
            request.name,
            request.url,
            request.kind,
            request.priority ?? 0,
            request.cors ?? false,
            this.progress.append_child_progress(),
            this.requests_made,
        );
        this.requests_made += 1;
        this.loads.set(load.name, load);
        this.queue.push(load);
        this.pump();
        return load;
    }

    /** Changes when a waiting file loads; one that already loads goes on. */
    public set_priority(name: string, priority: number): void {
        const load = this.loads.get(name);
        if (load !== undefined) {
            load.priority = priority;
        }
    }

    /** How many requested files are in each state. */
    public get counts(): Record<AssetLoadState, number> {
        const counts = { queued: 0, loading: 0, ready: 0, failed: 0 };
        for (const load of this.loads.values()) {
            counts[load.state] += 1;
        }
        return counts;
    }

    /** Bytes of the fetched files so far. */
    public get loaded_bytes(): number {
        let bytes = 0;
        for (const load of this.loads.values()) {
            bytes += load.loaded_bytes;
        }
        return bytes;
    }

    /** Starts waiting files, lowest priority first, while there is room. */
    private pump(): void {
        while (this.running < this.max_parallel && this.queue.length > 0) {
            let best = 0;
            for (let index = 1; index < this.queue.length; index++) {
                const candidate = this.queue[index];
                const current = this.queue[best];
                if (
                    candidate.priority < current.priority ||
                    (candidate.priority === current.priority &&
                        candidate.order < current.order)
                ) {
                    best = index;
                }
            }
            const [load] = this.queue.splice(best, 1);
            this.start(load);
        }
    }

    private start(load: AssetLoad): void {
        this.running += 1;
        load.state = "loading";
        const abort = new AbortController();
        const timer = setTimeout(() => {
            abort.abort();
            this.finish(load, null, "timed out");
        }, this.timeout_ms);
        this.load_file(load, abort.signal).then(
            (element) => {
                clearTimeout(timer);
                this.finish(load, element, null);
            },
            (error: unknown) => {
                clearTimeout(timer);
                this.finish(
                    load,
                    null,
                    error instanceof AssetLoadError
                        ? error.message
                        : `network error: ${error instanceof Error ? error.message : String(error)}`,
                );
            },
        );
    }

    private async load_file(
        load: AssetLoad,
        signal: AbortSignal,
    ): Promise<{ element: MediaElement; url: string }> {
        if (!this.may_fetch(load)) {
            return { element: await this.open(load, load.url), url: load.url };
        }
        const url = await this.fetch_object_url(load, signal);
        try {
            return { element: await this.open(load, url), url };
        } catch (error) {
            URL.revokeObjectURL(url);
            throw error;
        }
    }

    /** Same origin, or CORS, over http(s): the bytes may be fetched. */
    private may_fetch(load: AssetLoad): boolean {
        if (this.fetch_bytes === null) {
            return false;
        }
        let url: URL;
        try {
            url = new URL(load.url, this.origin ?? undefined);
        } catch {
            return false;
        }
        if (url.protocol !== "http:" && url.protocol !== "https:") {
            return false;
        }
        return load.cors || url.origin === this.origin;
    }

    private async fetch_object_url(
        load: AssetLoad,
        signal: AbortSignal,
    ): Promise<string> {
        if (this.fetch_bytes === null) {
            throw new AssetLoadError("no network");
        }
        const response = await this.fetch_bytes(load.url, { signal });
        if (!response.ok) {
            throw new AssetLoadError(`HTTP ${response.status}`);
        }
        const length = Number(response.headers.get("Content-Length"));
        load.total_bytes = length > 0 ? length : null;
        const type = response.headers.get("Content-Type") ?? "";
        const reader = response.body?.getReader();
        if (reader === undefined) {
            const blob = await response.blob();
            load.loaded_bytes = blob.size;
            return URL.createObjectURL(blob);
        }
        const chunks: Uint8Array[] = [];
        for (;;) {
            const { done, value } = await reader.read();
            if (done) {
                break;
            }
            chunks.push(value);
            load.loaded_bytes += value.byteLength;
            if (load.total_bytes !== null) {
                load.progress.set_self_progress(
                    BYTES_SHARE *
                        Math.min(1, load.loaded_bytes / load.total_bytes),
                );
            }
        }
        load.progress.set_self_progress(BYTES_SHARE);
        return URL.createObjectURL(new Blob(chunks as BlobPart[], { type }));
    }

    /** Loads `url` into a new element of the file's kind. */
    private open(load: AssetLoad, url: string): Promise<MediaElement> {
        return new Promise<MediaElement>((resolve, reject) => {
            const element = this.create_element(load.kind);
            const ready_events = READY_EVENTS[load.kind];
            const cleanup = () => {
                for (const type of ready_events) {
                    element.removeEventListener(type, on_ready);
                }
                element.removeEventListener("error", on_error);
            };
            const on_ready = () => {
                cleanup();
                resolve(element);
            };
            const on_error = () => {
                cleanup();
                reject(new AssetLoadError("could not be loaded"));
            };
            for (const type of ready_events) {
                element.addEventListener(type, on_ready);
            }
            element.addEventListener("error", on_error);
            if (load.kind === "image") {
                element.src = url;
                return;
            }
            const media = element as HTMLAudioElement | HTMLVideoElement;
            media.preload = "auto";
            media.src = url;
            media.load();
        });
    }

    private finish(
        load: AssetLoad,
        loaded: { element: MediaElement; url: string } | null,
        reason: string | null,
    ): void {
        if (load.is_finished) {
            return;
        }
        this.running -= 1;
        if (loaded === null) {
            load.state = "failed";
            load.reason = reason;
            console.warn(`Failed to load ${load.kind}`, load.url, reason);
        } else {
            load.state = "ready";
            this.keep(load, loaded.element, loaded.url);
        }
        load.progress.mark_as_done();
        this.pump();
    }

    private keep(load: AssetLoad, element: MediaElement, url: string): void {
        const asset = { element, url, ready: true };
        if (load.kind === "image") {
            this.images.set(load.name, asset as Asset<HTMLImageElement>);
        } else if (load.kind === "audio") {
            this.audios.set(load.name, asset as Asset<HTMLAudioElement>);
        } else {
            this.videos.set(load.name, asset as Asset<HTMLVideoElement>);
        }
    }

    /**
     * Load the assets (images, audio, and optional videos) and track progress.
     * @param assets Object containing record of image, audio, and video paths
     * @param progress Progress object to track the loading state
     */
    public async load(
        assets: {
            images?: Record<string, string>;
            audio?: Record<string, string>;
            videos?: Record<string, string>;
        },
        progress: Progress,
    ) {
        const count = 2 + (assets.videos ? 1 : 0);
        const sub_progress = progress.make_child_progress(count);
        const image_progress = sub_progress.make_child_progress(1);
        const audio_progress = sub_progress.make_child_progress(1);
        const video_progress = assets.videos
            ? sub_progress.make_child_progress(1)
            : null;

        const promises = [
            this.load_images(assets.images ?? {}, image_progress),
            this.load_audio(assets.audio ?? {}, audio_progress),
        ];
        if (assets.videos && video_progress) {
            promises.push(this.load_videos(assets.videos, video_progress));
        }
        await Promise.all(promises);
    }

    /**
     * Specifically load images.
     * @param assets Record of image name to URL
     * @param progress Progress object
     */
    public async load_images(
        assets: Record<string, string>,
        progress: Progress,
    ) {
        return this.load_assets(
            assets, // import.meta.glob("/assets/images/**/*.png", { query: "url", eager: true, import: 'default' }),
            progress,
            async (single_progress, path, url) => {
                return new Promise<void>((resolve, reject) => {
                    const image = new Image();
                    const asset = {
                        element: image,
                        url: url,
                        ready: false,
                    };
                    this.images.set(path, asset);
                    image.addEventListener("load", () => {
                        asset.ready = true;
                        single_progress.mark_as_done();
                        resolve();
                    });
                    image.addEventListener("error", () => {
                        console.warn("Failed to load image", url);
                        single_progress.mark_as_done();
                        reject();
                    });
                    image.crossOrigin = "anonymous";
                    image.src = url;
                });
            },
        );
    }

    /**
     * Specifically load audio files.
     * @param assets Record of audio name to URL
     * @param progress Progress object
     */
    public async load_audio(
        assets: Record<string, string>,
        progress: Progress,
    ) {
        return this.load_assets(
            assets, // import.meta.glob("/assets/audio/**/*.mp3", { query: "url", eager: true, import: 'default' }),
            progress,
            async (single_progress, path, url) => {
                return new Promise<void>((resolve, reject) => {
                    const audio = new Audio(url);
                    audio.crossOrigin = "anonymous";
                    const asset = {
                        element: audio,
                        url: url,
                        ready: false,
                    };
                    this.audios.set(path, asset);
                    audio.addEventListener("canplay", () => {
                        asset.ready = true;
                        single_progress.mark_as_done();
                        resolve();
                    });
                    audio.addEventListener("error", () => {
                        console.warn("Failed to load audio", url);
                        single_progress.mark_as_done();
                        reject();
                    });
                    audio.preload = "auto";
                    audio.load();
                });
            },
        );
    }

    /**
     * Specifically load video files.
     * @param assets Record of video name to URL
     * @param progress Progress object
     */
    public async load_videos(
        assets: Record<string, string>,
        progress: Progress,
    ) {
        return this.load_assets(
            assets,
            progress,
            async (single_progress, path, url) => {
                return new Promise<void>((resolve, reject) => {
                    const is_jsdom =
                        typeof window !== "undefined" &&
                        window.navigator?.userAgent?.includes("jsdom");
                    if (is_jsdom) {
                        // Avoid loading media elements in JSDOM tests
                        const video = document.createElement("video");
                        const asset = {
                            element: video,
                            url: url,
                            ready: true,
                        };
                        this.videos.set(path, asset);
                        single_progress.mark_as_done();
                        resolve();
                        return;
                    }

                    const video = document.createElement("video");
                    video.crossOrigin = "anonymous";
                    const asset = {
                        element: video,
                        url: url,
                        ready: false,
                    };
                    this.videos.set(path, asset);

                    const on_canplay = () => {
                        asset.ready = true;
                        cleanup();
                        single_progress.mark_as_done();
                        resolve();
                    };

                    const on_error = () => {
                        console.warn("Failed to load video", url);
                        cleanup();
                        single_progress.mark_as_done();
                        reject();
                    };

                    const cleanup = () => {
                        video.removeEventListener("canplaythrough", on_canplay);
                        video.removeEventListener("canplay", on_canplay);
                        video.removeEventListener("loadeddata", on_canplay);
                        video.removeEventListener("error", on_error);
                    };

                    video.addEventListener("canplaythrough", on_canplay);
                    video.addEventListener("canplay", on_canplay);
                    video.addEventListener("loadeddata", on_canplay);
                    video.addEventListener("error", on_error);

                    video.preload = "auto";
                    try {
                        video.src = url;
                        video.load();
                    } catch (e) {
                        console.warn("Error loading video", e);
                        asset.ready = true;
                        cleanup();
                        single_progress.mark_as_done();
                        resolve();
                    }
                });
            },
        );
    }

    public async load_assets(
        assets: Record<string, string>,
        progress: Progress,
        callback: (
            progress: Progress,
            path: string,
            url: string,
        ) => Promise<void>,
    ): Promise<Array<void>> {
        const promises = new Array<Promise<void>>();
        const child_progress = progress.make_child_progress(
            Object.keys(assets).length,
        );
        for (const [path, url] of Object.entries(assets)) {
            const single_progress = child_progress.make_child_progress(1);
            const promise = callback(single_progress, path, url);
            this.pending.push({
                promise,
                path,
                url,
                queued_at: performance.now(),
                finished_at: null,
            });
            const pending_index = this.pending.length - 1;
            promise
                .then(() => {
                    this.pending[pending_index].finished_at = performance.now();
                })
                .catch(() => {
                    // Rejection handled by Promise.all caller
                });
            promises.push(promise);
        }
        return Promise.all(promises);
    }

    public list_pending() {
        return this.pending
            .filter((asset) => asset.finished_at === null)
            .map((asset) => asset.path);
    }
}
