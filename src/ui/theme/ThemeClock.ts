const real_seconds = (): number => performance.now() / 1000;

let now = real_seconds;

/** The time in seconds that all moving theme values go by. */
export function theme_now(): number {
    return now();
}

/** Lets a test step the time by hand. Null goes back to the real clock. */
export function set_theme_clock(clock: (() => number) | null): void {
    now = clock ?? real_seconds;
}
