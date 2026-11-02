/**
 * Input sequence matching: "the player entered Left, Left, Up" as a question the game loop can
 * ask one input at a time. A `ComboMatcher` holds one target sequence and a position; every
 * `input()` either advances the position, completes the sequence or breaks the partial match.
 * The values are anything (`"ArrowLeft"`, an enum, a button id); an `equals` function decides
 * what counts as the same input.
 *
 * The matcher never reads a clock. The caller hands `now_seconds` in (the frame loop's own
 * time), so the gap rule works the same in a 60 fps loop, under a paused game and in a test
 * that passes 0, 1, 2 by hand.
 */
export interface ComboOptions {
    /**
     * How many seconds may pass between two steps of a combo; a later input no longer continues
     * the partial match. The first step has no gap. Default `Infinity` (no limit).
     */
    max_gap_seconds?: number;
}

/**
 * What one input did to the match:
 * - `"progress"`: it was the next step, the sequence is not finished yet.
 * - `"complete"`: it was the last step; the matcher stays complete until `reset()`.
 * - `"broken"`: a partial match was in progress and this input did not continue it (or came
 *   too late). The matcher restarts: if the broken input is itself a start of the sequence
 *   (`A A B` on `A B`), the position is already past it.
 * - `"ignored"`: nothing was in progress and the input is not the first step, or the matcher
 *   was already complete.
 */
export type ComboResult = "progress" | "complete" | "broken" | "ignored";

/** A sequence matcher: feed inputs, read how far the sequence has been entered. */
export class ComboMatcher<T> {
    /** The inputs that make up the combo, in order. */
    public readonly sequence: readonly T[];
    private readonly max_gap_seconds: number;
    private readonly equals: (a: T, b: T) => boolean;
    private _position = 0;
    private last_input_seconds: number | null = null;

    public constructor(
        sequence: readonly T[],
        options: ComboOptions = {},
        equals: (a: T, b: T) => boolean = (a, b) => a === b,
    ) {
        if (sequence.length === 0) {
            throw new Error("ComboMatcher: the sequence must not be empty");
        }
        this.sequence = sequence.slice();
        this.max_gap_seconds = options.max_gap_seconds ?? Infinity;
        this.equals = equals;
    }

    /** How many steps of the sequence have been matched so far. */
    public get position(): number {
        return this._position;
    }

    /** 0 before the first step, 1 when complete. */
    public get progress(): number {
        return this._position / this.sequence.length;
    }

    public get is_complete(): boolean {
        return this._position >= this.sequence.length;
    }

    /**
     * Feeds one input. `now_seconds` is the caller's clock, only needed when the matcher has a
     * `max_gap_seconds`; without it the gap rule is never applied.
     */
    public input(value: T, now_seconds?: number): ComboResult {
        if (this.is_complete) return "ignored";
        const had_progress = this._position > 0;
        if (had_progress && this.is_too_late(now_seconds)) {
            this._position = 0;
        }
        this.last_input_seconds = now_seconds ?? null;
        if (this.equals(this.sequence[this._position], value)) {
            const was_timed_out = had_progress && this._position === 0;
            this._position += 1;
            if (was_timed_out) return "broken";
            return this.is_complete ? "complete" : "progress";
        }
        this._position = this.restart_position(value);
        return had_progress ? "broken" : "ignored";
    }

    /** Back to the start; a completed matcher can be used again. */
    public reset(): void {
        this._position = 0;
        this.last_input_seconds = null;
    }

    private is_too_late(now_seconds: number | undefined): boolean {
        if (now_seconds === undefined || this.last_input_seconds === null) {
            return false;
        }
        return now_seconds - this.last_input_seconds > this.max_gap_seconds;
    }

    /**
     * Where a broken match continues: the inputs seen so far are `sequence[0..position)` plus
     * `value`; the longest tail of that which is also a head of the sequence is the new
     * position (the failure function of string matching, computed on the spot: combos are
     * short).
     */
    private restart_position(value: T): number {
        const matched = this.sequence.slice(0, this._position).concat([value]);
        const longest = Math.min(matched.length, this.sequence.length - 1);
        for (let length = longest; length > 0; length--) {
            const start = matched.length - length;
            let is_prefix = true;
            for (let index = 0; index < length; index++) {
                if (
                    !this.equals(this.sequence[index], matched[start + index])
                ) {
                    is_prefix = false;
                    break;
                }
            }
            if (is_prefix) return length;
        }
        return 0;
    }
}

/** One entry of a `ComboList`: a name and the sequence that triggers it. */
export interface NamedCombo<T> {
    name: string;
    sequence: readonly T[];
}

/**
 * Keeps several matchers and reports which combos an input completed, for fighting-game style
 * move lists. Every input is fed to every matcher, so overlapping combos (`A B` and `A B C`)
 * both fire, each at its own last step. A completed matcher restarts right away.
 */
export class ComboList<T> {
    private readonly matchers: Array<{
        name: string;
        matcher: ComboMatcher<T>;
    }>;

    public constructor(
        combos: readonly NamedCombo<T>[],
        options: ComboOptions = {},
        equals?: (a: T, b: T) => boolean,
    ) {
        this.matchers = combos.map((combo) => ({
            name: combo.name,
            matcher: new ComboMatcher(combo.sequence, options, equals),
        }));
    }

    /** The names of the combos this input completed, in list order; usually none or one. */
    public input(value: T, now_seconds?: number): string[] {
        const completed: string[] = [];
        for (const { name, matcher } of this.matchers) {
            if (matcher.input(value, now_seconds) === "complete") {
                completed.push(name);
                matcher.reset();
            }
        }
        return completed;
    }

    /** How far the named combo has been entered, 0..1; 0 for an unknown name. */
    public progress_of(name: string): number {
        return (
            this.matchers.find((entry) => entry.name === name)?.matcher
                .progress ?? 0
        );
    }

    /** Every matcher back to the start. */
    public reset(): void {
        for (const { matcher } of this.matchers) matcher.reset();
    }
}
