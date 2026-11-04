export type VideoSplashOutcome =
    | "ended"
    | "skipped"
    | "timeout"
    | "error"
    | "blocked"
    | "aborted";

export interface VideoSplashOptions {
    /** Give up after this long, however the video behaves. Default 8000. */
    timeout_ms?: number;
    /**
     * Keep the last frame on screen this long after the video ended, before the splash is
     * removed; a click or key still ends it early. Not counted against `timeout_ms`. Default 0.
     */
    hold_ms?: number;
    /** A click or a key on the container ends the splash early. Default true. */
    skippable?: boolean;
    /** Muted videos may autoplay without a user gesture. Default true. */
    muted?: boolean;
    /** Fill color behind a video that does not cover the container. Default "#111111". */
    background?: string;
    /** `contain` keeps the whole frame visible, `cover` fills the container. Default "contain". */
    fit?: "contain" | "cover";
    /** Shown until the first frame is ready. */
    poster?: string;
    /** Aborting resolves the splash with "aborted" and removes the video. */
    signal?: AbortSignal;
}

/**
 * Plays one video on top of `$container` (which gets `position: relative` when it is static)
 * and resolves once it is over: the video ended, the viewer skipped it, it timed out, the
 * browser refused to autoplay it, or it failed to load. The video element is removed before
 * the promise resolves, whatever the outcome, so a caller never has to clean up.
 */
export function play_video_splash(
    $container: HTMLElement,
    url: string,
    options: VideoSplashOptions = {},
): Promise<VideoSplashOutcome> {
    const timeout_ms = options.timeout_ms ?? 8000;
    const skippable = options.skippable ?? true;
    const muted = options.muted ?? true;
    const background = options.background ?? "#111111";
    const fit = options.fit ?? "contain";
    const hold_ms = options.hold_ms ?? 0;

    return new Promise<VideoSplashOutcome>((resolve) => {
        if (options.signal?.aborted) {
            resolve("aborted");
            return;
        }
        const $video = document.createElement("video");
        $video.src = url;
        $video.muted = muted;
        $video.defaultMuted = muted;
        $video.autoplay = true;
        $video.playsInline = true;
        $video.setAttribute("playsinline", "");
        $video.preload = "auto";
        $video.tabIndex = -1;
        if (options.poster) {
            $video.poster = options.poster;
        }
        const style = $video.style;
        style.position = "absolute";
        style.inset = "0";
        style.width = "100%";
        style.height = "100%";
        style.objectFit = fit;
        style.background = background;
        style.zIndex = "10";
        style.cursor = skippable ? "pointer" : "default";

        if (getComputedStyle($container).position === "static") {
            $container.style.position = "relative";
        }

        let done = false;
        let is_holding = false;
        let timer: ReturnType<typeof setTimeout> | null = null;
        const finish = (outcome: VideoSplashOutcome) => {
            if (done) {
                return;
            }
            done = true;
            if (timer !== null) {
                clearTimeout(timer);
            }
            $video.removeEventListener("ended", on_ended);
            $video.removeEventListener("error", on_error);
            $video.removeEventListener("click", on_skip);
            $video.removeEventListener("keydown", on_key);
            options.signal?.removeEventListener("abort", on_abort);
            try {
                $video.pause();
            } catch {
                // a video that never started has nothing to pause
            }
            $video.removeAttribute("src");
            $video.remove();
            resolve(outcome);
        };
        const on_ended = () => {
            if (hold_ms <= 0) {
                finish("ended");
                return;
            }
            // An ended video keeps showing its last frame: leave it there for the hold.
            is_holding = true;
            if (timer !== null) {
                clearTimeout(timer);
            }
            timer = setTimeout(() => finish("ended"), hold_ms);
        };
        const on_error = () => finish("error");
        const on_skip = () => {
            if (skippable) {
                finish(is_holding ? "ended" : "skipped");
            }
        };
        const on_key = (event: KeyboardEvent) => {
            if (
                skippable &&
                (event.key === "Enter" ||
                    event.key === " " ||
                    event.key === "Escape")
            ) {
                event.preventDefault();
                finish(is_holding ? "ended" : "skipped");
            }
        };
        const on_abort = () => finish("aborted");

        $video.addEventListener("ended", on_ended);
        $video.addEventListener("error", on_error);
        $video.addEventListener("click", on_skip);
        $video.addEventListener("keydown", on_key);
        options.signal?.addEventListener("abort", on_abort, { once: true });
        timer = setTimeout(() => finish("timeout"), timeout_ms);

        $container.appendChild($video);
        if (skippable) {
            $video.focus();
        }

        const playing = $video.play();
        if (playing && typeof playing.then === "function") {
            playing.catch(() => finish("blocked"));
        }
    });
}
