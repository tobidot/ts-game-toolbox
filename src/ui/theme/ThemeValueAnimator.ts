import { ThemeValueProxy } from "./ThemeValueProxy";
import { ThemePropertyValue } from "./Theme";

export class ThemeValueAnimator<T extends ThemePropertyValue> extends ThemeValueProxy<T> {
    public start: number = performance.now();

    constructor(
        protected interval_seconds: number,
        protected callback: (t: number) => T,
    ) {
        super();
    }

    public cpy(): this {
        return new ThemeValueAnimator<T>(this.interval_seconds, this.callback) as this;
    }

    public get(): T {
        const t =
            ((performance.now() - this.start) / 1000) % this.interval_seconds;
        return this.callback(t / this.interval_seconds);
    }

    public equals(other: ThemeValueAnimator<T>): boolean {
        if (other === this) {
            return true;
        }
        return this.callback === other.callback;
    }
}
