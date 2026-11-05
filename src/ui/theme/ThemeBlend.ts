const HEX_COLOR = /^#[0-9a-f]{6}$/i;

function channels(hex: string): [number, number, number] {
    return [
        Number(`0x${hex.slice(1, 3)}`),
        Number(`0x${hex.slice(3, 5)}`),
        Number(`0x${hex.slice(5, 7)}`),
    ];
}

function blend_hex(from: string, to: string, t: number): string {
    const end = channels(to);
    const mixed = channels(from).map((channel, index) =>
        Math.round(channel * (1 - t) + end[index] * t),
    );
    return `#${mixed.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

/**
 * A table of `#rrggbb` colors and numbers, `t` of the way from `from` to `to`. Anything else takes
 * the side it is nearer to. This is how what a game paints follows a theme fade.
 */
export function blend_table<T extends object>(from: T, to: T, t: number): T {
    const blended: Record<string, unknown> = {};
    for (const [key, start] of Object.entries(from)) {
        const end = (to as Record<string, unknown>)[key];
        if (typeof start === "number" && typeof end === "number") {
            blended[key] = start * (1 - t) + end * t;
        } else if (
            typeof start === "string" &&
            typeof end === "string" &&
            HEX_COLOR.test(start) &&
            HEX_COLOR.test(end)
        ) {
            blended[key] = blend_hex(start, end, t);
        } else {
            blended[key] = t < 0.5 ? start : end;
        }
    }
    return blended as T;
}
