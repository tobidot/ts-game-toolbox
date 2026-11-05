/** `text` broken into lines no wider than `max_width` in the context's current font. */
export function wrap_text(
    context: CanvasRenderingContext2D,
    text: string,
    max_width: number,
): string[] {
    const lines: string[] = [];
    let line = "";
    for (const word of text.split(/\s+/).filter(Boolean)) {
        const candidate = line === "" ? word : `${line} ${word}`;
        if (line !== "" && context.measureText(candidate).width > max_width) {
            lines.push(line);
            line = word;
        } else {
            line = candidate;
        }
    }
    if (line !== "") {
        lines.push(line);
    }
    return lines;
}

/** `text` as it fits `max_width` in the context's current font, ending in an ellipsis if it must. */
export function ellipsize_text(
    context: CanvasRenderingContext2D,
    text: string,
    max_width: number,
): string {
    if (context.measureText(text).width <= max_width) {
        return text;
    }
    let low = 0;
    let high = text.length;
    while (low < high) {
        const middle = Math.ceil((low + high) / 2);
        const candidate = `${text.slice(0, middle).trimEnd()}…`;
        if (context.measureText(candidate).width <= max_width) {
            low = middle;
        } else {
            high = middle - 1;
        }
    }
    return `${text.slice(0, low).trimEnd()}…`;
}
