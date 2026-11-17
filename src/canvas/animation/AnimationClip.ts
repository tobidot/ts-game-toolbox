import { ClipData } from "./SheetData";

/** How a clip goes on at its end. */
export type ClipMode = "loop" | "once" | "ping-pong";

/** The frame rate of a clip that names none. */
export const DEFAULT_CLIP_FPS = 12;

/**
 * The frames a clip names, in order: `"0-7"`, `"7-0"`, `"0-3, 8, 10-12"` or a list of cells.
 * Throws on anything else, and on an empty list.
 */
export function parse_frames(frames: string | readonly number[]): number[] {
    const cells: number[] = [];
    if (typeof frames === "string") {
        for (const part of frames.split(",")) {
            const match = /^\s*(\d+)\s*(?:-\s*(\d+)\s*)?$/.exec(part);
            if (match === null) {
                throw new Error(`"${frames}" names no frames`);
            }
            const from = Number(match[1]);
            const to = match[2] === undefined ? from : Number(match[2]);
            const step = to >= from ? 1 : -1;
            for (let cell = from; cell !== to + step; cell += step) {
                cells.push(cell);
            }
        }
    } else {
        for (const cell of frames) {
            if (!Number.isInteger(cell) || cell < 0) {
                throw new Error(`${cell} is no frame of a sheet`);
            }
            cells.push(cell);
        }
    }
    if (cells.length === 0) {
        throw new Error("a clip needs at least one frame");
    }
    return cells;
}

/**
 * One clip of a sprite sheet: the sheet's frames in the order they play, how long each one shows,
 * what happens at the end and which frames have names. Made from plain data with `from_data()`
 * (or by `SpriteSheet.add_clips()`); a player only reads it, so many players share one clip.
 */
export class AnimationClip {
    /** Seconds of one pass: every frame once, there and back for ping-pong. */
    public readonly duration: number;

    public constructor(
        public readonly name: string,
        /** The sheet's frames, in the order they play. */
        public readonly frames: readonly number[],
        /** Seconds per frame, one per entry of `frames`. */
        public readonly durations: readonly number[],
        public readonly mode: ClipMode,
        /** The clip after this one, when it is played once; null for none. */
        public readonly then: string | null,
        /** Names of frames within the clip (0 is its first frame). */
        public readonly events: ReadonlyMap<number, string>,
    ) {
        if (frames.length === 0 || durations.length !== frames.length) {
            throw new Error(`clip "${name}": one duration per frame`);
        }
        for (const seconds of durations) {
            if (!(seconds > 0) || !Number.isFinite(seconds)) {
                throw new Error(`clip "${name}": a frame must last a while`);
            }
        }
        for (const index of events.keys()) {
            if (
                !Number.isInteger(index) ||
                index < 0 ||
                index >= frames.length
            ) {
                throw new Error(`clip "${name}": no frame ${index} to name`);
            }
        }
        let total = durations.reduce((sum, seconds) => sum + seconds, 0);
        if (mode === "ping-pong" && frames.length > 2) {
            for (let index = 1; index < frames.length - 1; index++) {
                total += durations[index];
            }
        }
        this.duration = total;
    }

    /** A clip from plain data, as a catalogue entry's `sheet` has it. */
    public static from_data(name: string, data: ClipData): AnimationClip {
        const frames = parse_frames(data.frames);
        const fps = data.fps ?? DEFAULT_CLIP_FPS;
        if (!(fps > 0)) {
            throw new Error(`clip "${name}": fps must be more than 0`);
        }
        const durations = frames.map(
            (_cell, index) => data.durations?.[index] ?? 1 / fps,
        );
        const mode: ClipMode =
            data.loop === "ping-pong"
                ? "ping-pong"
                : data.loop === true
                  ? "loop"
                  : "once";
        const events = new Map<number, string>();
        for (const [index, event] of Object.entries(data.events ?? {})) {
            events.set(Number(index), event);
        }
        return new AnimationClip(
            name,
            frames,
            durations,
            mode,
            data.then ?? null,
            events,
        );
    }
}
