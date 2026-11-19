import { MarkBlend, MarkSheetData } from "./RigData";

/** One mark's picture, ready to lay onto a part. */
export interface MarkPicture {
    readonly id: string;
    readonly title: string;
    readonly kind: string;
    readonly source_x: number;
    readonly source_y: number;
    readonly width: number;
    readonly height: number;
    /** The point of the picture that sits on the mark's place, in its pixels. */
    readonly pivot_x: number;
    readonly pivot_y: number;
    /** Rig units per picture pixel at size 1 (`1 / resolution`). */
    readonly unit: number;
    readonly blend: MarkBlend;
    readonly opacity: number;
    /** The tint layer it is clipped to where the part has one; "" the part's outline. */
    readonly on: string;
    /** The sheet it is in (its atlas). */
    readonly sheet: MarkSheet;
}

/**
 * Marks for skins in one atlas: tattoos, scars, freckles (`MarkSheetData`, the catalogue's `rig` of
 * such a picture). Read once and shared by every puppet that uses it (`puppet.use_marks(sheet)`,
 * then `puppet.add_mark("anchor", "upper_arm_r", { x, y })`). Like a `Wardrobe`, it may start
 * empty and get its data (`set_data()`) and its picture (`image`) later, in either order.
 */
export class MarkSheet {
    /** Grows on each `set_data()`, so puppets know to lay their marks again. */
    public version = 0;
    /** The atlas; null until it arrives. */
    public image: CanvasImageSource | null = null;
    private sheet_data: MarkSheetData | null = null;
    private picture_map = new Map<string, MarkPicture>();

    /** A mark sheet from data (and its picture, now or later); throws on data that doesn't hold together. */
    public static from_data(
        data: MarkSheetData,
        image: CanvasImageSource | null = null,
    ): MarkSheet {
        const sheet = new MarkSheet();
        sheet.set_data(data);
        sheet.image = image;
        return sheet;
    }

    /** Reads the data; throws with a clear message (a rectangle or pivot that isn't numbers, a blend it doesn't know) and keeps what it had. */
    public set_data(data: MarkSheetData): void {
        const resolution = data.resolution ?? 1;
        if (!(resolution > 0)) {
            throw new Error("a mark sheet's resolution must be above 0");
        }
        if (typeof data.marks !== "object" || data.marks === null) {
            throw new Error("a mark sheet holds marks by id");
        }
        const pictures = new Map<string, MarkPicture>();
        for (const [id, mark] of Object.entries(data.marks)) {
            const rect = mark.rect;
            if (
                !Array.isArray(rect) ||
                rect.length !== 4 ||
                !rect.every(Number.isFinite) ||
                rect[2] <= 0 ||
                rect[3] <= 0
            ) {
                throw new Error(
                    `mark "${id}": rect [x, y, width, height] must be numbers`,
                );
            }
            const pivot = mark.pivot ?? [rect[2] / 2, rect[3] / 2];
            if (
                !Array.isArray(pivot) ||
                pivot.length !== 2 ||
                !pivot.every(Number.isFinite)
            ) {
                throw new Error(`mark "${id}": pivot [x, y] must be numbers`);
            }
            const blend = mark.blend ?? "multiply";
            if (blend !== "multiply" && blend !== "normal") {
                throw new Error(
                    `mark "${id}": blend "${String(blend)}" is not multiply or normal`,
                );
            }
            const opacity = mark.opacity ?? 1;
            if (!(opacity >= 0 && opacity <= 1)) {
                throw new Error(`mark "${id}": opacity must be from 0 to 1`);
            }
            pictures.set(id, {
                id,
                title: mark.title ?? id,
                kind: mark.kind ?? "",
                source_x: rect[0],
                source_y: rect[1],
                width: rect[2],
                height: rect[3],
                pivot_x: pivot[0],
                pivot_y: pivot[1],
                unit: 1 / resolution,
                blend,
                opacity,
                on: mark.on ?? "skin",
                sheet: this,
            });
        }
        this.sheet_data = data;
        this.picture_map = pictures;
        this.version += 1;
    }

    /** The data as given; null until it comes. */
    public get data(): MarkSheetData | null {
        return this.sheet_data;
    }

    public get has_data(): boolean {
        return this.sheet_data !== null;
    }

    /** The data and the picture are both there. */
    public get is_ready(): boolean {
        return this.sheet_data !== null && this.image !== null;
    }

    /** The marks by id, in the data's order. */
    public get marks(): ReadonlyMap<string, MarkPicture> {
        return this.picture_map;
    }

    public mark(id: string): MarkPicture | null {
        return this.picture_map.get(id) ?? null;
    }
}
