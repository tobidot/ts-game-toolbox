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
- **`SpriteSheet.from_frames(image, rects, anchor?)`** takes frames of any size, packed anywhere (an atlas); a frame may bring its own `anchor` (a `SheetFrame`, see [Per-frame anchors](#per-frame-anchors)).
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

## Crowds

Thousands of animated sprites of one sheet, each with its own clip and pace: a market full of people, a flock, an army. Since 6.2.0, first used by Spielwerk step 37, Gewimmel. Three things help, from least to most work for the game:

1. **Draw the players through a `SpriteBatch`**: `batch.add_animation(player, x, y, { flip_x, scale })` adds the frame a player shows now; `batch.draw(context)` draws all of them in one run per picture.
2. **Draw from a picture the size it is shown**: `sheet.prescale(scale)` once the picture is there.
3. **Keep the crowd in flat arrays**: one `CrowdAnimation` instead of a player per sprite; `crowd.update(dt)` and `crowd.draw(batch, positions)`.

```ts
// one player per person, drawn through the batch
const batch = new SpriteBatch();
for (const person of people) {
    batch.add_animation(person.player, person.x, person.y, { flip_x: person.dx > 0, scale: 0.4 });
}
batch.draw(context);

// or the whole crowd in one object
const crowd = new CrowdAnimation(sheet, 1000, { random: new SeededRandom(seed), events: false });
const index = crowd.add("walk", { speed: 0.9 });  // a random start in the walk, so they don't walk in step
crowd.play(index, "wave");                          // a clip played once goes on with its `then`
crowd.set_flip(index, true);
crowd.update(delta_seconds);
crowd.draw(batch, positions, { order: by_y, scale: 0.4 });   // positions: x0, y0, x1, y1, ... by member
batch.draw(context);
```

### Sheet frames in the batch

- **`add_frame(image, rect, x, y, { anchor, scale, flip_x, angle, picture_scale })`** adds the part `rect` of a picture with its `anchor` (default: the middle) at `x`, `y`. `add_animation(player, x, y, options)` is the same for the player's current frame and the sheet's anchor for it; it answers false while the picture or the frame isn't there.
- **Fewer transforms.** An unturned frame is drawn on the context's own transform; mirrored frames share one mirrored transform, so the batch only switches where flipped and unflipped ones take turns. A turned frame gets one `setTransform` of its own. `add()` (whole pictures, step 29) is unchanged.
- **Order.** Within a picture, sprites keep the order they were added in: add them sorted by y and the people in front cover the ones behind. Between pictures, the first picture added is drawn first. Something that stands among the crowd (a stall, a tree) goes between two `draw()` calls: draw the people above it, then it, then the rest.

### Per-frame anchors

A packer that trims frames gives each one its own pivot. `SpriteSheet.from_frames(image, frames, anchor?)` takes a `SheetFrame` per frame (`left`, `top`, `width`, `height` and an optional `anchor`); a frame without one uses the sheet's `anchor`, or its middle. `sheet.anchor_of(frame)` answers which; `draw_frame`, the batch and the crowd use it.

### A picture the size it is shown

`sheet.prescale(scale, make_canvas?)` draws the picture once at `scale` into a canvas and draws from that from now on (`picture_scale` says how much smaller it is). Frames, anchors and drawn sizes stay in the first picture's pixels, so nothing else changes. Choose the scale the sprites are shown at on the screen (their scale times the view's times the stage's), and make it again when that changes by much: set `sheet.image` back to the first picture (that resets it) and call `prescale` anew. It only shrinks. The cabbage kid's sheet is 1980 × 2048 and shown at about a third: on a graphics card that carried about a third more sprites (table below); in a software canvas it was within the noise.

### `CrowdAnimation`

- **`new CrowdAnimation(sheet, capacity?, { random, events })`**: room for `capacity` members at first (it grows); `random` draws the start times (default seeded with 1); `events: false` sends no `CrowdFrameEvent`s and builds none.
- **`add(clip, { speed, time, flip_x, scale })`** returns the member's number. Without `time` a looping clip starts at a random point of one pass (a clip played once at its start): a crowd doesn't walk in step, and the same seed gives the same crowd. The frames a start time skips send no events.
- **`remove(index)`** moves the last member into the gap, as a game's own arrays do, and returns the number it had (-1 when `index` was the last). `clear()` empties it.
- **`play(index, clip, { restart })`**, `update(dt)`, `frame_of(index)`, `frame_index_of`, `clip_of`, `is_finished`; `speed_of`/`set_speed`, `is_flipped`/`set_flip`, `scale_of`/`set_scale`; `count`, `capacity`.
- **Exactly a player's frames.** Members play the same frames a single `AnimationPlayer` would (`then`, ping-pong, time carried over, at any speed); tested frame for frame against 1 000 players. They have no queue and no pause (speed 0 stands).
- **`draw(batch, positions, { order, count, scale })`** adds each member's frame to a batch: member `i` at `positions[2 i]`, `positions[2 i + 1]`, in `order` if given (an `Int32Array` of members sorted by y, or a part of it), at `scale` times its own. It answers how many it added; none while the sheet has no picture.
- **Events.** A named frame sends a `CrowdFrameEvent` (`member`, `name`, `clip`, `frame_index`, `frame`) on `events`. A single player can be quiet too: `player.sends_events = false`.

### What it costs

Measured in Spielwerk 37 (Gewimmel): the cabbage kid's sheet, people walking on a market square seen at an angle, about 38 × 37 pixels each, sorted by y with eight stalls in between. "Messen" counts the most walking people that still give 57 FPS or more (double from 100, then halve the gap); Intel i7-11700F.

| Drawing | RTX 4070, Chrome in a window (ANGLE OpenGL) | Headless Chromium (SwiftShader, software canvas) |
| --- | --- | --- |
| Each player alone (`player.draw`) | 6 000–6 400 | 2 000–2 200 |
| Players through the batch (`add_animation`) | 7 200–7 600 | 2 000–2 200 |
| `CrowdAnimation` through the batch | 7 200–7 600 | 1 900–2 200 |
| The same three from the whole 1980 × 2048 sheet | 1 600–5 200 / 5 600 / 5 600 | 1 700 / 1 900 / 2 000 |

Updating is not what limits a crowd: in Node 22, 1 000 walkers update in 0.024 ms as players and 0.012 ms as a crowd, 20 000 in 0.16 ms and 0.22 ms (Chrome: 0.012 ms for 1 000 in the crowd); `CrowdAnimation` saves objects (one per sprite, with its event socket), not time. The rest is putting pixels on the canvas: in software every way stops near 2 000, on a graphics card the batch carries a fifth more than single draws and a picture the size it is shown a third more again. Headless Chrome on the card (`--enable-gpu`) measured like software: its compositor stays in software.
