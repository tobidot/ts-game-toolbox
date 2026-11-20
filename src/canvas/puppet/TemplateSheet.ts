import {
    JointPoints,
    SkeletonTemplate,
    TemplateBoneData,
    template_joints,
    template_point,
} from "./SkeletonTemplate";

/** A character drawn faintly on the sheet: its picture and where its root and joints are in it. */
export interface SheetPicture {
    readonly image: CanvasImageSource;
    /** Where the root sits in the picture's pixels (on its ground line). */
    readonly origin: readonly [number, number];
    /** Its joints in the picture's pixels; default the template's at the picture's size. */
    readonly joints?: JointPoints;
}

/** How the draw-over template is laid out. */
export interface TemplateSheetOptions {
    /**
     * The sheet's size in pixels. Default: the skeleton's own shape (upright for a Zweibeiner,
     * wide for a Vierbeiner) with a margin all round, room for the words at the top and under the
     * ground line, and room for the whole character when one is given.
     */
    readonly width?: number;
    readonly height?: number;
    /** Pixels per template unit. Default 1 (a Zweibeiner about 390 pixels tall). */
    readonly scale?: number;
    /** An existing character, faint under the joints (for a new skin of it). */
    readonly picture?: SheetPicture | null;
    /** How strongly the character shows. Default 0.3. */
    readonly picture_alpha?: number;
    /**
     * The bones of one layer: they and their joints are drawn strongly and named, the rest of the
     * skeleton faint and without words. Default: the whole skeleton strongly.
     */
    readonly bones?: readonly string[] | null;
    /** The words at the top, wrapped to the sheet. Default: the template's title and how to draw on it. */
    readonly title?: string;
    readonly font?: string;
}

/** Where things lie on a sheet: the ground line, the root and the joints in the sheet's pixels. */
export interface TemplateSheetLayout {
    readonly width: number;
    readonly height: number;
    readonly origin: readonly [number, number];
    readonly joints: Record<string, [number, number]>;
    readonly scale: number;
    /** The space kept round the figure (and its joints), in pixels. */
    readonly margin: number;
    /** Where the words at the top end: the figure's room starts below. */
    readonly top: number;
}

/** Room at the left edge for the ruler and its numbers. */
const RULER_ROOM = 40;
/** Room under the ground line. */
const GROUND_ROOM = 40;
/** The title's size, and the width of one of its letters as a share of it (a monospace font). */
const TITLE_SIZE = 15;
const LETTER_SHARE = 0.62;

/** The default words at the top of a template's sheet. */
function default_title(template: SkeletonTemplate): string {
    return `${template.title}: nach rechts schauen, Füße auf die Linie, ferne Glieder (hohle Punkte) auf eine eigene Ebene.`;
}

/** The title's lines on a sheet `width` wide (by letters, so the layout needs no canvas). */
function title_lines(title: string, width: number): string[] {
    const per_line = Math.max(
        8,
        Math.floor((width - 32) / (TITLE_SIZE * LETTER_SHARE)),
    );
    const lines: string[] = [];
    let line = "";
    for (const word of title.split(/\s+/).filter((each) => each !== "")) {
        if (line !== "" && line.length + 1 + word.length > per_line) {
            lines.push(line);
            line = word;
        } else {
            line = line === "" ? word : `${line} ${word}`;
        }
    }
    if (line !== "") {
        lines.push(line);
    }
    return lines;
}

/** How far down the words at the top reach, for `lines` lines. */
function title_room(lines: number): number {
    return 12 + Math.max(1, lines) * (TITLE_SIZE + 4) + 6;
}

/**
 * The joints a set of bones turns on (since step 43): both ends of each, and both joints of a
 * point that lies between two.
 */
export function template_bone_joints(
    template: SkeletonTemplate,
    bones: readonly string[],
): Set<string> {
    const joints = new Set<string>();
    const add = (point: TemplateBoneData["from"]) => {
        if (typeof point === "string") {
            joints.add(point);
        } else {
            joints.add(point.from);
            joints.add(point.toward);
        }
    };
    for (const bone of template.bones) {
        if (bones.includes(bone.name)) {
            add(bone.from);
            add(bone.to);
        }
    }
    return joints;
}

/**
 * The sheet's size and where the joints go on it (shared by the drawing and its tests). The
 * figure's room is its joints' box (from the ground up to the template's height), at least 0.6
 * times as wide as tall and a quarter as tall as wide, and the character's whole picture when
 * one is given; a margin of 15 % of its larger side (at least 40 pixels) goes round it, the words
 * above, the ruler on the left and 40 pixels under the ground line.
 */
export function template_sheet_layout(
    template: SkeletonTemplate,
    options: TemplateSheetOptions = {},
): TemplateSheetLayout {
    const scale = options.scale ?? 1;
    // The joints round the root on the ground (0, 0), in sheet pixels.
    const picture = options.picture ?? null;
    let joints: Record<string, [number, number]> = template_joints(template, {
        origin: [0, 0],
        scale,
    });
    if (picture?.joints !== undefined) {
        joints = {};
        for (const [name, at] of Object.entries(picture.joints)) {
            joints[name] = [
                at[0] - picture.origin[0],
                at[1] - picture.origin[1],
            ];
        }
    }
    const xs = Object.values(joints).map((at) => at[0]);
    const ys = Object.values(joints).map((at) => at[1]);
    let left = Math.min(...xs);
    let right = Math.max(...xs);
    let top = Math.min(...ys, -template.height * scale);
    let bottom = Math.max(...ys, 0);
    const size = picture_size(picture);
    if (picture !== null && size !== null) {
        left = Math.min(left, -picture.origin[0]);
        right = Math.max(right, size[0] - picture.origin[0]);
        top = Math.min(top, -picture.origin[1]);
        bottom = Math.max(bottom, size[1] - picture.origin[1]);
    }
    const room_width = Math.max(right - left, 0.6 * (bottom - top));
    const room_height = Math.max(bottom - top, 0.25 * (right - left));
    const margin = Math.round(
        Math.max(40, 0.15 * Math.max(room_width, room_height)),
    );
    const width = Math.round(
        options.width ?? RULER_ROOM + margin * 2 + room_width,
    );
    const title = options.title ?? default_title(template);
    const words = title_room(title_lines(title, width).length);
    const height = Math.round(
        options.height ?? words + margin + room_height + GROUND_ROOM,
    );
    // The figure's room in the middle of the sheet right of the ruler, standing on the ground line.
    const origin: [number, number] = [
        Math.round(
            RULER_ROOM + (width - RULER_ROOM - (right - left)) / 2 - left,
        ),
        Math.round(height - GROUND_ROOM - Math.max(0, bottom)),
    ];
    const placed: Record<string, [number, number]> = {};
    for (const [name, at] of Object.entries(joints)) {
        placed[name] = [at[0] + origin[0], at[1] + origin[1]];
    }
    return { width, height, origin, joints: placed, scale, margin, top: words };
}

/** A picture's size when its image tells it (a canvas, an image, a bitmap). */
function picture_size(picture: SheetPicture | null): [number, number] | null {
    const image = picture?.image as
        | { width?: unknown; height?: unknown }
        | undefined;
    if (
        image === undefined ||
        typeof image.width !== "number" ||
        typeof image.height !== "number"
    ) {
        return null;
    }
    return [image.width, image.height];
}

/**
 * Draws the draw-over template of a skeleton (since step 43): a white sheet with the ground line
 * and a size ruler, an existing character faint if given, the bones as light lines and every joint
 * as a dot with its name. Someone draws a character over it facing right, its feet on the line,
 * and its joints land near the dots. With `bones` it is the sheet of one layer: those bones and
 * their joints strong and named, the rest faint.
 */
export function draw_template_sheet(
    context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    template: SkeletonTemplate,
    options: TemplateSheetOptions = {},
): TemplateSheetLayout {
    const layout = template_sheet_layout(template, options);
    const { width, height, origin, joints } = layout;
    const font = options.font ?? "monospace";
    context.save();
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    // A faint grid every 50 pixels.
    context.strokeStyle = "rgba(38, 48, 106, 0.08)";
    context.lineWidth = 1;
    context.beginPath();
    for (let x = origin[0] % 50; x < width; x += 50) {
        context.moveTo(x + 0.5, 0);
        context.lineTo(x + 0.5, height);
    }
    for (let y = origin[1] % 50; y < height; y += 50) {
        context.moveTo(0, y + 0.5);
        context.lineTo(width, y + 0.5);
    }
    context.stroke();
    const picture = options.picture;
    if (picture !== undefined && picture !== null) {
        context.globalAlpha = options.picture_alpha ?? 0.3;
        context.drawImage(
            picture.image,
            origin[0] - picture.origin[0],
            origin[1] - picture.origin[1],
        );
        context.globalAlpha = 1;
    }
    // The ground line and a ruler up the left edge, every 100 pixels.
    context.strokeStyle = "#d48c17";
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(16, origin[1] + 0.5);
    context.lineTo(width - 16, origin[1] + 0.5);
    context.stroke();
    context.fillStyle = "#26306a";
    context.font = `12px ${font}`;
    context.textAlign = "left";
    context.textBaseline = "middle";
    context.strokeStyle = "#26306a";
    context.lineWidth = 1;
    context.beginPath();
    const ruler_top = layout.top + 4;
    context.moveTo(24.5, origin[1]);
    context.lineTo(24.5, ruler_top);
    for (let step = 0; origin[1] - step * 100 >= ruler_top; step++) {
        const y = origin[1] - step * 100 + 0.5;
        context.moveTo(18, y);
        context.lineTo(31, y);
        context.fillText(`${step * 100}`, 34, y);
    }
    context.stroke();
    context.fillText("Boden", width - 64, origin[1] - 10);
    // The bones: the chosen ones strong, the rest faint (all strong without a choice).
    const chosen = options.bones ?? null;
    const is_strong = (bone: string) =>
        chosen === null || chosen.includes(bone);
    const strong_joints =
        chosen === null
            ? new Set(template.joints.map((joint) => joint.name))
            : template_bone_joints(template, chosen);
    context.lineCap = "round";
    for (const strong of [false, true]) {
        const bones = template.bones.filter(
            (bone) => is_strong(bone.name) === strong,
        );
        if (bones.length === 0) {
            continue;
        }
        context.strokeStyle = strong
            ? "rgba(108, 218, 217, 0.9)"
            : "rgba(108, 218, 217, 0.3)";
        context.lineWidth = strong ? 4 : 2;
        context.beginPath();
        for (const bone of bones) {
            const from = template_point(bone.from, joints);
            const to = template_point(bone.to, joints);
            context.moveTo(from[0], from[1]);
            context.lineTo(to[0], to[1]);
        }
        context.stroke();
    }
    // The joints, the far side's hollow; the near side's words first, each where it covers no other
    // word. A joint of no chosen bone is a faint dot without a word.
    context.font = `10px ${font}`;
    const is_far = (name: string) =>
        name.endsWith("_l") || /_[hf]l$/.test(name);
    const placed: [number, number, number, number][] = [];
    const ordered = [...template.joints].sort(
        (a, b) => Number(is_far(a.name)) - Number(is_far(b.name)),
    );
    for (const joint of ordered) {
        const at = joints[joint.name];
        if (at === undefined) {
            continue;
        }
        const far = is_far(joint.name);
        const strong = strong_joints.has(joint.name);
        context.globalAlpha = strong ? 1 : 0.3;
        context.beginPath();
        context.arc(at[0], at[1], strong ? 4 : 3, 0, Math.PI * 2);
        if (far) {
            context.strokeStyle = "#26306a";
            context.lineWidth = 2;
            context.stroke();
        } else {
            context.fillStyle = "#26306a";
            context.fill();
        }
        context.globalAlpha = 1;
        if (!strong) {
            continue;
        }
        const text_width = context.measureText(joint.title).width;
        const spot = label_spot(at, text_width, 11, placed);
        if (spot !== null) {
            placed.push([spot[0], spot[1] - 9, text_width, 11]);
            context.fillStyle = "rgba(38, 48, 106, 0.75)";
            context.fillText(joint.title, spot[0], spot[1]);
        }
    }
    // The words at the top, wrapped to the sheet.
    context.fillStyle = "#26306a";
    context.font = `bold ${TITLE_SIZE}px ${font}`;
    context.textBaseline = "top";
    const lines = title_lines(options.title ?? default_title(template), width);
    lines.forEach((line, index) => {
        context.fillText(line, 16, 12 + index * (TITLE_SIZE + 4), width - 32);
    });
    context.restore();
    return layout;
}

/**
 * The draw-over template as a canvas (an `OffscreenCanvas`, else a page canvas; null without
 * either, as in Node): `draw_template_sheet()` on a sheet of its size. `toBlob` / `convertToBlob`
 * makes the PNG to download.
 */
export function template_sheet(
    template: SkeletonTemplate,
    options: TemplateSheetOptions = {},
): HTMLCanvasElement | OffscreenCanvas | null {
    const layout = template_sheet_layout(template, options);
    let canvas: HTMLCanvasElement | OffscreenCanvas | null = null;
    if (
        typeof document !== "undefined" &&
        typeof document.createElement === "function"
    ) {
        const element = document.createElement("canvas");
        if (typeof element.getContext === "function") {
            element.width = layout.width;
            element.height = layout.height;
            canvas = element;
        }
    }
    if (canvas === null && typeof OffscreenCanvas !== "undefined") {
        canvas = new OffscreenCanvas(layout.width, layout.height);
    }
    const context = canvas?.getContext("2d") as
        | CanvasRenderingContext2D
        | OffscreenCanvasRenderingContext2D
        | null
        | undefined;
    if (canvas === null || context === null || context === undefined) {
        return null;
    }
    draw_template_sheet(context, template, options);
    return canvas;
}

/**
 * Where a joint's word goes (its baseline's left end): right of the point above or below it, then
 * left, a little further out each round; null when every spot covers a word already placed.
 */
function label_spot(
    at: readonly [number, number],
    width: number,
    height: number,
    placed: readonly (readonly [number, number, number, number])[],
): [number, number] | null {
    for (const reach of [7, 14, 22]) {
        const spots: [number, number][] = [
            [at[0] + reach, at[1] - 4],
            [at[0] + reach, at[1] + 10],
            [at[0] - reach - width, at[1] - 4],
            [at[0] - reach - width, at[1] + 10],
        ];
        for (const [x, y] of spots) {
            const top = y - 9;
            const overlaps = placed.some(
                ([left, other_top, other_width, other_height]) =>
                    x < left + other_width + 2 &&
                    x + width + 2 > left &&
                    top < other_top + other_height &&
                    top + height > other_top,
            );
            if (!overlaps) {
                return [x, y];
            }
        }
    }
    return null;
}
