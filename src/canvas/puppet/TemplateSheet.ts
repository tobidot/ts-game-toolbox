import {
    JointPoints,
    SkeletonTemplate,
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
    /** The sheet's size in pixels; default 1.4 times the template's height tall, as wide as tall. */
    readonly width?: number;
    readonly height?: number;
    /** Pixels per template unit. Default 1 (a Zweibeiner about 390 pixels tall). */
    readonly scale?: number;
    /** An existing character, faint under the joints (for a new skin of it). */
    readonly picture?: SheetPicture | null;
    /** How strongly the character shows. Default 0.3. */
    readonly picture_alpha?: number;
    /** The words at the top. Default: the template's title and how to draw on it. */
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
}

/** The sheet's size and where the joints go on it (shared by the drawing and its tests). */
export function template_sheet_layout(
    template: SkeletonTemplate,
    options: TemplateSheetOptions = {},
): TemplateSheetLayout {
    const scale = options.scale ?? 1;
    const xs = template.joints.map((joint) => joint.at[0]);
    const span = (Math.max(...xs) - Math.min(...xs)) * scale;
    const tall = template.height * scale;
    const height = Math.round(options.height ?? Math.max(240, tall * 1.4 + 60));
    const width = Math.round(options.width ?? Math.max(height, span + 160));
    const raw: Record<string, [number, number]> = {};
    for (const joint of template.joints) {
        raw[joint.name] = [joint.at[0], joint.at[1]];
    }
    const root_x = template_point(template.root, raw)[0];
    const middle = (Math.max(...xs) + Math.min(...xs)) / 2;
    const origin: [number, number] = [
        Math.round(width / 2 + (root_x - middle) * scale),
        Math.round(height - Math.max(40, (height - tall) / 3)),
    ];
    let joints = template_joints(template, { origin, scale });
    const picture = options.picture;
    if (picture?.joints !== undefined) {
        joints = {};
        for (const [name, at] of Object.entries(picture.joints)) {
            joints[name] = [
                at[0] - picture.origin[0] + origin[0],
                at[1] - picture.origin[1] + origin[1],
            ];
        }
    }
    return { width, height, origin, joints, scale };
}

/**
 * Draws the draw-over template of a skeleton (since step 43): a white sheet with the ground line
 * and a size ruler, an existing character faint if given, the bones as light lines and every joint
 * as a dot with its name. Someone draws a character over it facing right, its feet on the line,
 * and its joints land near the dots.
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
    context.moveTo(24.5, origin[1]);
    context.lineTo(24.5, 40);
    for (let step = 0; origin[1] - step * 100 >= 40; step++) {
        const y = origin[1] - step * 100 + 0.5;
        context.moveTo(18, y);
        context.lineTo(31, y);
        context.fillText(`${step * 100}`, 34, y);
    }
    context.stroke();
    context.fillText("Boden", width - 64, origin[1] - 10);
    // The bones.
    context.strokeStyle = "rgba(108, 218, 217, 0.9)";
    context.lineWidth = 4;
    context.lineCap = "round";
    context.beginPath();
    for (const bone of template.bones) {
        const from = template_point(bone.from, joints);
        const to = template_point(bone.to, joints);
        context.moveTo(from[0], from[1]);
        context.lineTo(to[0], to[1]);
    }
    context.stroke();
    // The joints, the far side's hollow; the near side's words first, each where it covers no other word.
    context.font = `10px ${font}`;
    const is_far = (name: string) => name.endsWith("_l") || /_[hf]l$/.test(name);
    const placed: [number, number, number, number][] = [];
    const ordered = [...template.joints].sort((a, b) => Number(is_far(a.name)) - Number(is_far(b.name)));
    for (const joint of ordered) {
        const at = joints[joint.name];
        if (at === undefined) {
            continue;
        }
        const far = is_far(joint.name);
        context.beginPath();
        context.arc(at[0], at[1], 4, 0, Math.PI * 2);
        if (far) {
            context.strokeStyle = "#26306a";
            context.lineWidth = 2;
            context.stroke();
        } else {
            context.fillStyle = "#26306a";
            context.fill();
        }
        const text_width = context.measureText(joint.title).width;
        const spot = label_spot(at, text_width, 11, placed);
        if (spot !== null) {
            placed.push([spot[0], spot[1] - 9, text_width, 11]);
            context.fillStyle = "rgba(38, 48, 106, 0.75)";
            context.fillText(joint.title, spot[0], spot[1]);
        }
    }
    context.fillStyle = "#26306a";
    context.font = `bold 15px ${font}`;
    context.textBaseline = "top";
    context.fillText(
        options.title ??
            `${template.title}: nach rechts schauen, Füße auf die Linie, ferne Glieder (hohle Punkte) auf eine eigene Ebene.`,
        16,
        12,
        width - 32,
    );
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
                    x < left + other_width + 2 && x + width + 2 > left && top < other_top + other_height && top + height > other_top,
            );
            if (!overlaps) {
                return [x, y];
            }
        }
    }
    return null;
}
