/**
 * Tweens for frame loops. A frame loop hands every system a `delta_seconds`; a `Tween` adds those
 * up and turns them into a value on its way from `from` to `to`, shaped by an easing function.
 * Nothing moves unless the loop says so: a paused game holds its animations, and a test can
 * jump to any moment without waiting.
 */

/** Maps the linear time 0..1 to how far the value has come, 0 at the start and 1 at the end. */
export type Easing = (t: number) => number;

/** Constant speed. */
export function ease_linear(t: number): number {
    return t;
}

/** Starts slowly and speeds up: something being pushed. */
export function ease_in(t: number): number {
    return t * t;
}

/** Starts fast and slows down: something coming to rest. */
export function ease_out(t: number): number {
    return t * (2 - t);
}

/** Slow at both ends, fast in the middle. */
export function ease_in_out(t: number): number {
    return t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t);
}

/**
 * A value that moves from `from` to `to` over `seconds` of `update()` calls. It lands exactly on
 * `to`, however large the last step was, and stays there until `restart()`.
 */
export class Tween {
    private elapsed = 0;

    public constructor(
        public readonly from: number,
        public readonly to: number,
        public readonly seconds: number,
        private readonly easing: Easing = ease_linear,
    ) {
        if (!(seconds > 0)) {
            throw new Error(
                "Tween: the duration must be greater than 0 seconds",
            );
        }
    }

    /** Moves on by `delta_seconds`; a negative or empty step does nothing. */
    public update(delta_seconds: number): void {
        if (delta_seconds > 0) {
            this.elapsed = Math.min(this.seconds, this.elapsed + delta_seconds);
        }
    }

    /** The current value; exactly `from` before the first step and exactly `to` at the end. */
    public get value(): number {
        if (this.is_done) {
            return this.to;
        }
        const eased = this.easing(this.elapsed / this.seconds);
        return this.from + (this.to - this.from) * eased;
    }

    /** True once the whole time has passed. */
    public get is_done(): boolean {
        return this.elapsed >= this.seconds;
    }

    /** Back to `from`, ready to run again. */
    public restart(): void {
        this.elapsed = 0;
    }
}
