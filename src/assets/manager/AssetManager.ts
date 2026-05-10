import { Progress } from "../../flow";

interface PendingAsset {
    promise: Promise<void>;
    path: string;
    url: string;
    queued_at: number;
    finished_at: number | null;
}

interface Asset<T extends HTMLAudioElement | HTMLImageElement | SVGElement> {
    element: T;
    url: string;
}

/**
 * Load the assets providing the following input.
 * import.meta.glob("/assets/images/**\/*.png", { query: "url", eager: true, import: 'default' }),
 */
export class AssetManager {
    public audio: Map<string, Asset<HTMLAudioElement>>;
    public images: Map<string, Asset<HTMLImageElement>>;
    //
    protected pending: Array<PendingAsset> = [];

    public constructor() {
        this.audio = new Map<string, Asset<HTMLAudioElement>>();
        this.images = new Map<string, Asset<HTMLImageElement>>();
    }

    /**
     * Load the assets (images and audio) and track progress.
     * @param assets Object containing record of image and audio paths
     * @param progress Progress object to track the loading state
     */
    public async load(
        assets: {
            images?: Record<string, string>;
            audio?: Record<string, string>;
        },
        progress: Progress,
    ) {
        const sub_progress = progress.make_child_progress(2);
        const image_progress = sub_progress.make_child_progress(1);
        const audio_progress = sub_progress.make_child_progress(1);
        await Promise.all([
            this.load_images(assets.images ?? {}, image_progress),
            this.load_audio(assets.audio ?? {}, audio_progress),
        ]);
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
                    this.images.set(path, {
                        element: image,
                        url: url,
                    });
                    image.addEventListener("load", () => {
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
                    this.audio.set(path, {
                        element: audio,
                        url: url,
                    });
                    audio.addEventListener("canplay", () => {
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
