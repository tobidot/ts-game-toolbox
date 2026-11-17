# Sprite animation

A sprite sheet is one picture full of frames; clips play some of them, one after the other, and a player per sprite says which frame shows now. Pictures don't blend: that's what a sheet can't do. Since 6.1.0 (`canvas/animation`), first used by Spielwerk step 32, Daumenkino.

- **`SpriteSheet`**: the frames (rectangles in one picture), the clips by name, the anchor and the default clip.
- **`AnimationClip`**: one clip, made from plain data.
- **`AnimationPlayer`**: plays the clips of a sheet for one sprite: `play`, `queue`, `then`, `speed`, `paused`, and frame events on an `EventSocket`.

## A sheet in three lines

```ts
const sheet = SpriteSheet.grid(image, 32, 32).add_clips({
    idle: { frames: "0-3", fps: 6, loop: true },
    walk: { frames: "8-15", fps: 12, loop: true, events: { 3: "step", 7: "step" } },
    jump: { frames: "16-21", fps: 12, then: "idle" },
}, "idle");

const hero = sheet.player("walk");   // one player per sprite; many share a sheet

// every frame:
hero.update(delta_seconds);
hero.draw(context, hero_x, hero_y, { flip_x: facing_left });
```

- **`SpriteSheet.grid(image, frame_width, frame_height, options?)`** cuts the picture row by row from the top left: cell `n` is at column `n % columns`, row `floor(n / columns)`. Options: `columns` and `rows` (default: as many as fit the picture; say them when there is no picture yet), `count` (a last row that isn't full), `margin` and `spacing` in pixels, `anchor`.
- **`SpriteSheet.from_frames(image, rects, anchor?)`** takes frames of any size, packed anywhere (an atlas).
- **`SpriteSheet.from_data(image, data)`** takes a whole sheet as plain data (below): frames, anchor, clips and default clip.
- **`anchor`** is the point of every frame that is drawn at the sprite's position: the feet for a character, so it stands on the floor whatever the frame. Without one the frame's middle is drawn there.
- **`draw_frame(context, frame, x, y, { scale, flip_x })`** draws one frame with its anchor at `x`, `y`; `flip_x` mirrors it around the anchor, so a sprite drawn facing right faces left. It answers false while the picture or the frame isn't there. The player's `draw()` is the same for its current frame. Smoothing is the context's: off for pixel art, on for a rendered picture.

## Clips as plain data

```ts
interface ClipData {
    frames: string | number[];   // "0-7", "7-0", "0-3, 8, 10-12", or [0, 1, 2, 1]
    fps?: number;                // default 12
    durations?: number[];        // seconds per frame, where one frame must hold longer
    loop?: boolean | "ping-pong";// default false: once, stopping on the last frame
    then?: string;               // the clip after a clip played once
    events?: Record<string, string>;  // { 3: "step" }: names for frames, counted within the clip
}
```

A sheet as data has the frame size, the grid and the clips:

```ts
interface SheetData {
    frame_width: number; frame_height: number; columns: number; rows?: number;
    margin?: number; spacing?: number;
    anchor?: { x: number; y: number };
    default?: string;
    clips?: Record<string, ClipData>;
}
```

This is the shape of a catalogue entry's `sheet` (`dll-tce-assets` 0.4.0 and later), so an entry feeds `SpriteSheet.from_data()` as it is; the toolbox doesn't depend on the catalogue. `fps` may be uneven (12.27 keeps the timing of the video a clip was cut from).

## The player

- **`play(name, { restart? })`** switches at once, from the clip's first frame, and forgets the queue. The clip playing already goes on where it is, so a game may say `play("walk")` every frame while the walk key is held; `restart: true` starts it over.
- **`queue(name)`** plays `name` when the current clip ends: a loop at the end of its round, a clip played once after its last frame (instead of its `then`). Nothing playing, or a clip that stopped: at once.
- **`then`**: a clip played once goes on with the clip it names (`jump` → `idle`). Without `then` it stops on its last frame and `finished` is true.
- **`ping-pong`** turns at both ends and plays on: 0 1 2 3 2 1 0 1 …
- **Time carries over.** What is left of an update when a clip ends counts for the next one, so a queued clip starts exactly at the end, not a frame later.
- **`speed`** scales time: 2 plays twice as fast, 0.1 shows single frames, 0 stands. `paused` stops time.
- **What it says:** `clip` (the `AnimationClip`), `clip_name`, `frame_index` (within the clip), `frame` (the sheet's frame, -1 while there is none), `frame_time`, `queued`, `finished`.
- **`play()` and `queue()` answer false** for a name the sheet doesn't have; nothing changes then.

### Frame events

A named frame sends an `AnimationFrameEvent` (`name`, `clip`, `frame_index`, `frame`) on `events` each time it comes up, also when one update passes several frames, so a footstep sound or a puff of dust sits on its frame at any speed. The first frame of a clip comes up at the first `update()` after it started. A clip that ends sends an `AnimationEndEvent` (`clip`, `next`: the clip that follows, or null when it stops).

```ts
hero.events.attach(AnimationFrameEvent, (event) => {
    if (event.name === "step") {
        audio.play_sound("step");
    }
});
```

### Speed as a trick

`speed` changes how fast the pictures turn, not what they show. A walk at 1.6 times its speed reads as a hurried walk, almost a run, without a frame of its own; a character that moves across the screen should move at the same factor, or the feet slide. A run cut from its own video looks different (longer steps, a lean): Daumenkino lets both be compared.

## In the game shell

A picture of `settings.catalogue_images` whose catalogue entry has sheet data brings its frames and clips along: the host's `load_catalogue_url()` answers with `sheet` in the `CatalogueFile`, and the shell puts it into `references.sheet(name)`. `logic.load_animation(name, clip?)` is then a playing sprite in one line:

```ts
class KinoSettings extends CanvasGameSettings {
    public override readonly catalogue_images = { cob: "rendered/character/cabbage-cob" };
}

// in the logic:
protected create_game(seed: number): Game {
    return new Game({ seed, player: this.load_animation("cob") });
}
```

The player exists at once and waits while the data is on its way: its `frame` is -1 and `draw()` draws nothing; it starts the clip it was told (or the sheet's default clip) as soon as the sheet has it, and draws once the picture has come. `references.sheet(name)` also takes a game's own data: `this.references.sheet("hero").set_data(data)` for a picture of `settings.images`. `@tce-v3/game-boot` fills the hook from `dll-tce-assets`.

## Without a picture

A sheet and its players work without a picture (`SpriteSheet.grid(null, 32, 32, { columns: 8, rows: 2 })`, `from_data(null, data)`, `new SpriteSheet()`): a game's rules and its tests can run the clips, and the renderer draws once `sheet.image` is set.
