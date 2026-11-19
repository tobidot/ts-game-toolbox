import { EventBase, EventSocket } from "../../signals/EventSocket";
import type { PuppetClip } from "./PuppetClip";
import type { PuppetRig } from "./PuppetRig";
import type { Skeleton } from "./Skeleton";

/** A named moment of a clip came (`events: { "0.5": "step" }` in its data). */
export class PuppetMomentEvent extends EventBase {
    public static readonly EVENT_NAME = "puppet.moment";

    public constructor(
        /** The moment's name: `"step"`. */
        public readonly name: string,
        /** The clip playing. */
        public readonly clip: string,
        /** Seconds from the clip's start. */
        public readonly time: number,
    ) {
        super(PuppetMomentEvent.EVENT_NAME);
    }
}

/** A clip ended: one played once reached its end, or a queued clip took over. */
export class PuppetEndEvent extends EventBase {
    public static readonly EVENT_NAME = "puppet.end";

    public constructor(
        public readonly clip: string,
        /** The clip that follows; null when the player stops at the end. */
        public readonly next: string | null,
    ) {
        super(PuppetEndEvent.EVENT_NAME);
    }
}

export type PuppetEvent = PuppetMomentEvent | PuppetEndEvent;

/** How `PuppetPlayer.play()` starts a clip. */
export interface PuppetPlayOptions {
    /** Seconds the bones blend from the pose before into the new clip. Default `default_fade`. */
    readonly fade?: number;
    /** From its start even when the clip is playing already. */
    readonly restart?: boolean;
}

/**
 * More rounds than this in one `update()` and the rest of the time is dropped: a tab that slept
 * for an hour doesn't replay the hour.
 */
export const MAX_ROUNDS_PER_UPDATE = 10_000;

const wrap_degrees = (degrees: number) => {
    const turned = (((degrees + 180) % 360) + 360) % 360;
    return turned - 180;
};

/**
 * Plays a puppet's clips over time, as `AnimationPlayer` plays a sheet's: `play()` switches (with
 * a short fade, the bones blending the short way round), `queue()` after the current clip ends, a
 * clip played once goes on with its `then`. `speed` scales time, `paused` stops it; every named
 * moment sends a `PuppetMomentEvent` on `events` when the time passes it, also when one update
 * passes several, at any speed. Time left over at a clip's end carries into the next.
 *
 * `apply(skeleton)` writes the pose; `Puppet` does that in its `update()`.
 */
export class PuppetPlayer {
    public readonly events = new EventSocket<PuppetEvent>();
    /** Time runs this many times as fast; never below 0. */
    public speed = 1;
    public paused = false;
    /** False: no `PuppetMomentEvent`s (end events still come). For puppets nobody listens to. */
    public sends_events = true;
    /** The fade of `play()` without one, of `then` and of a queued clip, in seconds. */
    public default_fade = 0.15;

    private playing: PuppetClip | null = null;
    /** The clip asked for while the rig doesn't have it yet. */
    private wanted: string | null;
    private next: string | null = null;
    private elapsed = 0;
    private is_finished = false;
    private is_entry_due = false;
    // The fade: from a clip that goes on playing (or a pose held still), over `fade_length`.
    private fade_from: PuppetClip | null = null;
    private fade_from_time = 0;
    private fade_elapsed = 0;
    private fade_length = 0;
    private held: Float64Array[] | null = null;
    private scratch: Float64Array[] = [];

    public constructor(
        public readonly rig: PuppetRig,
        clip?: string,
    ) {
        this.wanted = clip ?? null;
        this.resolve();
    }

    /** The clip playing; null while the rig has no clips yet. */
    public get clip(): PuppetClip | null {
        return this.playing;
    }

    /** The name of the clip playing, or of the one it waits for. */
    public get clip_name(): string | null {
        return this.playing?.name ?? this.wanted ?? this.rig.start_clip;
    }

    /** Seconds from the start of the clip playing. */
    public get time(): number {
        return this.elapsed;
    }

    /** A clip played once stopped at its end, and nothing follows. */
    public get finished(): boolean {
        return this.is_finished;
    }

    /** The clip `queue()` put after this one; null for none. */
    public get queued(): string | null {
        return this.next;
    }

    /** The bones are blending from the clip before. */
    public get fading(): boolean {
        return this.fade_length > 0 && this.fade_elapsed < this.fade_length;
    }

    /**
     * Plays `name` from its start, fading from the pose before, and forgets the queue. The clip
     * playing already goes on (so a game may say `play("walk")` every frame), unless `restart`.
     * False when the rig's clips are there and none has that name: then nothing changes.
     */
    public play(name: string, options: PuppetPlayOptions = {}): boolean {
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
        const clip = this.rig.clip(name);
        if (clip === null) {
            this.playing = null;
            this.elapsed = 0;
            return true;
        }
        this.switch_to(clip, 0, options.fade ?? this.default_fade);
        return true;
    }

    /**
     * Plays `name` when the current clip ends: a loop at the end of its round, a clip played once
     * at its end (instead of its `then`). At once when nothing plays or the clip stopped.
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

    /** Sets the time within the clip playing (an editor scrubbing), without moments. */
    public seek(time: number): void {
        if (this.playing === null) {
            return;
        }
        this.elapsed = Math.min(Math.max(0, time), this.playing.length);
        this.is_finished = false;
        this.is_entry_due = false;
    }

    /** Moves on by `delta_seconds` (times `speed`) and sends the moments passed. */
    public update(delta_seconds: number): void {
        if (this.playing === null) {
            this.resolve();
        }
        if (this.playing === null || this.paused) {
            return;
        }
        const seconds = Math.max(0, delta_seconds * Math.max(0, this.speed));
        if (this.fade_length > 0) {
            this.fade_elapsed += seconds;
            if (this.fade_from !== null) {
                this.fade_from_time = this.advance_quietly(
                    this.fade_from,
                    this.fade_from_time + seconds,
                );
            }
            if (this.fade_elapsed >= this.fade_length) {
                this.end_fade();
            }
        }
        if (this.is_entry_due) {
            this.is_entry_due = false;
            this.send_moments(-1, 0);
        }
        if (this.is_finished) {
            return;
        }
        let left = seconds;
        let rounds = 0;
        while (this.playing !== null && !this.is_finished) {
            const clip: PuppetClip = this.playing;
            const until_end = clip.length - this.elapsed;
            if (left < until_end) {
                this.send_moments(this.elapsed, this.elapsed + left);
                this.elapsed += left;
                return;
            }
            this.send_moments(this.elapsed, clip.length);
            left -= until_end;
            rounds += 1;
            if (rounds >= MAX_ROUNDS_PER_UPDATE) {
                left = 0;
            }
            this.round_over(clip);
        }
    }

    /**
     * Writes the pose of the clip at its time into the skeleton (blended with the clip or pose
     * before while fading) and updates the skeleton. Nothing while there is no clip.
     */
    public apply(skeleton: Skeleton): void {
        const clip = this.playing;
        if (clip === null) {
            return;
        }
        clip.sample(this.elapsed, skeleton);
        if (this.fading) {
            const from = this.from_pose(skeleton.count);
            if (from !== null) {
                blend(
                    from,
                    [skeleton.rotation, skeleton.x, skeleton.y],
                    this.fade_weight(),
                );
            }
        }
        skeleton.update();
    }

    /** The rig has that clip, or has no clips yet to say no. */
    private knows(name: string): boolean {
        return !this.rig.has_data || this.rig.clip(name) !== null;
    }

    /** Starts the clip asked for (or the rig's start clip) once the rig has it. */
    private resolve(): void {
        const name = this.wanted ?? this.rig.start_clip;
        const clip = name === null ? null : this.rig.clip(name);
        if (clip !== null) {
            this.start(clip, 0);
        }
    }

    private start(clip: PuppetClip, time: number): void {
        this.playing = clip;
        this.wanted = clip.name;
        this.elapsed = time;
        this.is_finished = false;
        this.is_entry_due = true;
    }

    /** A new clip, fading from what shows now. */
    private switch_to(clip: PuppetClip, time: number, fade: number): void {
        const before = this.playing;
        if (before !== null && fade > 0) {
            if (this.fading) {
                // A fade during a fade: hold the blended pose still and fade from it.
                this.held = this.current_pose();
                this.fade_from = null;
            } else if (this.is_finished) {
                this.held = this.pose_of(before, this.elapsed);
                this.fade_from = null;
            } else {
                this.held = null;
                this.fade_from = before;
                this.fade_from_time = this.elapsed;
            }
            this.fade_elapsed = 0;
            this.fade_length = fade;
        } else {
            this.end_fade();
        }
        this.start(clip, time);
    }

    private end_fade(): void {
        this.fade_from = null;
        this.held = null;
        this.fade_elapsed = 0;
        this.fade_length = 0;
    }

    /** The end of a round: a loop starts over, else the queue, `then` or a stop. */
    private round_over(clip: PuppetClip): void {
        const follow = this.next ?? (clip.loop ? null : clip.then);
        const follow_clip = follow === null ? null : this.rig.clip(follow);
        if (follow_clip !== null) {
            this.next = null;
            this.events.dispatch(
                new PuppetEndEvent(clip.name, follow_clip.name),
            );
            this.switch_to(follow_clip, 0, this.default_fade);
            this.is_entry_due = false;
            this.send_moments(-1, 0);
            return;
        }
        if (clip.loop) {
            this.elapsed = 0;
            this.send_moments(-1, 0);
            return;
        }
        this.is_finished = true;
        this.elapsed = clip.length;
        this.events.dispatch(new PuppetEndEvent(clip.name, null));
    }

    /** Moments with a time in (from, to]; from -1 takes the moments at 0 too. */
    private send_moments(from: number, to: number): void {
        const clip = this.playing;
        if (clip === null || !this.sends_events) {
            return;
        }
        for (const moment of clip.moments) {
            if (moment.time > from && moment.time <= to) {
                this.events.dispatch(
                    new PuppetMomentEvent(moment.name, clip.name, moment.time),
                );
            }
        }
    }

    /** The time of a clip played on without moments (the clip faded from). */
    private advance_quietly(clip: PuppetClip, time: number): number {
        if (time < clip.length) {
            return time;
        }
        return clip.loop ? time % clip.length : clip.length;
    }

    private pose_of(clip: PuppetClip, time: number): Float64Array[] {
        const count = this.rig.bone_count;
        const pose = [
            new Float64Array(count),
            new Float64Array(count),
            new Float64Array(count),
        ];
        clip.sample_into(time, pose[0], pose[1], pose[2]);
        return pose;
    }

    /** The pose shown now, blended if fading. */
    private current_pose(): Float64Array[] {
        const clip = this.playing!;
        const pose = this.pose_of(clip, this.elapsed);
        const from = this.from_pose(this.rig.bone_count);
        if (from !== null) {
            blend(from, pose, this.fade_weight());
        }
        return pose;
    }

    /** How far the fade is, eased in and out: 0 the pose before, 1 the new clip. */
    private fade_weight(): number {
        const part = Math.min(1, this.fade_elapsed / this.fade_length);
        return part * part * (3 - 2 * part);
    }

    /** The pose faded from: the held one, or the clip before at its time. */
    private from_pose(count: number): Float64Array[] | null {
        if (this.held !== null) {
            return this.held;
        }
        if (this.fade_from === null) {
            return null;
        }
        if (this.scratch.length === 0 || this.scratch[0].length !== count) {
            this.scratch = [
                new Float64Array(count),
                new Float64Array(count),
                new Float64Array(count),
            ];
        }
        this.fade_from.sample_into(
            this.fade_from_time,
            this.scratch[0],
            this.scratch[1],
            this.scratch[2],
        );
        return this.scratch;
    }
}

/** A pose (rotation, x, y) moved from `from` towards itself by `weight`; angles the short way round. */
function blend(from: Float64Array[], to: Float64Array[], weight: number): void {
    const count = Math.min(to[0].length, from[0].length);
    for (let index = 0; index < count; index++) {
        to[0][index] =
            from[0][index] +
            wrap_degrees(to[0][index] - from[0][index]) * weight;
        to[1][index] =
            from[1][index] + (to[1][index] - from[1][index]) * weight;
        to[2][index] =
            from[2][index] + (to[2][index] - from[2][index]) * weight;
    }
}
