import p5 from "p5";

export interface IRect {
    x: number, y: number, w: number, h: number
}

export class Rect implements IRect {
    public constructor(public x: number = 0, public y: number = 0, public w: number = 0, public h: number = 0) {

    }

    public get_bottom(): number {
        return this.y + this.h;
    }

    public get_right(): number {
        return this.x + this.w;
    }

    public get_area(): number {
        return this.w * this.h;
    }

    public contains(point: { x: number, y: number }): boolean;
    public contains(x: number, y: number): boolean;
    public contains(x: number | { x: number, y: number }, y?: number): boolean {
        if (typeof x !== "number") {
            y = x.y;
            x = x.x;
        }
        if (y === undefined) throw new Error();
        return Rect.contains(this, x, y);
    }

    public overlaps_with(other: IRect): boolean {
        return Rect.overlap(this, other);
    }

    public is_within(outer: IRect): boolean {
        return Rect.is_within(this, outer);
    }


    /**
     * static
     */
    public static contains(rect: IRect, x: number, y: number): boolean {
        return (x > rect.x && y > rect.y && x < rect.x + rect.w && y < rect.y + rect.h);
    }

    public static overlap(a: IRect, b: IRect): boolean {
        const overlap_x = (a.x + a.w > b.x && a.x <= b.x) || (b.x + b.w > a.x && b.x <= a.x);
        const overlap_y = (a.y + a.h > b.y && a.y <= b.y) || (b.y + b.h > a.y && b.y <= a.y);
        return overlap_x && overlap_y;
    }

    public static is_within(inner: IRect, outer: IRect) {
        const within_x = inner.x > outer.x && inner.x + inner.w < outer.x + outer.w;
        const within_y = inner.y > outer.y && inner.y + inner.h < outer.y + outer.h;
        return within_x && within_y;
    }
}
