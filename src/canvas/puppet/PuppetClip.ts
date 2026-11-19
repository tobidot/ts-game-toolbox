import { PuppetClipData, PuppetEase, PuppetKeyData } from "./RigData";
import type { Skeleton } from "./Skeleton";

const EASES: Readonly<Record<PuppetEase, number>> = {
    linear: 0,
    smooth: 1,
    step: 2,
};
const CHANNELS = ["rotation", "x", "y"] as const;

/** A named moment of a clip (`events: { "0.5": "step" }`). */
export interface PuppetMoment {
    readonly time: number;
    readonly name: string;
}

/** One channel of one bone: key times, values and the easing from each key to the next. */
interface Channel {
    readonly bone: number;
    /** 0 rotation, 1 x, 2 y. */
    readonly channel: number;
    readonly times: Float64Array;
    readonly values: Float64Array;
    readonly eases: Uint8Array;
}

/** The value of a channel at `time`, wrapping from the last key to the first in a loop. */
function channel_value(
    track: Channel,
    time: number,
    length: number,
    loop: boolean,
): number {
    const times = track.times;
    const values = track.values;
    const last = times.length - 1;
    if (last === 0) {
        return values[0];
    }
    let from: number;
    let to: number;
    let from_time: number;
    let to_time: number;
    if (time < times[0]) {
        if (!loop) {
            return values[0];
        }
        from = last;
        to = 0;
        from_time = times[last] - length;
        to_time = times[0];
    } else if (time >= times[last]) {
        if (!loop || times[last] >= length) {
            return values[last];
        }
        from = last;
        to = 0;
        from_time = times[last];
        to_time = times[0] + length;
    } else {
        let index = 0;
        while (index < last - 1 && times[index + 1] <= time) {
            index += 1;
        }
        from = index;
        to = index + 1;
        from_time = times[index];
        to_time = times[index + 1];
    }
    const span = to_time - from_time;
    const ease = track.eases[from];
    if (span <= 0 || ease === 2) {
        return values[from];
    }
    let part = (time - from_time) / span;
    if (ease === 1) {
        part = part * part * (3 - 2 * part);
    }
    return values[from] + (values[to] - values[from]) * part;
}

/**
 * One clip of a puppet: keys per bone over `length` seconds. Made from plain data with
 * `from_data()` (or by `PuppetRig`); a player only reads it, so many puppets share one clip.
 * Rotations and shifts are added to the rest pose; a bone without keys stays at rest.
 */
export class PuppetClip {
    /** Named moments, by time. */
    public readonly moments: readonly PuppetMoment[];

    private constructor(
        public readonly name: string,
        public readonly length: number,
        public readonly loop: boolean,
        /** The clip after this one, when it is played once; null for none. */
        public readonly then: string | null,
        /** Units per second a standing foot slides back; 0 for a clip on the spot. */
        public readonly travel: number,
        moments: readonly PuppetMoment[],
        private readonly channels: readonly Channel[],
        private readonly bone_count: number,
        private readonly data: PuppetClipData,
    ) {
        this.moments = moments;
    }

    /**
     * A clip from data. `index_of` names the skeleton's bones (-1 for none), `bone_count` says how
     * many it has. Throws, with the clip's name, on an unknown bone, keys out of order, a moment
     * past the end or a length that isn't above 0.
     */
    public static from_data(
        name: string,
        data: PuppetClipData,
        index_of: (bone: string) => number,
        bone_count: number,
    ): PuppetClip {
        if (!(data.length > 0) || !Number.isFinite(data.length)) {
            throw new Error(`clip "${name}": its length must be above 0`);
        }
        const moments: PuppetMoment[] = [];
        for (const [time_text, moment] of Object.entries(data.events ?? {})) {
            const time = Number(time_text);
            if (!Number.isFinite(time) || time < 0 || time > data.length) {
                throw new Error(
                    `clip "${name}": an event at ${time_text} s, past its end (${data.length} s)`,
                );
            }
            moments.push({ time, name: moment });
        }
        moments.sort((a, b) => a.time - b.time);
        const channels: Channel[] = [];
        for (const [bone_name, keys] of Object.entries(data.tracks)) {
            const bone = index_of(bone_name);
            if (bone < 0) {
                throw new Error(`clip "${name}": no bone "${bone_name}"`);
            }
            check_keys(name, bone_name, keys, data.length);
            for (const [channel, key_name] of CHANNELS.entries()) {
                const with_value = keys.filter(
                    (key) => key[key_name] !== undefined,
                );
                if (with_value.length === 0) {
                    continue;
                }
                channels.push({
                    bone,
                    channel,
                    times: Float64Array.from(with_value.map((key) => key.t)),
                    values: Float64Array.from(
                        with_value.map((key) => key[key_name] as number),
                    ),
                    eases: Uint8Array.from(
                        with_value.map((key) => EASES[key.ease ?? "linear"]),
                    ),
                });
            }
        }
        return new PuppetClip(
            name,
            data.length,
            data.loop === true,
            data.then ?? null,
            data.travel ?? 0,
            moments,
            channels,
            bone_count,
            structuredClone(data),
        );
    }

    /**
     * Writes the clip's pose at `time` (seconds from its start) into the skeleton's pose: every
     * bone's rotation and shift, those without keys at rest. Call `skeleton.update()` after.
     */
    public sample(time: number, skeleton: Skeleton): void {
        this.sample_into(time, skeleton.rotation, skeleton.x, skeleton.y);
    }

    /** `sample()` into three arrays (rotation, x, y) of a pose, one entry per bone. */
    public sample_into(
        time: number,
        rotation: Float64Array,
        x: Float64Array,
        y: Float64Array,
    ): void {
        const count = Math.min(this.bone_count, rotation.length);
        rotation.fill(0, 0, count);
        x.fill(0, 0, count);
        y.fill(0, 0, count);
        const targets = [rotation, x, y];
        for (const track of this.channels) {
            if (track.bone < count) {
                targets[track.channel][track.bone] = channel_value(
                    track,
                    time,
                    this.length,
                    this.loop,
                );
            }
        }
    }

    /** The clip as plain data again (for an editor that copies it out). */
    public to_data(): PuppetClipData {
        return structuredClone(this.data);
    }
}

function check_keys(
    clip: string,
    bone: string,
    keys: readonly PuppetKeyData[],
    length: number,
): void {
    let before = -Infinity;
    for (const key of keys) {
        if (!Number.isFinite(key.t) || key.t < before || key.t < 0) {
            throw new Error(
                `clip "${clip}", bone "${bone}": key times must rise from 0 (${key.t} after ${before})`,
            );
        }
        if (key.t > length) {
            throw new Error(
                `clip "${clip}", bone "${bone}": a key at ${key.t} s, past its end (${length} s)`,
            );
        }
        if (key.ease !== undefined && !(key.ease in EASES)) {
            throw new Error(
                `clip "${clip}", bone "${bone}": ease "${key.ease}" is not linear, smooth or step`,
            );
        }
        for (const channel of CHANNELS) {
            const value = key[channel];
            if (value !== undefined && !Number.isFinite(value)) {
                throw new Error(
                    `clip "${clip}", bone "${bone}": ${channel} at ${key.t} s must be a number`,
                );
            }
        }
        before = key.t;
    }
}
