/**
 * A small, fast seeded pseudo random generator (mulberry32). The same seed always yields the
 * same sequence, which makes games reproducible, testable and saveable: store the seed (or the
 * `state`), not the numbers. Never `Math.random` in game code.
 */
export class SeededRandom {
    private _state: number;

    /** Any finite number works as a seed; it is reduced to an unsigned 32-bit state. */
    public constructor(seed: number) {
        this._state = SeededRandom.normalize(seed);
    }

    /** Restores a generator from a `state` read earlier, continuing exactly where it was. */
    public static from_state(state: number): SeededRandom {
        const random = new SeededRandom(0);
        random._state = SeededRandom.normalize(state);
        return random;
    }

    /** The current internal state; save it to continue the same sequence later. */
    public get state(): number {
        return this._state;
    }

    /** A number in [0, 1), like `Math.random()`. */
    public next(): number {
        this._state = (this._state + 0x6d2b79f5) >>> 0;
        let t = this._state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }

    /** A whole number between `min` and `max`, both inclusive. */
    public int(min: number, max: number): number {
        const low = Math.ceil(Math.min(min, max));
        const high = Math.floor(Math.max(min, max));
        return low + Math.floor(this.next() * (high - low + 1));
    }

    /** A number in [min, max). */
    public float(min: number, max: number): number {
        return min + this.next() * (max - min);
    }

    /** `true` with the given probability (0..1). */
    public chance(probability: number): boolean {
        return this.next() < probability;
    }

    /** One element of a non-empty list. */
    public pick<T>(items: readonly T[]): T {
        if (items.length === 0) {
            throw new Error("SeededRandom.pick: the list is empty");
        }
        return items[Math.floor(this.next() * items.length)];
    }

    /** Fisher-Yates shuffle, in place; returns the same array. */
    public shuffle<T>(items: T[]): T[] {
        for (let i = items.length - 1; i > 0; i--) {
            const j = Math.floor(this.next() * (i + 1));
            const swap = items[i];
            items[i] = items[j];
            items[j] = swap;
        }
        return items;
    }

    /** A new generator seeded from this one, so two systems can draw independently. */
    public fork(): SeededRandom {
        return new SeededRandom(Math.floor(this.next() * 4294967296));
    }

    private static normalize(seed: number): number {
        if (!Number.isFinite(seed)) {
            return 0;
        }
        return Math.floor(Math.abs(seed)) >>> 0;
    }
}
