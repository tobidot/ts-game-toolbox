import type { ThemeRule } from "../ui/theme/Theme";
import { RectI, Vector2I } from "../geometries";

/** A rectangle in layout coordinates. */
export type LayoutRect = Readonly<RectI>;

/** One arrangement of a game screen, in its own reference resolution. */
export interface StageLayout {
    readonly width: number;
    readonly height: number;
    /** Theme rules only this layout has, over the game's: a phone's larger text. */
    readonly theme_rules?: readonly ThemeRule[];
}

/**
 * Where a layout sits on a canvas, in canvas (device) pixels: drawn at `scale`, its top left
 * corner at `offset_x`/`offset_y`.
 */
export interface StageFit {
    readonly scale: number;
    readonly offset_x: number;
    readonly offset_y: number;
}

/**
 * The largest scale at which the whole layout is visible on a canvas of the given size, centred.
 * What is left over on two sides is the caller's to fill with the background.
 */
export function fit_layout(
    layout: StageLayout,
    canvas_width: number,
    canvas_height: number,
): StageFit {
    const scale = Math.min(
        canvas_width / layout.width,
        canvas_height / layout.height,
    );
    return {
        scale,
        offset_x: (canvas_width - layout.width * scale) / 2,
        offset_y: (canvas_height - layout.height * scale) / 2,
    };
}

/**
 * The layout that shows the game largest in `width` x `height`: a wide window gets the wide
 * layout, an upright phone the upright one. A later layout must be larger by `margin` (5 %) to
 * win, so a window near the break-even shape does not flip back and forth.
 */
export function pick_layout<L extends StageLayout>(
    layouts: readonly L[],
    width: number,
    height: number,
    margin: number = 1.05,
): L {
    if (layouts.length === 0) {
        throw new Error("pick_layout: no layouts given");
    }
    let best = layouts[0];
    let best_scale = 0;
    for (const layout of layouts) {
        const scale = Math.min(width / layout.width, height / layout.height);
        if (scale > best_scale * margin) {
            best = layout;
            best_scale = scale;
        }
    }
    return best;
}

/** True when `point` lies in `rect` (left and top edge inside, right and bottom edge outside). */
export function rect_contains(rect: LayoutRect, point: Vector2I): boolean {
    return (
        point.x >= rect.left &&
        point.x < rect.left + rect.width &&
        point.y >= rect.top &&
        point.y < rect.top + rect.height
    );
}

/** Cells in rows and columns: `columns` per row, each `width` x `height`, `gap` between them. */
export interface LayoutGrid {
    readonly left: number;
    readonly top: number;
    readonly width: number;
    readonly height: number;
    readonly gap: number;
    readonly columns: number;
}

/** The rect of cell `index` of `grid`, filled row by row. */
export function grid_cell(grid: LayoutGrid, index: number): LayoutRect {
    const column = index % grid.columns;
    const row = Math.floor(index / grid.columns);
    return {
        left: grid.left + column * (grid.width + grid.gap),
        top: grid.top + row * (grid.height + grid.gap),
        width: grid.width,
        height: grid.height,
    };
}

/** `columns` x `rows` cells filling `area`, `gap` between them. */
export function grid_in(
    area: LayoutRect,
    columns: number,
    rows: number,
    gap: number,
): LayoutGrid {
    return {
        left: area.left,
        top: area.top,
        width: (area.width - (columns - 1) * gap) / columns,
        height: (area.height - (rows - 1) * gap) / rows,
        gap,
        columns,
    };
}
