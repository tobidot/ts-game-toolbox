/**
 * One clip as plain data: which frames of the sheet, how fast, and what happens at the end. The
 * same shape as a clip in a catalogue entry's `sheet` (dll-tce-assets 0.4.0), so an entry feeds
 * a `SpriteSheet` as it is.
 */
export interface ClipData {
    /**
     * The sheet's frames in the order they play: a range of cells (`"0-7"`, backwards `"7-0"`),
     * several parts (`"0-3, 8, 10-12"`) or a list (`[0, 1, 2, 1]`).
     */
    readonly frames: string | readonly number[];
    /** Frames per second. Default 12. */
    readonly fps?: number;
    /** Seconds per frame, by frame within the clip; a frame without one takes `1 / fps`. */
    readonly durations?: readonly number[];
    /**
     * `true` starts over at the end; `"ping-pong"` turns at both ends and plays on; `false` (the
     * default) stops on the last frame, and `then` follows if it names a clip.
     */
    readonly loop?: boolean | "ping-pong";
    /** The clip that follows a clip played once. */
    readonly then?: string;
    /**
     * Names for frames, counted within the clip from 0 (`{ 3: "step" }`): the player sends an
     * `AnimationFrameEvent` each time such a frame comes up.
     */
    readonly events?: Readonly<Record<string, string>>;
    /** Where the clip starts in the grid, for people reading the sheet; the player ignores it. */
    readonly row?: number;
}

/**
 * A sheet as plain data: equal frames in a grid, numbered row by row from the top left, the clips
 * that play them and the clip a new player starts with. A catalogue entry's `sheet` has this
 * shape (`margin` and `spacing` are the toolbox's own and default to 0).
 */
export interface SheetData {
    readonly frame_width: number;
    readonly frame_height: number;
    readonly columns: number;
    /** Default: as many as the picture holds, or as the clips need when there is no picture yet. */
    readonly rows?: number;
    /** Space around the grid, in pixels. */
    readonly margin?: number;
    /** Space between two frames, in pixels. */
    readonly spacing?: number;
    /** The point of each frame drawn at the sprite's position (the feet). Default: the middle. */
    readonly anchor?: { readonly x: number; readonly y: number };
    /** The clip a new player starts with. Default: the first clip. */
    readonly default?: string;
    readonly clips?: Readonly<Record<string, ClipData>>;
}
