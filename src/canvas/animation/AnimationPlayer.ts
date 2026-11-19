import { EventBase, EventSocket } from "../../signals/EventSocket";
import { AnimationClip } from "./AnimationClip";
import type { FrameDrawOptions, SpriteSheet } from "./SpriteSheet";

/** A named frame came up (`events: { 3: "step" }` in the clip's data). */
export class AnimationFrameEvent extends EventBase {
    public static readonly EVENT_NAME = "animation.frame";

    public constructor(
        /** The frame's name: `"step"`. */
        public readonly name: string,
        /** The clip playing. */
        public readonly clip: string,
        /** The frame within the clip, from 0. */
        public readonly frame_index: number,
        /** The sheet's frame. */
        public readonly frame: number,
    ) {
        super(AnimationFrameEvent.EVENT_NAME);
    }
}

/** A clip ended: a clip played once reached its end, or a queued clip took over. */
export class AnimationEndEvent extends EventBase {
    public static readonly EVENT_NAME = "animation.end";

    public constructor(
        public readonly clip: string,
        /** The clip that follows; null when the player stops on the last frame. */
        public readonly next: string | null,
    ) {
        super(AnimationEndEvent.EVENT_NAME);
    }
}

export type AnimationEvent = AnimationFrameEvent | AnimationEndEvent;

/** How `AnimationPlayer.play()` starts a clip. */
export interface PlayOptions {
    /** Start the clip from its first frame even when it is playing already. */
    readonly restart?: boolean;
}

/**
 * More frames than this in one `update()` and the rest of the time is dropped: a tab that slept
 * for an hour doesn't replay the hour.
 */
export const MAX_FRAMES_PER_UPDATE = 10_000;

/**
 * Plays the clips of a `SpriteSheet` for one sprite: `sheet.player("walk")`, then `update(dt)`
 * every frame and `draw(context, x, y)`. `play()` switches at once, `queue()` after the current
 * clip ends, and a clip played once goes on with its `then`. Pictures don't blend.
 *
 * `speed` scales time (2 plays twice as fast, 0.1 shows single frames); `paused` stops it. Every
 * named frame sends an `AnimationFrameEvent` on `events` when it comes up, also when one update
 * passes several frames, so a footstep sound sits on its frame at any speed. Time left over when
 * a clip ends carries into the next one, so a queued clip starts exactly at the end.
 */
export class AnimationPlayer {
    public readonly events = new EventSocket<AnimationEvent>();
    /** Time runs this many times as fast; never below 0. */
    public speed = 1;
    public paused = false;
    /**
     * False: no `AnimationFrameEvent`s (the frames still play, and `AnimationEndEvent`s still
     * come). For sprites nobody listens to, where footsteps would only cost.
     */
    public sends_events = true;

    private playing: AnimationClip | null = null;
    /** The clip asked for while the sheet doesn't have it yet. */
    private wanted: string | null;
    private next: string | null = null;
    private index = 0;
    private direction: 1 | -1 = 1;
    private elapsed = 0;
    private is_finished = false;
    /** The frame shown has not sent its event yet (a clip that just started). */
    private is_entry_due = false;

    public constructor(
        public readonly sheet: SpriteSheet,
        clip?: string,
    ) {
        this.wanted = clip ?? null;
        this.resolve();
    }

    /** The clip playing; null while the sheet has no clips yet. */
    public get clip(): AnimationClip | null {
        return this.playing;
    }

    /** The name of the clip playing, or the one it waits for. */
    public get clip_name(): string | null {
        return this.playing?.name ?? this.wanted ?? this.sheet.start_clip;
    }

    /** The frame within the clip, from 0. */
    public get frame_index(): number {
        return this.index;
    }

    /** The sheet's frame to draw; -1 while there is no clip. */
    public get frame(): number {
        return this.playing === null ? -1 : this.playing.frames[this.index];
    }

    /** A clip played once stopped on its last frame, and nothing follows. */
    public get finished(): boolean {
        return this.is_finished;
    }

    /** The clip `queue()` put after this one; null for none. */
    public get queued(): string | null {
        return this.next;
    }

    /** Seconds the current frame has shown, in the clip's time. */
    public get frame_time(): number {
        return this.elapsed;
    }

    /**
     * Plays `name` from its first frame, at once, and forgets the queue. The clip playing already
     * goes on where it is (so a game may say `play("walk")` every frame), unless `restart`. False
     * when the sheet's clips are there and none has that name: then nothing changes.
     */
    public play(name: string, options: PlayOptions = {}): boolean {
        if (!this.knows(name)) {
            return false;
        }
        if (
            this.playing?.name === name &&
            !this.is_finished &&
            options.restart !== true
        ) {
            return true;
        }
        this.next = null;
        this.wanted = name;
        this.playing = null;
        this.elapsed = 0;
        this.resolve();
        return true;
    }

    /**
     * Plays `name` when the current clip ends: a loop at the end of its round, a clip played once
     * after its last frame (instead of its `then`). At once when nothing plays or the clip stopped.
     */
    public queue(name: string): boolean {
        if (!this.knows(name)) {
            return false;
        }
        if (this.playing === null || this.is_finished) {
            return this.play(name, { restart: true });
        }
        this.next = name;
        return true;
    }

    /** Moves on by `delta_seconds` (times `speed`) and sends the events of the frames passed. */
    public update(delta_seconds: number): void {
        if (this.playing === null) {
            this.resolve();
        }
        if (this.playing === null || this.paused) {
            return;
        }
        if (this.is_entry_due) {
            this.is_entry_due = false;
            this.enter();
        }
        if (this.is_finished) {
            return;
        }
        this.elapsed += Math.max(0, delta_seconds * Math.max(0, this.speed));
        let passed = 0;
        while (this.playing !== null && !this.is_finished) {
            const seconds = this.playing.durations[this.index];
            if (this.elapsed < seconds) {
                break;
            }
            this.elapsed -= seconds;
            this.advance();
            passed += 1;
            if (passed >= MAX_FRAMES_PER_UPDATE) {
                this.elapsed = 0;
                break;
            }
        }
    }

    /** Draws the frame with the sheet's anchor at `x`, `y`; false while there is nothing to draw. */
    public draw(
        context: CanvasRenderingContext2D,
        x: number,
        y: number,
        options?: FrameDrawOptions,
    ): boolean {
        const frame = this.frame;
        if (frame < 0) {
            return false;
        }
        return this.sheet.draw_frame(context, frame, x, y, options);
    }

    /** The sheet has that clip, or has no clips yet to say no. */
    private knows(name: string): boolean {
        return this.sheet.clips.size === 0 || this.sheet.clip(name) !== null;
    }

    /** Starts the clip asked for (or the sheet's start clip) once the sheet has it. */
    private resolve(): void {
        const name = this.wanted ?? this.sheet.start_clip;
        const clip = name === null ? null : this.sheet.clip(name);
        if (clip !== null) {
            this.start(clip);
        }
    }

    private start(clip: AnimationClip): void {
        this.playing = clip;
        this.wanted = clip.name;
        this.index = 0;
        this.direction = 1;
        this.is_finished = false;
        this.is_entry_due = true;
    }

    /** One frame on, by the clip's mode; at the end, the queue, `then` or a stop. */
    private advance(): void {
        const clip = this.playing!;
        const last = clip.frames.length - 1;
        let is_round_over = false;
        let next_index = this.index + this.direction;
        if (clip.mode === "ping-pong" && last > 0) {
            if (next_index > last) {
                this.direction = -1;
                next_index = last - 1;
            } else if (next_index < 0) {
                is_round_over = true;
                this.direction = 1;
                next_index = 1;
            }
        } else if (next_index > last) {
            is_round_over = true;
            next_index = 0;
        }
        if (is_round_over) {
            const follow =
                this.next ?? (clip.mode === "once" ? clip.then : null);
            const follow_clip =
                follow === null ? null : this.sheet.clip(follow);
            if (follow_clip !== null) {
                this.next = null;
                this.events.dispatch(
                    new AnimationEndEvent(clip.name, follow_clip.name),
                );
                this.start(follow_clip);
                this.is_entry_due = false;
                this.enter();
                return;
            }
            if (clip.mode === "once") {
                this.is_finished = true;
                this.elapsed = 0;
                this.events.dispatch(new AnimationEndEvent(clip.name, null));
                return;
            }
        }
        this.index = next_index;
        this.enter();
    }

    /** The frame shown now came up: its event, if it has one. */
    private enter(): void {
        if (!this.sends_events) {
            return;
        }
        const clip = this.playing!;
        const name = clip.events.get(this.index);
        if (name !== undefined) {
            this.events.dispatch(
                new AnimationFrameEvent(
                    name,
                    clip.name,
                    this.index,
                    clip.frames[this.index],
                ),
            );
        }
    }
}
