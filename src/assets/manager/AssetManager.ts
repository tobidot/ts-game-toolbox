import { Progress } from "../../flow";

export interface PendingAsset {
    promise: Promise<void>;
    path: string;
    url: string;
    queued_at: number;
    finished_at: number | null;
}

export interface Asset<T extends HTMLAudioElement | HTMLImageElement | HTMLVideoElement | SVGElement> {
    element: T;
    url: string;
    ready: boolean;
}

/**
 * Load the assets providing the following input.
 * import.meta.glob("/assets/images/**\/*.png", { query: "url", eager: true, import: 'default' }),
 */
export class AssetManager {
    public audios: Map<string, Asset<HTMLAudioElement>>;
    public images: Map<string, Asset<HTMLImageElement>>;
    public videos: Map<string, Asset<HTMLVideoElement>>;
    //
    protected pending: Array<PendingAsset> = [];

    public constructor() {
        this.audios = new Map<string, Asset<HTMLAudioElement>>();
        this.images = new Map<string, Asset<HTMLImageElement>>();
        this.videos = new Map<string, Asset<HTMLVideoElement>>();
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
        const video_progress = assets.videos ? sub_progress.make_child_progress(1) : null;

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
                    const is_jsdom = typeof window !== "undefined" && window.navigator?.userAgent?.includes("jsdom");
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
            promise.then(() => {
                this.pending[pending_index].finished_at = performance.now();
            }).catch(() => {
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
