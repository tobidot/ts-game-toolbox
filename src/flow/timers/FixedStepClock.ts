/**
 * Turns uneven frame deltas into even steps of a fixed length. A frame loop hands out whatever
 * time passed; physics and simulations want every step the same, so that a run plays out alike
 * at any frame rate and a seed replays exactly. What a frame leaves over is kept for the next.
 */
export class FixedStepClock {
    /** The length of one step in seconds. */
    public readonly step_seconds: number;
    /** Frame time no step has used yet: always less than a step after `advance()`. */
    private unused_seconds = 0;

    public constructor(step_seconds: number) {
        if (!(step_seconds > 0)) {
            throw new Error(
                "FixedStepClock: a step must be longer than 0 seconds",
            );
        }
        this.step_seconds = step_seconds;
    }

    /**
     * Adds a frame delta and runs `step` once per whole step it now holds. A step that returns
     * anything but `undefined` ends the run, say with the game's next phase: the time left over
     * is dropped, and `advance()` returns that value.
     */
    public advance<R>(
        delta_seconds: number,
        step: () => R | undefined | void,
    ): R | undefined {
        this.unused_seconds += delta_seconds;
        while (this.unused_seconds >= this.step_seconds) {
            this.unused_seconds -= this.step_seconds;
            const result = step();
            if (result !== undefined) {
                this.unused_seconds = 0;
                return result as R;
            }
        }
        return undefined;
    }

    /** Forgets the time left over: the next step is a whole step away again. */
    public reset(): void {
        this.unused_seconds = 0;
    }
}
