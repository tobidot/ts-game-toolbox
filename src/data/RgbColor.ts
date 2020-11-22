export class RgbColor {
    public constructor(
        public r: number = 0,
        public g: number = 0,
        public b: number = 0,
        public a: number = 255,
    ) {

    }

    public to_hex(): string {
        return "#" + [this.r, this.g, this.b, this.a].map(v => ("00" + v.toString(16)).substr(-2)).join('');
    }

    public lerp(other: RgbColor, t: number): RgbColor {
        return new RgbColor(
            this.r * (1 - t) + other.r * t,
            this.g * (1 - t) + other.g * t,
            this.b * (1 - t) + other.b * t,
            this.a * (1 - t) + other.a * t,
        );
    }
}