/**
 * The best result of this session (higher or lower wins) and whether the last offer beat it.
 * Lives in a game's properties, so it survives "Neues Spiel" and a moved window, not a reload.
 */
export class SessionBest {
    private _value: number | null = null;
    private _is_new = false;

    public constructor(
        public readonly direction: "higher" | "lower" = "higher",
    ) {}

    /** Null until the first offer. */
    public get value(): number | null {
        return this._value;
    }

    /** True when the last `offer()` set a new best. */
    public get is_new(): boolean {
        return this._is_new;
    }

    /** A finished round's result; returns whether it is the new best. */
    public offer(result: number): boolean {
        const best = this._value;
        this._is_new =
            best === null ||
            (this.direction === "higher" ? result > best : result < best);
        if (this._is_new) {
            this._value = result;
        }
        return this._is_new;
    }

    /** A new round started: the last result is no longer "new". */
    public settle(): void {
        this._is_new = false;
    }
}
