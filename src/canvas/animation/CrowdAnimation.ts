import { SeededRandom } from "../../random/SeededRandom";
import { EventBase, EventSocket } from "../../signals/EventSocket";
import type { SpriteBatch } from "../SpriteBatch";
import { AnimationClip } from "./AnimationClip";
import { MAX_FRAMES_PER_UPDATE, PlayOptions } from "./AnimationPlayer";
import type { SheetAnchor, SpriteSheet } from "./SpriteSheet";

/** A named frame came up for one member of a crowd (`events: { 3: "step" }` in the clip's data). */
export class CrowdFrameEvent extends EventBase {
    public static readonly EVENT_NAME = "crowd.frame";

    public constructor(
        /** The member, as `add()` numbered it (and `remove()` renumbers). */
        public readonly member: number,
        /** The frame's name: `"step"`. */
        public readonly name: string,
        /** The clip playing. */
        public readonly clip: string,
        /** The frame within the clip, from 0. */
        public readonly frame_index: number,
        /** The sheet's frame. */
        public readonly frame: number,
    ) {
        super(CrowdFrameEvent.EVENT_NAME);
    }
}

/** How a `CrowdAnimation` is made. */
export interface CrowdAnimationOptions {
    /** Draws the start times of members added without one. Default: seeded with 1. */
    readonly random?: SeededRandom;
    /**
     * False: no `CrowdFrameEvent`s at all, and none built. A crowd's footsteps cost and nobody
     * hears a thousand of them. Default true; `sends_events` changes it later.
     */
    readonly events?: boolean;
}

/** How `CrowdAnimation.add()` starts a member. */
export interface CrowdMemberOptions {
    /** Time runs this many times as fast for this member. Default 1. */
    readonly speed?: number;
    /**
     * Seconds into the clip (its own time, before `speed`) to start at; the frames skipped send
     * no events. Default: a random point of one pass for a looping clip, from the crowd's
     * `random`, so a crowd doesn't walk in step; 0 for a clip played once.
     */
    readonly time?: number;
    /** Drawn mirrored left to right around the anchor. Default false. */
    readonly flip_x?: boolean;
    /** Drawn this many times as large (times the scale `draw()` is given). Default 1. */
    readonly scale?: number;
}

/** How `CrowdAnimation.draw()` hands its members to a batch. */
export interface CrowdDrawOptions {
    /** The members to draw, in this order (sorted by y, say). Default: all, as numbered. */
    readonly order?: ArrayLike<number>;
    /** How many of `order` (or of the members). Default: all. */
    readonly count?: number;
    /** Every member drawn this many times as large, times its own scale. Default 1. */
    readonly scale?: number;
}

/** The options object `draw()` hands to the batch, reused for every member. */
interface FrameScratch {
    anchor: SheetAnchor | null;
    scale: number;
    flip_x: boolean;
}

/** A member's start time that is to be drawn at random once its clip is known. */
const RANDOM_START = -1;
/** Member flags: drawn mirrored. */
const FLIPPED = 1;
/** A clip played once stopped on its last frame. */
const FINISHED = 2;
/** The frame shown has not sent its event yet (a clip that just started). */
const ENTRY_DUE = 4;

/**
 * Many sprites of one sheet, each playing its own clip, kept in flat arrays (a struct of arrays)
 * instead of one `AnimationPlayer` each: `update(dt)` moves all of them in one loop, and
 * `draw(batch, positions)` hands their frames to a `SpriteBatch`, so a crowd of thousands is
 * one run of `drawImage` calls from one picture. Members play exactly as single players would
 * (the same frames, `then`, ping-pong, the same time carried over), but have no queue and no
 * pause (speed 0 stands still).
 *
 * Members are numbered from 0 in the order added; `remove(index)` moves the last member into
 * the gap, as a game's own arrays would, and says so. Positions belong to the game: `draw()`
 * reads them from one array of x, y pairs by member.
 */
export class CrowdAnimation {
    public readonly events = new EventSocket<CrowdFrameEvent>();
    /** Whether named frames send a `CrowdFrameEvent`. */
    public sends_events: boolean;
    /** Draws the random start times; swap in a new seeded one for a new round. */
    public random: SeededRandom;

    private size = 0;
    private room: number;
    /** Per member: which entry of `names` it plays (or waits for). */
    private clip_ids: Uint16Array;
    /** Per member: the frame within its clip; -1 while its clip is not known yet. */
    private indices: Int32Array;
    private directions: Int8Array;
    /** Per member: seconds the frame has shown; while waiting, the start time (or `RANDOM_START`). */
    private elapsed: Float64Array;
    private speeds: Float64Array;
    private scales: Float64Array;
    private flags: Uint8Array;
    /** Clip names seen so far, and the sheet's clip for each (null while it has none). */
    private readonly names: string[] = [];
    private readonly ids = new Map<string, number>();
    private clips: (AnimationClip | null)[] = [];
    private readonly scratch: FrameScratch = {
        anchor: null,
        scale: 1,
        flip_x: false,
    };

    public constructor(
        public readonly sheet: SpriteSheet,
        /** Room for this many members at first; it grows when more come. */
        capacity = 256,
        options: CrowdAnimationOptions = {},
    ) {
        this.room = Math.max(1, Math.floor(capacity));
        this.clip_ids = new Uint16Array(this.room);
        this.indices = new Int32Array(this.room);
        this.directions = new Int8Array(this.room);
        this.elapsed = new Float64Array(this.room);
        this.speeds = new Float64Array(this.room);
        this.scales = new Float64Array(this.room);
        this.flags = new Uint8Array(this.room);
        this.random = options.random ?? new SeededRandom(1);
        this.sends_events = options.events ?? true;
    }

    /** Members in the crowd. */
    public get count(): number {
        return this.size;
    }

    /** Members the arrays hold before they grow. */
    public get capacity(): number {
        return this.room;
    }

    /**
     * A new member playing `clip`; returns its number. A clip the sheet doesn't know yet is
     * waited for, as a player does.
     */
    public add(clip: string, options: CrowdMemberOptions = {}): number {
        if (this.size === this.room) {
            this.grow(this.room * 2);
        }
        const index = this.size;
        this.size += 1;
        this.clip_ids[index] = this.id_of(clip);
        this.speeds[index] = options.speed ?? 1;
        this.scales[index] = options.scale ?? 1;
        this.flags[index] = options.flip_x === true ? FLIPPED : 0;
        this.indices[index] = -1;
        this.directions[index] = 1;
        this.elapsed[index] = options.time ?? RANDOM_START;
        const known = this.clips[this.clip_ids[index]];
        if (known !== null) {
            this.begin(index, known);
        }
        return index;
    }

    /**
     * Takes member `index` out by moving the last member into its place. Returns the number the
     * moved member had (the last), or -1 when `index` was the last and nothing moved.
     */
    public remove(index: number): number {
        this.check(index);
        const last = this.size - 1;
        this.size = last;
        if (index === last) {
            return -1;
        }
        this.clip_ids[index] = this.clip_ids[last];
        this.indices[index] = this.indices[last];
        this.directions[index] = this.directions[last];
        this.elapsed[index] = this.elapsed[last];
        this.speeds[index] = this.speeds[last];
        this.scales[index] = this.scales[last];
        this.flags[index] = this.flags[last];
        return last;
    }

    /** Takes every member out; the arrays keep their room. */
    public clear(): void {
        this.size = 0;
    }

    /**
     * Plays `clip` for member `index` from its first frame, as `AnimationPlayer.play()` does:
     * the clip playing already goes on (unless `restart`), and a clip the sheet's clips don't
     * have is refused with false.
     */
    public play(
        index: number,
        clip: string,
        options: PlayOptions = {},
    ): boolean {
        this.check(index);
        const sheet = this.sheet;
        if (sheet.clips.size > 0 && sheet.clip(clip) === null) {
            return false;
        }
        const id = this.id_of(clip);
        const flags = this.flags[index];
        if (
            this.clip_ids[index] === id &&
            this.indices[index] >= 0 &&
            (flags & FINISHED) === 0 &&
            options.restart !== true
        ) {
            return true;
        }
        this.clip_ids[index] = id;
        this.indices[index] = -1;
        this.elapsed[index] = 0;
        const known = this.clips[id];
        if (known !== null) {
            this.begin(index, known);
        }
        return true;
    }

    /** Moves every member on by `delta_seconds` (times its speed), sending the events of the frames passed. */
    public update(delta_seconds: number): void {
        const sheet = this.sheet;
        const clips = this.clips;
        for (let id = 0; id < clips.length; id++) {
            clips[id] = sheet.clip(this.names[id]);
        }
        const indices = this.indices;
        const elapsed = this.elapsed;
        const speeds = this.speeds;
        const flags = this.flags;
        const clip_ids = this.clip_ids;
        for (let member = 0; member < this.size; member++) {
            let clip = clips[clip_ids[member]];
            if (clip === null) {
                continue;
            }
            if (indices[member] < 0 || indices[member] >= clip.frames.length) {
                if (indices[member] >= 0) {
                    // New sheet data cut the clip short: it starts over.
                    elapsed[member] = 0;
                }
                this.begin(member, clip);
            }
            if ((flags[member] & ENTRY_DUE) !== 0) {
                flags[member] &= ~ENTRY_DUE;
                this.enter(member, clip);
            }
            if ((flags[member] & FINISHED) !== 0) {
                continue;
            }
            elapsed[member] += Math.max(
                0,
                delta_seconds * Math.max(0, speeds[member]),
            );
            let passed = 0;
            while ((flags[member] & FINISHED) === 0) {
                const seconds = clip.durations[indices[member]];
                if (elapsed[member] < seconds) {
                    break;
                }
                elapsed[member] -= seconds;
                clip = this.advance(member, clip, false);
                passed += 1;
                if (passed >= MAX_FRAMES_PER_UPDATE) {
                    elapsed[member] = 0;
                    break;
                }
            }
        }
    }

    /** The sheet's frame member `index` shows; -1 while its clip is not known yet. */
    public frame_of(index: number): number {
        const frame_index = this.indices[index];
        if (frame_index < 0 || index >= this.size) {
            return -1;
        }
        return this.clips[this.clip_ids[index]]?.frames[frame_index] ?? -1;
    }

    /** The frame within the clip member `index` shows, from 0; -1 while waiting. */
    public frame_index_of(index: number): number {
        return index < this.size ? this.indices[index] : -1;
    }

    /** The clip member `index` plays, or waits for. */
    public clip_of(index: number): string | null {
        return index < this.size ? this.names[this.clip_ids[index]] : null;
    }

    /** A clip played once stopped on its last frame for member `index`, and nothing follows. */
    public is_finished(index: number): boolean {
        return (this.flags[index] & FINISHED) !== 0;
    }

    public speed_of(index: number): number {
        return this.speeds[index];
    }

    public set_speed(index: number, speed: number): void {
        this.check(index);
        this.speeds[index] = speed;
    }

    public is_flipped(index: number): boolean {
        return (this.flags[index] & FLIPPED) !== 0;
    }

    /** Draws member `index` mirrored (a sprite that faces left faces right). */
    public set_flip(index: number, flip_x: boolean): void {
        this.check(index);
        if (flip_x) {
            this.flags[index] |= FLIPPED;
        } else {
            this.flags[index] &= ~FLIPPED;
        }
    }

    public scale_of(index: number): number {
        return this.scales[index];
    }

    public set_scale(index: number, scale: number): void {
        this.check(index);
        this.scales[index] = scale;
    }

    /**
     * Adds the members' frames to `batch`, each with the sheet's anchor for its frame at its
     * place: member `i` at `positions[2 * i]`, `positions[2 * i + 1]`. Returns how many it added
     * (none while the sheet's picture is not there).
     */
    public draw(
        batch: SpriteBatch,
        positions: ArrayLike<number>,
        options: CrowdDrawOptions = {},
    ): number {
        const sheet = this.sheet;
        const image = sheet.image;
        if (image === null) {
            return 0;
        }
        const order = options.order;
        const count = Math.min(
            options.count ?? (order === undefined ? this.size : order.length),
            order === undefined ? this.size : order.length,
        );
        const scale = options.scale ?? 1;
        const scratch = this.scratch;
        let added = 0;
        for (let at = 0; at < count; at++) {
            const member = order === undefined ? at : order[at];
            const frame = this.frame_of(member);
            const rect = frame < 0 ? undefined : sheet.frames[frame];
            if (rect === undefined) {
                continue;
            }
            scratch.anchor = sheet.anchor_of(frame);
            scratch.scale = scale * this.scales[member];
            scratch.flip_x = (this.flags[member] & FLIPPED) !== 0;
            batch.add_frame(
                image,
                rect,
                positions[2 * member],
                positions[2 * member + 1],
                scratch,
            );
            added += 1;
        }
        return added;
    }

    /** The number of a clip name, learned on first sight. */
    private id_of(name: string): number {
        let id = this.ids.get(name);
        if (id === undefined) {
            id = this.names.length;
            if (id > 0xffff) {
                throw new Error("CrowdAnimation: too many clip names");
            }
            this.names.push(name);
            this.ids.set(name, id);
            this.clips.push(this.sheet.clip(name));
        }
        return id;
    }

    /** Starts member `index` on `clip`'s first frame and moves it on, silently, by its start time. */
    private begin(index: number, clip: AnimationClip): void {
        const start = this.elapsed[index];
        const time =
            start === RANDOM_START
                ? clip.mode === "once"
                    ? 0
                    : this.random.next() * clip.duration
                : start;
        this.indices[index] = 0;
        this.directions[index] = 1;
        this.elapsed[index] = 0;
        const kept = this.flags[index] & FLIPPED;
        if (!(time > 0)) {
            // Started at its first frame: that frame's event is due at the next update.
            this.flags[index] = kept | ENTRY_DUE;
            return;
        }
        this.flags[index] = kept;
        this.elapsed[index] = time;
        let current = clip;
        let passed = 0;
        while ((this.flags[index] & FINISHED) === 0) {
            const seconds = current.durations[this.indices[index]];
            if (this.elapsed[index] < seconds) {
                break;
            }
            this.elapsed[index] -= seconds;
            current = this.advance(index, current, true);
            passed += 1;
            if (passed >= MAX_FRAMES_PER_UPDATE) {
                this.elapsed[index] = 0;
                break;
            }
        }
    }

    /**
     * One frame on for member `index`, as `AnimationPlayer` does: by the clip's mode, and at its
     * end `then` or a stop. Returns the clip it plays afterwards.
     */
    private advance(
        index: number,
        clip: AnimationClip,
        is_quiet: boolean,
    ): AnimationClip {
        const last = clip.frames.length - 1;
        let is_round_over = false;
        let next_index = this.indices[index] + this.directions[index];
        if (clip.mode === "ping-pong" && last > 0) {
            if (next_index > last) {
                this.directions[index] = -1;
                next_index = last - 1;
            } else if (next_index < 0) {
                is_round_over = true;
                this.directions[index] = 1;
                next_index = 1;
            }
        } else if (next_index > last) {
            is_round_over = true;
            next_index = 0;
        }
        if (is_round_over && clip.mode === "once") {
            const follow =
                clip.then === null ? null : this.sheet.clip(clip.then);
            if (follow !== null) {
                const id = this.id_of(follow.name);
                this.clips[id] = follow;
                this.clip_ids[index] = id;
                this.indices[index] = 0;
                this.directions[index] = 1;
                if (!is_quiet) {
                    this.enter(index, follow);
                }
                return follow;
            }
            this.flags[index] |= FINISHED;
            this.elapsed[index] = 0;
            return clip;
        }
        this.indices[index] = next_index;
        if (!is_quiet) {
            this.enter(index, clip);
        }
        return clip;
    }

    /** The frame member `index` shows now came up: its event, if it has one and events are on. */
    private enter(index: number, clip: AnimationClip): void {
        if (!this.sends_events || clip.events.size === 0) {
            return;
        }
        const frame_index = this.indices[index];
        const name = clip.events.get(frame_index);
        if (name !== undefined) {
            this.events.dispatch(
                new CrowdFrameEvent(
                    index,
                    name,
                    clip.name,
                    frame_index,
                    clip.frames[frame_index],
                ),
            );
        }
    }

    private check(index: number): void {
        if (!Number.isInteger(index) || index < 0 || index >= this.size) {
            throw new Error(`CrowdAnimation: no member ${index}`);
        }
    }

    private grow(room: number): void {
        const clip_ids = new Uint16Array(room);
        clip_ids.set(this.clip_ids);
        this.clip_ids = clip_ids;
        const indices = new Int32Array(room);
        indices.set(this.indices);
        this.indices = indices;
        const directions = new Int8Array(room);
        directions.set(this.directions);
        this.directions = directions;
        const elapsed = new Float64Array(room);
        elapsed.set(this.elapsed);
        this.elapsed = elapsed;
        const speeds = new Float64Array(room);
        speeds.set(this.speeds);
        this.speeds = speeds;
        const scales = new Float64Array(room);
        scales.set(this.scales);
        this.scales = scales;
        const flags = new Uint8Array(room);
        flags.set(this.flags);
        this.flags = flags;
        this.room = room;
    }
}
