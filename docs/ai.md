# Ts Game Toolbox - AI Documentation Context

This file provides a consolidated view of the library's documentation, optimized for ingestion by AI agents (LLMs). It is the single docs in `docs/` put together, one section each; the package is `@game.object/ts-game-toolbox`. What changed between versions, and how to migrate to 6.0.0: `changelog/v6.md` (one document per major version in `changelog/`).

## Table of Contents
1. [Overview](#overview)
2. [Assets](#assets)
3. [Game Shell](#game-shell)
4. [Geometries](#geometries)
5. [Trees](#trees)
6. [Signals](#signals)
7. [Flow](#flow)
8. [UI](#ui)
9. [Physics](#physics)
10. [Miscellaneous](#miscellaneous)

## Overview
Ts Game Toolbox is a collection of reusable functions and classes for Games or Programs developed in Javascript/Typescript. Everything is exported from the package root.

Coordinates are 2D screen coordinates: `+x` is right, `+y` is down. Angles are radians, 0 points right, and positive angles turn clockwise on screen, as the canvas's `rotate()` does.

Code style of the library: snake_case for functions and fields, every `if`/`else`/loop body in braces.

---

## Assets

Tools to help with loading, storing, and retrieving various types of assets.

### AssetManager

The `AssetManager` loads pictures, sounds and videos and keeps them by name in `images`, `audios` and `videos`: maps of `Asset`s (`element`, `url`, `ready`). The canvas game shell's renderer (`paint_image()`), `AudioPlayer` and the `Image`, `Gallery` and `Video` widgets find them there.

There are two ways in: `load()` takes a record of names and URLs at once and resolves when all are there (files that ship with the game), `request()` queues files one by one, many of them, off the network.

#### Loading a set at once

```typescript
import { AssetManager, Progress } from "@game.object/ts-game-toolbox";

const manager = new AssetManager();
const progress = new Progress();

progress.listen((percent) => {
    console.log(`Loading: ${Math.round(percent * 100)}%`);
});

await manager.load(
    {
        images: {
            hero: "/assets/images/hero.png",
            background: "/assets/images/bg.jpg",
        },
        audio: {
            jump: "/assets/audio/jump.mp3",
            music: "/assets/audio/theme.mp3",
        },
    },
    progress,
);

// Accessing assets
const hero_image = manager.images.get("hero")?.element;
const jump_sound = manager.audios.get("jump")?.element;
```

- `load(assets: { images?, audio?, videos? }, progress: Progress): Promise<void>`: Loads all three kinds.
- `load_images(assets: Record<string, string>, progress: Progress)`, `load_audio(...)`, `load_videos(...)`: One kind. The record may come from `import.meta.glob("/assets/images/**/*.png", { query: "url", eager: true, import: "default" })`.
- The promise rejects when a file fails; the failed file still counts as finished in `progress`.
- `list_pending(): string[]`: The names of the files that are still loading.

#### Requesting files one by one

`request()` is for files off the network, many of them: a gallery, a catalogue, a level's pictures. They wait in a queue and load `max_parallel` (default 4) at a time, lowest `priority` first; the game may change a priority while a file waits, say for the ones scrolled into view. Each file has its own state, a reason when it failed and its own progress.

```typescript
const assets = new AssetManager();

for (const entry of catalogue) {
    assets.request({
        name: entry.name,
        url: entry.url,
        kind: "image", // or "audio", "video"
        priority: entry.is_visible ? 0 : 10, // lower loads first; default 0
    });
}
assets.set_priority("sunset", -1); // opened: load it next

const load = assets.loads.get("sunset");
if (load?.state === "ready") {
    show(assets.images.get("sunset")?.element);
} else if (load?.state === "failed") {
    say(`could not load: ${load.reason}`);
} else if (load !== undefined) {
    draw_bar(load.progress.get_percent());
}
```

- **`request(request: AssetRequest): AssetLoad`**: `name` (the key in `images`, `audios` or `videos`), `url`, `kind`, `priority?`, `cors?`. A name asked for again gets the load it already has, with the new priority when one is given.
- **`AssetLoad`**: `state` is `"queued"`, `"loading"`, `"ready"` or `"failed"` (`AssetLoadState`); `is_finished` once it is ready or failed. `reason` says why it failed (`HTTP 404`, `timed out`, `could not be loaded`, `network error: ...`). `loaded_bytes` and `total_bytes` (when the server sent `Content-Length`), and `progress`, this file's `Progress`: by bytes while they come, whole when it is ready or failed.
- **`set_priority(name, priority)`**: changes when a waiting file loads; one that already loads goes on.
- **`cancel(name)`**: withdraws a file that still waits, as if it had never been asked for: it leaves the queue, `loads`, `counts` and `progress`, and a later `request()` queues it afresh. A file that loads or finished stays. Returns whether it was withdrawn.
- **The whole queue.** `loads` keeps every requested file by name. `progress` is all of them together (a failed file counts as finished), `counts` the number in each state, `loaded_bytes` the bytes so far.
- **Limits.** `max_parallel` (default 4) files at the same time; a file that takes longer than `timeout_ms` (default 30000) fails with `timed out`.
- **Bytes or element.** A file on the page's own origin, or one requested with `cors: true` (its server sends CORS headers), is fetched as bytes: its progress follows them and a missing one fails with `HTTP 404`. Any other URL goes straight into its element, which loads without CORS and has no byte progress.
- **Tests.** `new AssetManager(options)` takes `AssetManagerOptions`: `fetch` (default the global one; `null` never fetches), `create_element(kind)` for fake elements, and `origin` (default `location.origin`).

In the canvas game shell, `references.assets` is the game's `AssetManager`, and a file from its `request()` repaints the game when it arrives. Step 28 (Artbook) loads a whole catalogue this way, pictures by visible position first, films when opened.

---

## Game Shell

The canvas game shell runs a browser game as a custom element: it reads the attributes, plays the intro, fits the canvas into any window, routes the input, loads the images and sounds, and drives a throttled frame loop. A game writes its rules and its painting; the rest is the shell's. It lives in `src/game-element/`, on top of `src/stage/` and `src/audio/`, which also work on their own.

Every game of the Spielwerk series is built on it; the series template (`collection-spielwerk/_template/src/`) is the smallest real one.

### The five parts

- **`CanvasGameSettings`**: everything constant: the title, the layouts, the frame rate, colors, images, sounds, themes. A game subclasses it and overrides what differs.
- **`CanvasGameReferences`**: the DOM, built once: the shadow root, the `CanvasStage`, a status line for screen readers, and the `AssetManager` (`assets`). Most games use it as it is.
- **`CanvasGameProperties`**: the mutable state: the game, the seed, the UI page, the keyboard, the sound player. It survives a disconnect and reconnect (a window being moved). A game subclasses it for its own state and widgets.
- **`CanvasGameRenderer`**: pure painting. A game implements `paint()`; the shell clears the canvas before it and draws the UI page after it.
- **`CanvasGameLogic`**: the lifecycle and the hooks. A game implements `create_game(seed)` and overrides the hooks it needs.

The game itself (`G` in the type parameters) is a plain class without DOM, so tests can run it alone. The element is a `CanvasGameElement` that names the five classes in `assemble()`.

### A whole game

A ball that bounces by itself and a button that starts over, shortened from the Spielwerk template:

```ts
class Game {
    public ball = { x: 480, y: 120, vy: 0 };

    public constructor(public readonly seed: number) {}

    public update(delta_seconds: number): void {
        this.ball.vy += 900 * delta_seconds;
        this.ball.y += this.ball.vy * delta_seconds;
        if (this.ball.y > 600) {
            this.ball.y = 600;
            this.ball.vy = -this.ball.vy;
        }
    }
}

class BallSettings extends CanvasGameSettings {
    public override readonly title = "Ball";
    public override readonly rule = "Ein Ball, der von selbst springt.";
    /** Space restarts; the page must not scroll. */
    public override readonly game_keys = [" "];
}

class BallProperties extends CanvasGameProperties<Game, BallSettings> {
    public readonly restart_button: Button;

    public constructor(settings: BallSettings, intro: IntroGate) {
        super(settings, intro);
        this.restart_button = this.place(
            new Button("Neustart", UNPLACED),
            (layout) => ({ left: layout.width - 184, top: 16, width: 160, height: 36 }),
        );
    }
}

class BallRenderer extends CanvasGameRenderer<Game, BallSettings> {
    protected paint(
        _context: CanvasRenderingContext2D,
        layout: StageLayout,
        frame: GameFrame<Game>,
    ): void {
        const ball = frame.game.ball;
        this.disc(ball.x, ball.y, 24, this.settings.colors.orange);
        this.text(`Seed ${frame.game.seed}`, 24, layout.height - 40);
    }
}

class BallLogic extends CanvasGameLogic<Game, BallSettings, BallProperties> {
    protected create_game(seed: number): Game {
        return new Game(seed);
    }

    protected override on_start(): void {
        this.on_click(this.properties.restart_button, () => {
            this.restart();
        });
    }

    /** The ball moves on its own: every frame changes the screen. */
    protected override update(game: Game, delta_seconds: number): boolean {
        game.update(delta_seconds);
        return true;
    }

    protected override on_key_press(event: KeyboardEvent): void {
        if (event.key === " ") {
            this.restart();
        }
    }
}

class BallElement extends CanvasGameElement<BallLogic> {
    public readonly logic = this.assemble({
        settings: BallSettings,
        properties: BallProperties,
        renderer: BallRenderer,
        logic: BallLogic,
    });
}
customElements.define("ball-game", BallElement);
```

`<ball-game init-seed="4711" init-intro="false"></ball-game>` on a page shows it.

### The element

- **`assemble(parts)`** builds the five parts in order. `references` and `properties` may be left out when the base classes do; `css` adds styles to the shadow root.
- **Attributes.** `init-seed` (a whole number; omitted: random) and `init-intro` (`false` skips the intro) are read once, at the first connection. A game reads its own in the logic's `read_attributes(read)`.
- **Hooks for a host.** `load_intro_url()` says where the intro video comes from; the default rejects, which skips the intro. `on_connected(title)` runs after every connection (a desktop retitles its window there). The Spielwerk's `SpielwerkElement` fills both.
- **Seeds.** Game n of an element is created with `init-seed + n` (`properties.restarts`). `restart()` starts the next game of the series; the same seed replays the same series.

### Settings

Override what differs; everything has a default.

- **Look and size.** `title`, `rule` (one line on the start screen), `layouts` (default one of 960 x 640), `colors` (`HOUSE_COLORS`), `background`, `font_family`, `button_font_size`, `label_font_size`, `slider_font_size`, `radius`, `press_transition_seconds`.
- **`layout_for`**: for a game that arranges itself in whatever room it gets. It makes the layout for the stage's size in CSS pixels on every resize; `layouts` then only holds what shows before the stage was measured, usually `[layout_for(960, 640)]`.
- **`frames_per_second`** (default 30). A still game repaints only when something changed.
- **Keys.** `game_keys` lose their browser default (scrolling) once the game runs. `next_round_keys` (Space, Enter) start the next round on a finished one.
- **Rounds.** `round_end_hold_seconds` (default 0): an end card stays this long before a press can start the next round, so a press meant for the game doesn't skip it.
- **Themes.** `themes` maps names to theme rules, and `theme_fade_seconds` fades between them. See "Themes" below.
- **Files.** `images` and `sounds` map names to imported files; the shell loads them when the element starts. `music` names the track from `sounds` that loops while the game can be played. `sound_mute_key` (`s`) and `music_mute_key` (`m`) do what the mute buttons do; `mute_answer_sound` (`select`) is what a mute button answers with.
- **Intro and start screen.** `intro_timeout_ms` (6000), `intro_hold_ms` (1500), `start_button`, `start_hint`.

### Properties

- **State.** `game`, `seed`, `restarts`, `best` (a `SessionBest`), `pointer` (the last pointer position in layout coordinates, null when it left), `layout` (the stage's choice), `is_dirty` (set it when something changed outside `update()`).
- **`frame_seconds`**: how long the last frame really took. `update()` gets the same time capped at 0.1 s, so a slow frame can't throw the game; this one is for a frame rate meter or a `FrameBudget`.
- **Input.** `ui` and `page`, the toolbox UI on the canvas; `keyboard`, a `KeyboardState` to read in `update()`; `menu_inputs`, the `MenuInput`s the shell hands the keys (every placed `MenuView` brings its own).
- **Sound.** `audio`, an `AudioPlayer` over the loaded sounds; `sound_button` and `music_button`, see below.
- **`place(widget, rect_of, parent = page)`** adds a widget and keeps it at `rect_of(layout)` in every layout the stage picks. Build the widget with `UNPLACED`; the rect comes from the layout. `place_widgets()` moves them all again, for a rule that depends on game state.
- **Themes.** `set_theme(rules, fade_seconds = 0)` swaps the game's theme rules; the house rules stay underneath and the layout's `theme_rules` on top. `show_theme(name)` shows one of `settings.themes`, and `blended(table)` gives a game's own table per theme name (the colors it paints) as it stands right now, in step with the widgets during a fade. Usually the logic's `theme_name(game)` decides and the shell calls `show_theme()`.

The house look (`default_theme(settings)`) gives every widget a finished look with no rules at all, and button classes `primary`, `accent`, `secondary` and `off`. Widgets, states and theme rules: see [ui.md](ui.md).

### The renderer

`paint(context, layout, frame)` paints the scene in layout coordinates. `frame.game` is the game, `frame.ui` the UI manager; a game that needs more extends `GameFrame<G>` and returns the extras from the logic's `frame(game)`.

- **Text.** `text(content, x, y, style)` sets font, color, alignment and an optional `max_width` in one call (`{ ...CENTRED, size: 24 }` centres it). `caption()`, `fill_lines()`, `fill_wrapped()`, `wrap()`.
- **Cards.** `card(rect, color)`, `outline()`, `inner_outline()`, `pill()`, `stat()` (a HUD card), `bar(rect, fraction)`, `panel(width, height, top?)`, `clip_round()`, `dim()`.
- **`message_card(rect, text, style?)`**: a message on a card of its own, wrapped and centred vertically. Returns the number of lines.
- **`result_panel(result)`**: the end of a round: title, the big value, the session best, the round's numbers, and a pill with what to press next (grey while `is_action_ready` is false; pass the logic's `is_round_end_ready` through the frame).
- **Shapes.** `disc()`, `ellipse()`, `polygon(points, fill, outline?)`. `trace_polygon(points)` only adds the outline to the current path: many shapes traced into one path cost one `fill()`, which is what a scene of thousands needs.
- **`paint_image(name, rect, style?)`** paints a loaded image by name, `is_contained` to keep its proportions, `is_smooth` for photos (default off: pixel art stays sharp). Until the image has arrived it paints nothing and returns false; the shell repaints when it arrives.
- **`visible`**: all the canvas shows in layout coordinates, the layout and the margins around it. A sky that runs to the screen's edge paints this, not the layout.
- **Start screen.** It comes for free: the title, `settings.rule` (or `start_subtitle(game)`), the start button. `paint_start_backdrop()` paints a scene behind it, `start_picture_height` and `paint_start_picture()` a picture above the title, `start_card` a card behind both. Layouts that are `HeaderLayout`s get the title and rule in the game screen too, with `paint_header()`.

```ts
const BUSH_CELLS: Vector2I[][] = [];

class BushRenderer extends CanvasGameRenderer<Game> {
    protected paint(context: CanvasRenderingContext2D, layout: StageLayout): void {
        if (!this.paint_image("map", { left: 0, top: 0, width: layout.width, height: layout.height })) {
            this.message_card({ left: 280, top: 280, width: 400, height: 80 }, "Die Karte lädt ...");
        }
        context.beginPath();
        for (const cell of BUSH_CELLS) {
            this.trace_polygon(cell);
        }
        context.fillStyle = this.settings.colors.turquoise;
        context.fill();
    }
}
```

### The logic

- **The game.** `create_game(seed)` is the one hook a game must write. `on_new_game(game)` follows every new game.
- **The frame.** `update(game, delta_seconds)` moves the game and returns true when the screen changed; it runs only after the intro. `sync(game)` runs before every repaint, for what follows from the state outside the picture: which widgets show, their labels and classes. `frame(game)` adds the renderer's extras.
- **Input.** `on_press`, `on_move`, `on_release` and `on_leave` get what the UI didn't take, in layout coordinates. `on_wheel(point, pixels, event)` returns true when the game used the wheel; the page then doesn't scroll. `on_key_down` repeats while a key is held, `on_key_press` comes once per press, `on_key_up`, and `on_shortcut` for keys with Ctrl, Alt or Meta. No input reaches the game before the intro is over.
- **Widgets.** `on_click(widget, handler)`, `on_change(widget, handler)` and `on_refused(widget, handler)` (a press on a disabled widget: where a game says why). Each replaces the handler instead of adding a second one, so calling them in `on_start()` on every connection is safe.
- **Lifecycle.** `on_start(signal)` runs on every connection, `on_stop()` on every disconnection; the state stays. `on_layout(layout)` follows a layout switch, after the placed widgets moved.
- **Rounds.** A game whose `is_round_finished(game)` says so gets `on_round_finished(game)` once (offer the result to `properties.best` there), and a press or a `next_round_keys` key then calls `start_next_round()` (default: `restart()`) instead of reaching the input hooks. While `settings.round_end_hold_seconds` hasn't passed, `is_round_end_ready` is false and such a press does nothing.
- **Status line.** `set_status(text)` says something to assistive technology. `live_status(game)` keeps it in step with the game after every repaint, `ready_status(game)` and `intro_status(state)` cover the start.
- **Themes.** `theme_name(game)` names the entry of `settings.themes` that shows; the shell swaps when the answer changes.
- **Files that come later.** A file asked for with `references.assets.request()` repaints as it arrives, like an image of `settings.images`; `paint_image()` finds a requested image by its name. See [assets.md](assets.md).

### Sound

Name the files in `settings.sounds` and play them with `properties.audio.play_sound("hit")`. `settings.music` loops from the end of the intro, stands still while the tab is hidden and stops when the element goes. A browser that refused the music gets it again from the next click or key.

A layout that is a `MuteButtonsLayout` and has a `sound_button` or `music_button` rect gets a mute button there: the shell builds it (`MuteButton`, an icon with a strike while off), places it on top of the game's widgets, wires it and keeps it showing what `audio` says. A layout without the rect hides it.

### Helpers for games

- **`SessionBest(direction = "higher")`**: the best result of the session. `offer(result)` returns whether it is a new best, `is_new` says so until the next round's `settle()` (the shell settles it on every new game), `value` is null until the first offer.
- **`TimedNotice`**: a message for a moment ("Zu wenig Gold"). `show(text, seconds)` from an input handler, `update(delta_seconds)` in `update()`, `text` where it paints; null when nothing shows.
- **`HouseSlider(title, min, max, value, rect, options?)`**: a `Slider` with its name and whole-number value. `label: "above"` (default) puts them over the track, `"left"` in a column of `label_width` (64), for compact rows; `colors` gives it its own palette.
- **`FrameBudget(settings?)`**: holds a game with many things on screen to a frame rate (60 FPS by default, `FRAME_BUDGET`). Feed it every frame with `feed(properties.frame_seconds, count)`: `is_full` says take no more, `is_fading` and `fade_count(count, delta_seconds)` say how many of the oldest to fade until the device keeps up, `carried` is the fewest things it held at full speed (a record), `fps` the average over the window. Two thresholds each, so nothing flickers; frames longer than a quarter second (a background tab) don't count. `reset()` after a switch. Steps 27 and 29 use it.

```ts
const budget = new FrameBudget();

function grow(shapes: string[], frame_seconds: number, delta_seconds: number): void {
    budget.feed(frame_seconds, shapes.length);
    shapes.splice(0, budget.fade_count(shapes.length, delta_seconds));
    if (!budget.is_full) {
        shapes.push("shape");
    }
}
```

### The stage

`src/stage/` is the part that knows nothing of games, for a canvas page without the shell.

- **`StageLayout`**: one arrangement of the screen in its own reference resolution, `width` x `height`, with optional `theme_rules` (a phone's larger text). A game extends it with the rects of its widgets and areas.
- **`pick_layout(layouts, width, height)`** takes the layout that shows the game largest; a later one must be 5 % larger to win, so a window near the break-even doesn't flip. `fit_layout(layout, width, height)` gives `{ scale, offset_x, offset_y }`, centred. A `LayoutFor` function makes the layout for the size instead.
- **Grids.** `grid_in(area, columns, rows, gap)` and `grid_cell(grid, index)` lay out cells row by row; `rect_contains(rect, point)`.
- **`CanvasStage(element, layouts, options?)`**: a canvas that fills `element`, in device pixels. `observe(signal, on_resize)` resizes on every change until the signal aborts, picks and fits the layout, and places every `attach()`ed `UiPage` in the same rectangle, so the scene and its buttons never drift apart. `begin(background)` clears and leaves the context in layout coordinates, `end()` goes back to canvas pixels for the UI. `to_layout(event)` and `to_canvas(event)` map the pointer; `visible` is all the canvas shows.
- **`IntroGate`**: the opening: a start screen (`waiting`) until a click or key allows sound, the intro video, a hold on its last frame, then `done`. Every way out ends in `done`, even a failed video, so the game never depends on the intro. `start(container, signal, options)` on every connection, `leave()` with the start screen's click.
- **`draw_start_screen(context, layout, options)`**: the default start screen, in layout coordinates; the whole screen is the button. `start_screen_block()` is where its text goes.
- **`bind_stage_input(signal, targets, handlers)`**: the input wiring: pointer events go to the `UiManager` in canvas pixels, the first gesture on the start screen goes to the intro and nowhere else, and the rest goes to the handlers in layout coordinates. All listeners end with the signal.

### AudioPlayer

`src/audio/` plays what an `AssetManager` loaded, by name. One audio element plays one thing, so sounds share a fixed set of channels (`sound_channels`, default 8): a new sound takes a free channel or the oldest's. One music track plays apart from them.

```ts
// assets: the AssetManager that loaded "coin" and "theme"
const player = new AudioPlayer(assets, { sound_channels: 6 });
player.play_sound("coin", { volume: 0.5 });
player.music_volume = 0.4;
player.play_music("theme"); // the same track again does not start over
player.is_sound_muted = true; // silences what rings, and what comes next
```

- **Mutes and volumes.** `sound_volume` and `music_volume` (0..1); `is_sound_muted`; `is_music_muted` lets the music run on silently, so unmuting finds it where it would have been.
- **`is_music_held`** really pauses the track (a hidden tab) and goes on from that spot.
- **Refusals.** A browser plays nothing before the visitor clicked or typed. A refused sound is gone; a refused track stays wanted (`is_music_blocked`), and `resume_music()` tries again, safe to call on every gesture.
- **`stop_music()`**, **`destroy()`**: stop; `destroy()` lets go of the channels and keeps the volumes and mutes, so a reconnected element can use the same player. `current_music` is the track playing or wanted.

---

## Geometries

Contains classes and functions handling Geometric calculations.

The Geometric functions and classes assume a 2D-coordinate system, where:
- `-x` is left
- `+x` is right
- `-y` is top
- `+y` is bottom

*Note: The coordinate system in code seems to follow standard screen coordinates (y increases downwards), as indicated by `UP = new Vector2(0, -1)` and `DOWN = new Vector2(0, 1)` in `Vector2.ts`.*

### Vector2

A 2D vector class with common mathematical operations.

#### Usage

```typescript
import { Vector2 } from '@game.object/ts-game-toolbox';

const pos = new Vector2(10, 20);
const dir = new Vector2(1, 0);

pos.add(dir.mul(5)); // pos is now (15, 20)

const distance = pos.len();
const normalized = pos.cpy().normalize();
const stick = new Vector2(3, 4).limit(1); // (0.6, 0.8): never longer than 1
```

- `limit(max_length)`: shortens the vector to `max_length` if it is longer; a shorter one and the null vector stay as they are.

### Rect

Represents a rectangle defined by `top`, `left`, `width`, and `height`.

#### Usage

```typescript
import { Rect } from '@game.object/ts-game-toolbox';

const box = new Rect({ top: 0, left: 0, width: 100, height: 100 });
const other = new Rect({ top: 50, left: 50, width: 100, height: 100 });

if (box.intersects(other)) {
    console.log("Collision!");
}

// Other useful methods
const area = box.get_area();
const center = box.center;
box.expand_to({ x: 200, y: 200 });
const corners = box.get_corners(); // [tl, tr, br, bl]
```

#### Methods and Properties

- `intersects(other: RectI): boolean`
- `contains(point: Vector2I): boolean`
- `is_within(outer: RectI): boolean`
- `expand_to(point: Vector2I): this`
- `get_corners(): Vector2I[]`
- `center: Vector2I` (getter and setter)
- `lerp(target: Rect, t: number): this`
- `Rect.contained(box, width, height): RectI`: the largest rect of a picture's shape (`width` by `height`) that fits inside `box`, centered. A picture with no size yet gets the box. The `Image`, `Gallery` and `Video` widgets use it for `is_contained`.
- `Rect.touches_segment(rect, a, b): boolean`: whether the segment from `a` to `b` touches the rect, inside it or across it.

### Other Shapes

- **Line**: A line segment defined by two points.
- **Polygon**: A shape defined by a set of points.
    - `contains(point)`: inside or not, for any polygon (concave too). A ray that only grazes a corner no longer counts as crossing it.
    - `bounding_rect`: the smallest `Rect` around the points: what to ask a `QuadTree` for before testing `contains()` on what it returns.
    - `translated(offset)` and `rotated(radians, pivot)`: moved and turned copies; the polygon itself stays. Positive radians turn clockwise on screen, like the canvas's `rotate()`.
- **Ray**: A ray starting from a point in a direction.

---

## Trees

Data structures for spatial partitioning and efficient data access.

### QuadTree

A `QuadTree` is used to partition a 2D space by recursively subdividing it into four quadrants. It is highly efficient for spatial queries like "find all objects in this rectangle".

#### Usage

```typescript
import { QuadTree, RectI } from '@game.object/ts-game-toolbox';

// Define a type that extends RectI
interface Entity extends RectI {
    id: string;
}

const tree = new QuadTree<Entity>({ top: 0, left: 0, width: 1000, height: 1000 });

const e1: Entity = { id: '1', top: 10, left: 10, width: 5, height: 5 };
tree.add(e1);

// Querying the tree
const results = tree.pick({ top: 0, left: 0, width: 20, height: 20 });
console.log(results); // [e1]
```

- `add(element)`, `remove(element)`, `pick(rect)`, `is_empty()`. `pick()` returns every element once, also when the rect covers a whole split branch.
- `pick_polygon(polygon, checked?)`: the elements whose center lies inside the polygon (concave ones too). It decides whole cells at once: a cell no edge of the polygon touches is all inside or all outside. Only the elements of cells an edge runs through are tested one by one; they are also pushed into `checked`, for a demo or a measurement.
- `clear(keep_levels = 8)`: removes all elements, keeping that many levels of branches for the next fill. A tree refilled every frame whose elements now cluster somewhere else wants `clear(0)`, or the old branches stay subdivided.

```typescript
const lasso = new Polygon(points);
const selected = tree.pick_polygon(lasso);
```

### Collection

A simple wrapper around an array with additional utility methods.

---

## Signals

Helpers to connect distant parts of the programs with events and signals.

### SignalSocket

A `SignalSocket` transmits a specific type of value to all attached listeners.

#### Usage

```typescript
import { SignalSocket } from 'ts-game-toolbox';

const scoreSignal = new SignalSocket<number>();

const handle = scoreSignal.attach((score) => {
    console.log(`New score: ${score}`);
});

scoreSignal.dispatch(100);

scoreSignal.detach(handle);
```

### EventSocket
Several kinds of event through one socket. An event is a class with a static `EVENT_NAME`; a listener attaches to a class and gets only its events. For things that happen, once each: a sale, a click (every UI widget has one as `events`).

```typescript
class SaleEvent extends EventBase {
    public static readonly EVENT_NAME = 'market.sale';
    public constructor(public readonly amount: number) {
        super(SaleEvent.EVENT_NAME);
    }
}

const market = new EventSocket<SaleEvent | MissEvent>();
market.attach(SaleEvent, (event) => play_sound('coin'));
market.dispatch(new SaleEvent(3));
market.detach(SaleEvent); // or by the handle attach() returned
```

### ObservableSocket
A value that tells its listeners when it changes, with `{ old, new }`. For state that several widgets show: cash, a price, a stock.

```typescript
const cash = new ObservableSocket(20);
cash.watch((change) => (cash_label.value = `${change.new} €`)); // at once, then on every change
cash.attach((change) => (buy_button.is_disabled = change.new < 9));
cash.set(cash.get() - 9);
```

- Listeners already read the new value from `get()`.
- Setting the same value (`Object.is`) tells nobody.
- `watch()` attaches and calls at once with the current value.

Handles are never reused, not even after `detach_all()`.

### ChainProperty
A property whose `set()` returns its owner, so settings can be chained. It doesn't tell anyone about changes.

#### Usage
```typescript
class Zoo {
    public foo = new ChainProperty<Zoo, number>(this, 0);
    public bar = new ChainProperty<Zoo, string>(this, 'hello');
}
new Zoo().foo.set(5).bar.set('hey');
```

---

## Flow

Utilities for controlling the flow of the program: progress tracking, time in frame loops, async helpers and assertions.

### Progress

`Progress` tracks a long-running operation, for a loading bar. A task has a `max` (default 1) and may have child tasks; each child counts as one unit of its parent's `max`, however big its own `max` is. `get_percent()` is 0 to 1.

```typescript
import { Progress } from "@game.object/ts-game-toolbox";

const loading = new Progress(2); // two parts
loading.listen((percent) => {
    console.log(`${Math.round(percent * 100)}%`);
});

const images = loading.make_child_progress(10); // ten files
const sounds = loading.make_child_progress(4);
images.set_self_progress(5); // loading is at 25%
images.mark_as_done(); // 50%
sounds.mark_as_done(); // 100%
```

- **`set_self_progress(current)`** and **`mark_as_done()`** move a task; every listener up the tree hears about it.
- **Nothing to do is done.** A task whose `max` is 0 or less is at 1. (Up to 5.6.0 it returned 100.)
- **Work that arrives later.** `append_child_progress(max = 1)` adds a child and grows its parent's `max` by one, for files requested one by one while others already load. Start such a task with `new Progress(0)`: until something is added it counts as done. `AssetManager.progress` works this way. `remove_child_progress(child)` takes such a child back (work withdrawn before it ran) and shrinks `max` by one again.

### FixedStepClock

Turns uneven frame deltas into even steps of a fixed length, so a simulation plays out alike at any frame rate and a seed replays exactly. What a frame leaves over is kept for the next.

```typescript
const clock = new FixedStepClock(1 / 60);

function frame(delta_seconds: number): void {
    clock.advance(delta_seconds, () => {
        game.step(clock.step_seconds);
    });
}
```

- **`advance(delta_seconds, step, keep_seconds = 0)`** runs `step` once per whole step the time now holds. A step that returns anything but `undefined` ends the run (say, with the game's next phase): `advance()` returns that value and drops the time left over, but for at most `keep_seconds`. Keeping half a step after a stop lets the next frame of a step's length run exactly one step.
- **`unused_seconds`** is the time no step has used yet; inside a step, at least `step_seconds` of it means another step is due in this `advance()`. `PhysicsWorld.update()` uses that to stop catching up when steps get costly.
- **`reset()`** forgets the time left over.

### Tween

A value that moves from `from` to `to` over `seconds` of `update()` calls, shaped by an easing. Nothing moves unless the loop says so: a paused game holds its animations, and a test can jump to any moment.

```typescript
const fade = new Tween(0, 1, 0.4, ease_out);

function frame(delta_seconds: number): void {
    fade.update(delta_seconds);
    ctx.globalAlpha = fade.value;
    if (fade.is_done) {
        start_round();
    }
}
```

- **`value`** is exactly `from` before the first step and exactly `to` at the end, however large the last step was. It stays there until **`restart()`**.
- **Easings** are `(t) => number` on 0..1 (`Easing`): `ease_linear` (the default), `ease_in`, `ease_out`, `ease_in_out`, or your own.
- **`is_done`** turns true once the whole time has passed. A negative or empty `update()` does nothing.

### Timers, states and spawns

- **`Timer(duration_seconds, options?)`**: adds up frame deltas and says when a duration has passed; one-shot or `repeat`ing, runs after `start()` (or `autostart`), with `progress`, `remaining`, `completions` and `ping_pong`. **`Cooldown(seconds)`**: `try_use()` succeeds when ready and starts the wait, `update()` runs it down.
- **`StateMachine<S, C>`**: string states with `enter`, `exit` and `update` handlers over one shared context; `update` may return the next state. `current`, `previous`, `seconds_in_state`, `transition(to)`, `on_transition(listener)`.
- **`Spawner<T>`**: timed spawns for a frame loop, pure and seedable; `weighted_pick` picks from weighted entries.

### Sleep

A simple wrapper around `setTimeout` that returns a `Promise`.

```typescript
import { sleep } from "@game.object/ts-game-toolbox";

async function run(): Promise<void> {
    console.log("Waiting...");
    await sleep(1000);
    console.log("Done!");
}
```

### Throttler

Runs an expensive async callback at most once per `delay_ms`, however often it's asked to: a slider that fires on every pointer move, a resize, a search box.

```ts
const maps = new Throttler<[Screws], Terrain>({
    delay_ms: 120,
    callback: async (screws) => make_terrain(screws),
});
maps.run(screws).then((terrain) => show(terrain));
```

- The first call after a rest runs at once (or after `wake_up_ms`).
- Calls that come while it runs, or within `delay_ms` after it ends, wait and share one more run with the last call's arguments, so what was asked for last always happens.
- Every call that shared a run gets the same promise, and so the same result: a caller that counts results should count distinct ones.
- `STRATEGIES.latest` is the default (up to 5.6.0 it was `combine`). `STRATEGIES.combine` hands calls made while a run is going that run's promise and drops their arguments.
- `is_busy` is true while a run is going or one is waiting.

### Asserts

- `assert_never(val: never)`: Used for exhaustive type checking in switch statements.
- `assert_ok(condition, message?)`: Throws when `condition` is falsy; narrows the type after it.
- `throw_expression(message)`: Throws, where an expression is needed (`value ?? throw_expression("missing")`).

### Types

- `Class<T>`: Represents a class constructor.
- `is_undefined`, `is_object`, `is_function`, `is_string`, `is_number`: Type guards.

---

## UI

A canvas UI system: widgets in a tree, a page that scales the tree to the canvas, a manager that feeds it the pointer, and themes as lists of rules. It lives in `src/ui/`.

What you can press is a widget. What you only look at may be painted.

### The parts

- **`Element`**: the base of everything on the page. A `rect`, a `type`, a `class`, a `state`, `events`, and a `theme` computed from the rules.
- **`Group`**: an element with children. Their rects are relative to its rect. `add(child)` and `remove(child)`. A child with `stays_on_top` set stays last, so it paints over the others and gets hit first, whatever is added after it; the mute buttons do that.
- **`UiPage`**: the root `Group`. Its `rect` is in fractions of the canvas, its `reference_rect` is the coordinate system its children live in.
- **`UiManager`**: holds the `active_menu` page, and takes the pointer in canvas pixels: `pointer_down`, `pointer_up`, `pointer_move`, `pointer_exit`, `wheel`.

### Without the game shell

```typescript
import {
    Button,
    ElementClickEvent,
    Panel,
    RgbColor,
    UiManager,
    UiPage,
    theme_rules_from,
} from "@game.object/ts-game-toolbox";

const canvas = document.querySelector("canvas") as HTMLCanvasElement;
const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;

// The whole canvas, in a coordinate system of 800 x 600 whatever its real size is.
const page = new UiPage(
    { x: canvas.width, y: canvas.height },
    { left: 0, top: 0, width: 1, height: 1 },
    { left: 0, top: 0, width: 800, height: 600 },
    true,
    theme_rules_from([
        ["panel", { background_color: new RgbColor(40, 40, 60) }],
        ["button", { background_color: new RgbColor(220, 220, 220) }],
        ["button:hover", { background_color: new RgbColor(255, 255, 255) }],
        ["button:disabled", { text_color: new RgbColor(120, 120, 120) }],
    ]),
);
const ui = new UiManager();
ui.active_menu = page;

// A panel on the page, a button in the panel: its rect is relative to the panel.
const panel = new Panel([], { left: 20, top: 20, width: 300, height: 120 });
const start = new Button("Start", {
    left: 20,
    top: 20,
    width: 260,
    height: 80,
});
panel.add(start);
page.add(panel);
start.events.attach(ElementClickEvent, () => {
    console.log("pressed");
});

// The pointer goes in as canvas pixels.
const to_canvas = (event: PointerEvent) => {
    const box = canvas.getBoundingClientRect();
    return {
        x: ((event.clientX - box.left) * canvas.width) / box.width,
        y: ((event.clientY - box.top) * canvas.height) / box.height,
    };
};
canvas.addEventListener("pointerdown", (event) => {
    ui.pointer_down(to_canvas(event));
});
canvas.addEventListener("pointermove", (event) => {
    ui.pointer_move(to_canvas(event));
});
canvas.addEventListener("pointerup", (event) => {
    ui.pointer_up(to_canvas(event));
});

function draw(): void {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ui.draw(ctx);
    requestAnimationFrame(draw);
}
draw();
```

### With the game shell

`CanvasGameProperties` makes the page and the manager, `bind_stage_input` feeds them, the renderer draws the page after the scene. A game adds widgets and handlers:

```typescript
// In the Properties: the rect comes from the layout, in every layout the stage picks.
const controls = this.place(
    new Panel([], UNPLACED),
    (layout) => layout.controls,
);
this.go = this.place(
    new Button("Go", UNPLACED),
    (layout) => layout.go,
    controls,
);

// In the Logic's on_start(): safe to call again on every start.
this.on_click(this.properties.go, () => {
    this.go();
});
this.on_refused(this.properties.go, () => {
    this.say_why();
});
```

- `place(widget, rect_of, parent = page)`: adds the widget and keeps it at `rect_of(layout)`. Inside a parent the rect is relative to that parent.
- `on_click`, `on_change` and `on_refused` in the Logic: replace the handler instead of adding a second one.
- `settings.themes` and `logic.theme_name(game)`: the game's themes by name; see below.

### Widgets

| Widget                      | Constructor                      | Worth knowing                                                                                                                                                          |
| --------------------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Button`                    | `(label, rect)`                  | Centered, unless a rule sets `text_align`. `text_padding` keeps other text off the edge. `columns` shows several texts in one row; see below.                          |
| `Label`                     | `(text, rect)`                   | Text that is too wide gets squeezed into the box, or breaks into lines with `is_wrapped` (`line_spacing` a share of the font size). `text_padding` keeps it off the edge.                                                                                                                      |
| `ValueLabel`                | `(label, value, rect)`           | Shows `label: value`.                                                                                                                                                  |
| `CheckBox`                  | `(checked, rect)`                | `checked`, and an optional `label`. With a label the rect's height decides the box. Without one the box is at most 20 units, and the game paints what goes next to it. |
| `Slider`                    | `(title, min, max, value, rect)` | `value`; `format: (value) => string`, default two decimals. Pressing anywhere on it sets the value. `HouseSlider` is the same widget with the house's shape.           |
| `Panel`                     | `(children, rect)`               | A `Group` with a background.                                                                                                                                           |
| `ScrollGroup`               | `(children, rect)`               | See below.                                                                                                                                                             |
| `MenuView`                  | `(input, rect, options?)`        | A `Menu` on the page, in a style. See "Menus".                                                                                       |
| `Gallery`, `Image`               |                                  | Pictures: `Asset`s, `is_contained` and `is_smooth`, `Image.pixel_size`. A click on a `Gallery` goes to the next. See step 23.                                         |
| `Video`                          | `(video, rect)`                  | A film from the `AssetManager`, or `null` until it exists; `video` can be set later. `is_contained`. It plays when drawn; `pause()` holds it until `play()`. See step 28. |

All of them also take `is_visible` and `theme_rules` as the last two arguments. A hidden element isn't hit, and neither is anything inside it.

A row of a table is a `Button` with columns. The widths are shares of the width inside `text_padding`, and each column squeezes its text to fit, so a long name can't push the next column away:

```typescript
row.columns = [
    { text: train.name, share: 0.43, align: "left" },
    { text: "Gleis 2", share: 0.32, align: "left" },
    { text: "16:04", share: 0.25, align: "right" },
];
```

A column without `align` takes the theme's `text_align`. A column with `is_caption: true` is the quieter text next to the main one, in `caption_color` and `caption_font_size`, never bold. While `columns` isn't null, the label doesn't show.

A long label on a `Button` is squeezed. `text_overflow = "ellipsis"` ends it in `…` instead, for a list where the squeezed rows would differ. `wrap_text(ctx, text, width)` and `ellipsize_text(ctx, text, width)` are the same two rules for your own painting.

### States and classes

`element.state` is one of `refused`, `disabled`, `active`, `selected`, `entering`, `hover`, or `null`, in that priority. `entering` lasts a moment after `show_entering(seconds?)`, for what has just appeared. `active` is a press being held. `refused` lasts a moment, after `show_refused()`, and a selector with `:disabled` matches it too, so an element with no `:refused` rule simply stays disabled.

```typescript
button.is_selected = train === game.selected;
button.is_disabled = route_problem(game, request) !== null;
button.class = train.is_late ? "late" : null;
```

Each of these updates the theme when it changes.

A disabled element still gets hit, so a press can't fall through to the game, and still gets hover, so it can show why. It never clicks and never drags. A press released on it, or `click()` from a key, dispatches `ElementRefusedEvent` instead. Touch has no hover, so that event is where a game says why.

### Theme rules

A theme is a list of rules, each a selector and some properties. `theme_rules_from` reads the selector as `type.class:state`, each part optional:

```typescript
const rules = theme_rules_from([
    ["button", { background_color: new RgbColor(60, 70, 120) }],
    ["button:hover", { background_color: new RgbColor(90, 100, 160) }],
    ["button.late", { background_color: new RgbColor(210, 140, 20) }],
    ["button.late:hover", { background_color: new RgbColor(240, 170, 50) }],
]);
```

An element collects the rules of the whole way down from the page to itself. Stronger rules win, in this order, and among equals the later one:

`.class:state` > `:state` > `.class` > type

So `button:hover` beats `button.late`: a class that has to stay visible under the pointer needs its own `button.late:hover`.

Properties:

- Colors: `background_color`, `border_color`, `text_color`, and `accent_color` for what a widget fills to show its value (the mark of a checkbox, the filled part of a slider).
- Borders: `border_width`, `border_radius`. A border draws outward from the rect.
- Slider parts: `thumb_color` for what you hold, `caption_color` for its name.
- The quieter text in a row of a table: `caption_color`, `caption_font_size`.
- Text: `font_size`, `font_family`, `font_weight`, `font_style`, `text_align`, `text_baseline`. All widgets build their font with `theme_font(theme)`. A `font_style` of `"bold"` means weight 700. `text_align` starts as `left`, and as `center` on a button, until a rule says otherwise.
- Movement: `transform`, `transition_seconds`, `transition_easing`; see below.

**The house look.** `default_theme(settings)` styles every widget, so one with no rules at all looks finished. Button classes: `primary`, `accent`, `secondary`, `off`. A game adds only what differs.

**Swapping.** `properties.set_theme(rules, fade_seconds = 0)` keeps the house rules underneath, replaces the game's rules, and everything on the page follows, at once or over the fade; rules a widget has for itself stay. No widget needs to know.

Without the shell it is `page.theme_rules = rules; page.update_theme_instance({ seconds: fade_seconds });`, with your own base rules in `rules`.

**Themes by name.** A game with several looks names them, says which one holds now, and the shell swaps when the name changes:

```typescript
// In the Settings:
public override readonly themes = { tag: phase_rules(TAG), nacht: phase_rules(NACHT) };
public override readonly theme_fade_seconds = 4;

// In the Logic:
protected override theme_name(game: Game): string {
    return game.phase;
}
```

A new game snaps to its theme, and so does a change of layout; only a change while the game runs fades. `properties.show_theme(name, 0)` shows one by hand.

**Rules per layout.** `theme_rules` on a layout lies on top of the game's rules, for what a phone needs differently, such as a larger font. The stage changes them along with the layout.

### Movement

A property can change over time in two ways. The rules say both, so a game writes no timers and no widget knows.

**A transition goes from one value to another**, when an element enters another state or a theme changes:

```typescript
const pressed = new ThemeTransformValue([{ type: "scale", x: 0.97, y: 0.97 }]);
theme_rules_from([
    ["button", { transition_seconds: 0.12, transition_easing: "ease_out" }],
    ["button:hover", { background_color: new RgbColor(90, 100, 160) }],
    ["button:active", { transform: pressed }],
]);
```

- It starts from what shows at that moment, so a hover cut short turns around in the middle, and it never jumps.
- The value of the state being entered decides how long it takes, as in CSS. 0 snaps.
- Colors, numbers and transforms move. Two transforms move only if they have the same statements in the same order; otherwise the new one shows at once. Words such as `font_family` or `text_align` don't, nor do `font_weight` and `transition_seconds` itself.
- `transition_easing` is `linear`, `ease_in`, `ease_out` (the default) or `ease_in_out`.
- An element that hasn't been drawn yet takes its first values at once, so nothing fades in on a new page.

The house look has `settings.press_transition_seconds`, 0.12, on buttons, checkboxes and sliders. Set it to 0 for a game that must snap.

**An animator keeps moving** for as long as its rule applies, from the moment it starts to apply:

```typescript
theme_rules_from([
    ["button.late", { background_color: theme_pulse(late, late_bright, 1.6) }],
    ["button:refused", { transform: theme_shake(3), transition_seconds: 0 }],
]);
```

`theme_pulse(from, to, seconds)` breathes a color there and back. `theme_shake(distance)` shakes sideways and dies away. For anything else there is `new ThemeValueAnimator(seconds, (t) => value)`, with `t` going from 0 to 1 each round.

`theme_slide(x, y, seconds?)` starts displaced and arrives, for `:entering`.

**A refused press** can show it: `element.show_refused()` puts it in the state `refused` for `REFUSED_SECONDS`, 0.35. The house rules have `button:refused` shake a little. A game calls it where it knows the press was refused, not in the widget, because the game has the last word on that.

**A theme fade** is a transition with one duration for one change. What a game paints follows along if it reads its colors through `blended`:

```typescript
const style = this.properties.blended(PHASE_STYLES);
```

`blended(table)` takes a table with one entry per theme and returns the shown entry, or during a fade the blend that goes with the widgets: `#rrggbb` strings and numbers are mixed, anything else takes the nearer side. A fade cutting another short goes on from its middle, for widgets and paint alike. Without the shell, `blend_table(from, to, t)` does the mixing.

**The repaint.** The shell paints only when something changed, so a moving value has to say so. `page.poll_animation()` tells whether a value moved or just arrived, and the shell asks once per frame while a game plays, and paints if so; with nothing moving, it goes back to painting nothing. Without the shell, your own loop that draws every frame needs none of this.

**Tests.** The theme reads the time from one place. `set_theme_clock(() => my_seconds)` replaces it and `set_theme_clock(null)` puts the real one back, so a test steps through a transition rather than waiting for it. To get past all movement at once, step it by more than the longest duration.

### Borders

`border_style` is `"solid"`, or `"raised"` and `"sunken"`: a bevel, lighter and darker than `border_color`, as `border_width` wide. A `Panel` and anything else that draws a background has it.

### Menus

Three classes with one job each:

| Class | Job | Knows nothing about |
| --- | --- | --- |
| `Menu` | the tree, the cursor, the open path | input, drawing |
| `MenuInput` | keys, presses, the buffer, what was chosen this frame | drawing, rects |
| `MenuView` | draws a menu in a style, turns hits into presses | keys, the buffer |

```typescript
const forms = new Menu<string>([
    { label: "Anträge", entries: [
        { label: "Hund", value: "hund", disabled: () => !has_id, hint: () => (has_id ? "" : "Ausweis fehlt") },
        { label: "Zurück", back: true },
    ] },
]);
const input = new MenuInput(forms);
// In a game's properties: the shell runs a placed view's input by itself.
const view = this.place(new MenuView(input, UNPLACED), (layout) => layout.menu);

// In update():
for (const form of input.choices()) {
    game.file(form);
}
```

With no style that is a finished menu in the house look: a row per entry, the cursor fading from row to row, `›` on a submenu, a marked back row, disabled rows dimmed and still pressable, a hint line, a scrolling list, a long label ending in `…`, hover moving the cursor and one tap pressing. It reads the menu when it draws and when it's hit, so a reason that changes while the menu is open just shows.

**`Menu`** entries have `label`, `value`, `entries`, `disabled`, `hint`, `back` and `key`. `levels` gives the open levels from the top down, with their cursors, so a view can draw parents. `back_to(depth)` goes back to a level. `set_entries(root)` replaces the tree while it's open: the path stays as far as its labels still exist, the cursor stays on the same entry. `new Menu(root, { stops_on_disabled: true })` lets the cursor stop on disabled entries, so a keyboard can read their reasons too, and the way to an entry doesn't change when another becomes enabled.

**`MenuInput`** works like `KeyboardState`: events go in, the game asks during `update()`, `end_frame()` starts the next frame.

- `choices()`, `last_choice`, `last_refused`: since the last `end_frame()`. `on_choice` and `on_change` fire inside the event, for what can't wait for the frame, such as starting a hold.
- `is_held`: while true, presses wait in the buffer and nothing moves. `is_enabled`: a menu on a screen not in use; off, it hears nothing and its views leave the screen. A view writes its own `is_visible` from this and the open levels, so that's the way to hide one.
- `handle_key(key, is_repeat?)`, `handle_hover(depth, index)`, `handle_hover_end(depth, index)`, `handle_press(depth, index)`: what a view or your own painting feeds it. Where the pointer rests at the end of a hold, the cursor follows; where it has left, nothing moves. Up and Down move and repeat; Enter and Space confirm; Escape and Left go back; Right opens a submenu; a letter picks the entry with that `key`.
- `attach(target, signal)` for keys without the shell. In a game, the shell routes keys to every placed view's input, after the intro and after the mute and next-round keys, and calls `update()` before your `update()` and `end_frame()` after it. A second menu on another screen is the same with `is_enabled`.

**The buffer** holds presses, not choices: typing ahead means pressing Down, Down, Enter during a wait, so the moves have to wait too. They replay in order when the hold ends, and a replayed Enter may open the next submenu and start the next wait. The rules, all of them from what bots showed:

- `buffer_seconds`, default 1: how long the oldest press may wait in one hold. Make it longer than your longest hold; a shorter one is worse than none, because a press typed ahead dies and those behind it are lost with it.
- `buffer_size`, default 16: how many may wait. A press that doesn't fit is the one that goes.
- No holes: a queue with a press missing means something else, so what goes, goes with all behind it. Those count in `dropped_presses`.
- A replayed press on a disabled entry drops the rest, so a mashing player doesn't open the wrong form.
- A new tree drops the queue: the presses were meant for a tree that isn't there.
- Replay stops at a choice, so the game can hold before the next one plays.

**`MenuView`** takes `MenuViewOptions`: `style` (theme rules), `level` (which level it shows, default the open one), `row_height`, `row_gap`, `padding`, `submenu_mark`, `show_hint`, `row_hint_share`, `show_path`, `root_text`, `held_text`, `create_row`. It's a `Panel` holding a `ScrollGroup` in `list`, between `path` and `hint`, because those two mustn't scroll. `row_height` can change, for a layout that wants taller rows.

`row_hint_share` puts every entry's hint in its own row, beside the label, in that share of the width, for a list you choose from by reading. A finger has no cursor to read a line with. The hint is a caption, so a style says its color per state with `caption_color` and its size with `caption_font_size`, and the `›` stays with the label. It usually goes with `show_hint: false`.

**A style** is a list of theme rules, a constant the game can name:

```typescript
const OFFICE_95 = theme_rules_from([
    ["menu", { background_color: silver, border_style: "raised", border_color: silver, border_width: 2 }],
    ["menu:entering", { transform: theme_slide(-10, 0) }],
    ["menu-row", { background_color: silver, text_color: black, border_radius: 0, transition_seconds: 0 }],
    ["menu-row:hover", { background_color: light }],
    ["menu-row:selected", { background_color: navy, text_color: white }],
    ["menu-row:active", { background_color: navy, text_color: white }],
    ["menu-row:disabled", { background_color: silver, text_color: gray }],
    ["menu-row:disabled_selected", { background_color: gray, text_color: light }],
    ["menu-row:refused", { background_color: red, transform: theme_shake(4) }],
    ["menu-hint", { background_color: silver, border_style: "sunken", border_color: silver, border_width: 1 }],
    ["menu-hint.held", { background_color: theme_pulse(silver, amber, 0.5) }],
]);
const styled = this.place(new MenuView(input, UNPLACED, { style: OFFICE_95 }), (layout) => layout.menu);
```

| Selector | What it styles |
| --- | --- |
| `menu` | the area behind the rows, with the class `held` during a hold and the state `entering` when a level appears |
| `menu-row` with `:hover`, `:active`, `:selected`, `:disabled`, `:disabled_selected`, `:refused` | a row; `selected` is the cursor, `disabled_selected` the cursor on a disabled row |
| `menu-row.submenu`, `menu-row.back` | rows that open or go back |
| `menu-hint`, with the class `held` | the hint line |
| `menu-path` | the path above the rows |

A state beats a type, so a style that sets a row's background has to set it for the states too, or the house look shows through on the row under the mouse.

For a look of its own, one `MenuView` per open level with `level` makes a cascade, placed by a rule that reads `menu.levels`; `MenuHint` is the hint line on its own, for a status bar. What the rules can't say goes in a subclass of `MenuRow` with its own `draw()`, handed in through `create_row`.

A game that paints its own menu can still use `MenuInput` without a view, through `handle_hover()` and `handle_press()`.

### Scrolling, drags and the wheel

`ScrollGroup` is a `Group` with a vertical offset. It clips its drawing to its rect, leaving room for the border of its widest child, and whatever is clipped away can't be hit.

Set `row_height` and it stacks its children top to bottom, in the order of adding, with `row_gap` between them and `padding` around them, and leaves a gutter for the scroll bar; `reserves_gutter = false` gives rows that fit the whole width until there is something to scroll. Without `row_height` it doesn't arrange them: the game gives each child a rect, in the group's scrolling coordinates.

- `scroll`: the offset, kept between 0 and `max_scroll`.
- `content_height`, `max_scroll`.
- `scroll_to(child)`: the least scroll that shows the child, for following a keyboard cursor.

A press locks the element under it, and moves go to that element's `drag()`. If it returns false, and the press has moved more than `UiManager.drag_threshold` (10 reference units), the parents are offered the drag, the nearest first. The one that takes it holds the press from then on, and the release is no click. So a tap on a row presses the row, even a shaky one, and a drag starting on a row scrolls the list.

`UiManager.wheel(canvas_coords, delta_y)` offers the wheel to what's under the pointer, the top element first. `bind_stage_input` feeds it, and stops the page from scrolling only if an element took it.

### Taking things off the page

`group.remove(child)` returns whether it was a child. The removed element loses its press and its hover, and the manager lets go of it, so a dead widget keeps nothing and clicks nothing.

---

## Physics

Collision and motion for 2D games, y down. Most of it is pure functions over the toolbox's shapes: the game owns its bodies, steps them and decides what a hit means. `PhysicsWorld` is the one part that owns bodies itself.

- **`physics/aabb`**: boxes (`RectI`), overlapping now or swept along a move.
- **`physics/sweeping_sat`**: the same for convex polygons, by the separating axis test.
- **`physics/bounce`**: contacts of circles and boxes, and the speeds after a hit.
- **`physics/kinematics`**: motion under constant acceleration: a step, or a projectile's arc in closed form.
- **`physics/steering`**: walking to a point and standing in a crowd.
- **`physics/world`**: `PhysicsWorld`, bodies the library moves in even steps.

> **Since 6.0.0** `SweepingSatWorld` and the old `PhysicsBody` of `physics/sweeping_sat` are gone. Use `PhysicsWorld` with `rule: SAT_SWEEP` for bodies the library should own, or `sat_move` for a game that owns its bodies. `PhysicsBody` is now the body of a `PhysicsWorld`, made by `world.add()`.

### Boxes (AABB)

`physics/aabb` works on `RectI` (`left, top, width, height`). The static tests look at where two boxes are now; the swept ones look at the whole path of a move, so a fast box can't tunnel through a thin wall between two frames.

- **`aabb_overlaps(a, b)`**: whether two boxes overlap. Touching edges don't count.
- **`aabb_resolve(mover, wall)`**: the smallest push that moves `mover` out of `wall`, along x or y (the other is 0), towards the side the mover's center is on; `null` when apart.
- **`aabb_sweep(mover, delta, wall)`**: a `Hit` when `mover`, moving by `delta`, meets `wall`, or `null`. `time` is 0..1 of the move, `normal` the wall's face as a unit vector pointing away from it (`(0, -1)` is the top of a floor), `overlap` the push when the boxes already overlapped at the start (then `time` is 0).
- **`aabb_move(mover, delta, walls)`**: moves with sliding: the move stops at the first wall hit, the part of `delta` into that wall is dropped and the rest goes on, at most once per axis. Returns `{ rect, hits }`: the new box (`mover` isn't changed) and the hits in order. Each hit is a `WallHit`, a `Hit` with `wall`, the index of the wall in `walls`.
- **`aabb_union(boxes)`**: the box around several boxes.

```ts
const moved = aabb_move(player.box, { x: velocity.x * dt, y: velocity.y * dt }, walls);
player.box = moved.rect;
for (const hit of moved.hits) {
    if (hit.normal.y < 0) {
        player.is_on_ground = true;
    }
    if (walls[hit.wall] === goal) {
        win();
    }
}
```

### Sweeping SAT

`physics/sweeping_sat` is the separating axis test for convex polygons (`PolygonI`, points in world space, either winding; split a concave shape into convex parts). Pure functions like `aabb_*`.

- **`sat_overlap(a, b)`**: the smallest push that moves `a` out of `b`, as bounce's `Contact` (`normal` from `b` towards `a`, `depth`), or `null`. Touching edges don't count.
- **`sat_sweep(mover, delta, wall)`**: when `mover`, moving by `delta`, first touches a still `wall`, as aabb's `Hit` (`time` 0..1, `normal` the wall face's unit normal). Exact for any speed, so nothing tunnels. Already overlapping is a hit at time 0 with the push in `overlap`.
- **`sat_move(mover, delta, walls)`**: moves with sliding like `aabb_move`, at most 3 passes, and returns `{ offset, hits }`: how far the mover went, and the `WallHit`s in order, each with its `wall` index. A mover that starts inside a wall is pushed out first. It stays `SAT_SKIN` (0.01) off what it hit.
- **Prepared shapes.** Each call above works out the edge normals of both shapes. A shape that never turns keeps them: `sat_shape(polygon)` gives a `SatShape`, `{ polygon, axes }` (`sat_axes`, each edge direction once, so a box has 2), and `sat_overlap_shapes`, `sat_sweep_shapes` and `sat_move_shapes` take that form. A world's `PhysicsBody` keeps its `axes`, and `SAT_SWEEP` uses them. `sat_overlap_shapes(a, b, out)` writes the contact into `out`, so a hot loop allocates nothing.

```ts
const shape = new Polygon(crate_points).translated(parcel.position);
const moved = sat_move(shape, { x: velocity.x * dt, y: velocity.y * dt }, walls);
parcel.position.x += moved.offset.x;
parcel.position.y += moved.offset.y;
for (const hit of moved.hits) {
    velocity = reflect(velocity, hit.normal, 0.1);
}
```

### Bounce

`physics/bounce` finds where two shapes touch and turns that into new velocities. `aabb_*` stops a box and slides it along; this sends a body back. Moving the bodies apart is left to the caller: it has the `depth`, and only it knows which bodies may move.

- **`Contact`**: `normal`, a unit vector, and `depth`, how far the shapes overlap along it.
- **`circle_contact(a, b)`**: two `Circle`s (`x`, `y`, `radius`); the normal points from `b` to `a`. `null` when apart; touching counts as apart. Two circles on the same spot get the normal `(1, 0)`.
- **`circle_rect_contact(circle, rect)`**: a circle against a box, by the box's closest point; the normal points from the box to the circle, so a corner gives a diagonal one. A circle whose center is inside leaves through the nearest edge.
- **`reflect(velocity, normal, restitution = 1)`**: the velocity after hitting something that doesn't move. `restitution` is the share of the speed along the normal that comes back: 1 bounces perfectly, 0 stops along the normal and keeps sliding. Unchanged when already moving away.
- **`elastic_impact(a, b, normal, restitution = 1)`**: two `Impactor`s (`velocity`, `mass`; `Infinity` for something that can't be moved) collide along `normal` (from `b` to `a`); returns `{ a, b }`, the new velocities, with momentum kept. Bodies already moving apart are unchanged.

```ts
const contact = circle_contact(ball, other);
if (contact !== null) {
    ball.x += contact.normal.x * contact.depth;
    ball.y += contact.normal.y * contact.depth;
    const after = elastic_impact(
        { velocity: ball.velocity, mass: 1 },
        { velocity: other.velocity, mass: 3 },
        contact.normal,
        0.9,
    );
    ball.velocity = after.a;
    other.velocity = after.b;
}
```

### Kinematics

`physics/kinematics` is motion under constant acceleration in `Vector2`. Gravity is a positive number (y down), so "up" is a negative `y` velocity.

- **`integrate(state, acceleration, delta_seconds)`**: one step of semi-implicit Euler on a `KinematicState` (`position`, `velocity`, both `Vector2`, both changed): the velocity takes the acceleration first, then the position moves with the new velocity.
- **`projectile_position(origin, velocity, gravity, t)`**: where a projectile is after `t` seconds, in closed form.
- **`flight_time(origin, velocity, gravity, ground_y)`**: the time until it comes down to `ground_y`; 0 when it never does.
- **`range(...)`** (same arguments): the horizontal distance until then, negative when flying left.
- **`apex(origin, velocity, gravity)`**: the highest point of the arc; the origin when it never rises.
- **`launch_velocity(speed, angle)`**: a velocity from a speed and an angle in radians, 0 right and positive up.

```ts
const velocity = launch_velocity(600, Math.PI / 4);
const landing_x = start.x + range(start, velocity, 900, ground_y); // a landing marker
const state = { position: new Vector2(start), velocity };
integrate(state, { x: 0, y: 900 }, delta_seconds); // every frame
```

### Steering

`physics/steering` walks things to a point and keeps a crowd from standing on one spot. Call both once per step, the moves first; the same `delta_seconds` every step (see `FixedStepClock`) keeps a crowd steady.

- **`steer_towards(body, target, delta_seconds, options)`**: moves `body` (its `x` and `y`) towards `target` at `options.speed`, never past the point `stop_distance` before it, and returns whether it is there. On the last `slow_distance` it slows down, to at least a tenth of its speed, so it still arrives.
- **`seek_velocity(body, target, options, out?)`**: the same walk as a velocity, for a body a `PhysicsWorld` moves and keeps apart from the others. Zero within `stop_distance`. Written into `out` and returned, so a crowd of thousands passes one vector.
- **`separate_bodies(bodies, delta_seconds, stiffness = 6)`**: pushes overlapping circles (`SeparatedBody`: `x`, `y`, `radius`, `is_fixed` for a building) apart, `stiffness * delta_seconds` of each overlap per step. All pushes are added up first, so the order of the list doesn't matter. Two bodies on the same spot part in a direction that follows from their places in the list: no random numbers, a replay stays the same. Compares every pair: fine for a few hundred bodies.
- **A crowd needs room.** Several bodies that share a target and are kept apart can't all reach its middle: give them a `stop_distance` of at least the room they take, or the ones in the crowd never arrive.

```ts
for (const unit of units) {
    unit.is_there = steer_towards(unit, unit.target, step_seconds, {
        speed: 80,
        stop_distance: unit.radius + target_radius,
        slow_distance: 20,
    });
}
separate_bodies(units, step_seconds);
```

### The physics world

`physics/world` is a world the library owns: `PhysicsWorld` keeps the bodies, moves them in even steps, finds the pairs that touch and turns contacts into speeds. A `CollisionRule` says how two shapes meet; bodies translate and never turn.

```ts
const world = new PhysicsWorld<Crate>({
    rule: SAT_SWEEP, // the default; or AABB, AABB_SWEEP, or a game's own CollisionRule
    gravity: { x: 0, y: 900 },
    restitution: 0.2,
    friction: 0.1,
});
world.add({ shape: floor_shape, position: { x: 400, y: 620 }, is_static: true });
const body = world.add({ shape: crate_shape, position, velocity, mass: 2, data: crate });
world.events.attach(ContactEvent, (event) => {
    // event.a, event.b, event.normal, event.speed
});
world.update(delta_seconds); // the even steps that are due
world.remove(body);
```

- **Rules.** `AABB` counts every shape as its box and moves first, pushing out after (`aabb_resolve`): a fast body jumps a thin wall. `AABB_SWEEP` uses `aabb_move`, `SAT_SWEEP` (the default) uses `sat_overlap` and `sat_move`: nothing tunnels through a still body. `COLLISION_RULES` lists the three, cheapest first; each has a `name` (`"aabb"`, `"aabb_sweep"`, `"sat_sweep"`) and `is_swept`. A rule answers `overlap(a, b)` and `move(mover, delta, walls)` on a `ShapeAt` (`polygon` and `box` in world space, and the edge normals in `axes`). `world.rule` may be switched between steps.
- **Bodies.** `world.add(options)` takes `BodyOptions` and returns a `PhysicsBody`. `shape` is a convex polygon (`{ points }`, at least 3) around the body's own origin, `position` puts it. Still bodies (`is_static`) never move. `mass` defaults to 1 (`Infinity` when still); only the ratio between two bodies matters. `position` and `velocity` may be written between steps; `polygon` and `box` follow. `data` is the game's. `world.bodies` lists them in the order they were added.
- **`update(delta_seconds)`** runs the even steps that are due (`FixedStepClock`, `step_seconds` default 1/60), at most `max_steps_per_update` (default 4), and a further one only while the steps so far in this update took less than `catch_up_ms` (default 8, half a frame at 60 FPS). The time still due is dropped but for half a step: a device that can't keep up runs the world slower, and its frame rate slides with the cost of one step instead of falling to a quarter once a step costs a frame. `step()` runs one by hand.
- **A step.** Gravity; every moving body moves against the still ones with the rule's `move()`; then `passes` times (default 2), overlapping moving bodies are pushed apart by mass and lose their closing speed (`elastic_impact` with `restitution`, default 0), and what got pushed into a wall is pushed back out. `friction` (default 0) is the share of the speed a contact takes along its normal that sliding loses too. Moving bodies don't sweep against each other, so two fast ones can pass through each other.
- **Piles.** A body resting on something still is a still floor to the body on top: the upper one takes the whole push and lands on it like on a wall. The world handles pairs lowest first along gravity, so the support climbs a pile in one pass. A contact holds up when its normal is at most 60 degrees off straight up (`holds_up(normal, down)`); a face of exactly 60 degrees, as on triangles and hexagons, carries however its normal was rounded. Contacts closing slower than `bounce_speed` (default 60) don't bounce, or a resting pile would bounce each body off the one below.
- **Broad phase.** `broad_phase: { kind: "grid", cell_size: 64 }` (the default) lays a uniform grid over the moving bodies' boxes anew every step and compares a pair only in the cell where their overlap starts; still bodies stand in a grid of their own until one is added or removed. `{ kind: "none" }` compares every pair, to measure against. Both hand out the same pairs in the same order, so a world plays exactly the same with either; `world.broad_phase` switches between steps. Pick a cell about the size of a common body; the size hardly matters (step 27: cells of 16 to 48 within 5 % of each other).
- **Layers and masks.** A body is on `layer` (bits, default 1) and meets the layers in its `mask` (default `ALL_LAYERS`). Two bodies meet when each one's layer is in the other's mask (`body.meets(other)`); pairs that don't are never tested, so bullets (`layer: BULLETS, mask: WALLS | ZOMBIES`) cost nothing against each other. A still body's walls are filtered the same way.
- **Sleeping.** A body that has stayed within `sleep_distance` (default 0.5 units) of one spot for `sleep_seconds` (default 0.5; `Infinity` never) falls asleep (`body.is_sleeping`): the world stops moving it, doesn't test two sleepers against each other, and an awake body that touches a sleeper is pushed off it as off a wall. A body pushed deeper than twice `sleep_distance` in a step is wedged, not resting: it stays awake, and a sleeper it is pushed into wakes and gives way, so no overlap is frozen in. A settled heap costs next to nothing. A sleeper wakes when a neighbour moved more than a fifth of `sleep_distance` in its last step (a falling body does at once, a jittering one doesn't), when a body or wall it touches is removed, when the game gives it a speed or moves it, when gravity changes, and on `body.wake()`. Waking spreads a step at a time, only as far as things move: take out the bottom of a column and the column falls, a layer a step later. `stats.sleeping` counts them.
- **Events.** `ContactEvent`s go out after the step, never during it, so a listener may remove bodies. `a` always moves, `b` moves or is still; `normal` points from `b` towards `a`, `speed` is how fast they closed. Contacts closing slower than `contact_event_speed` (default 0) send none, and so do contacts where neither body is on `contact_event_layers` (default `ALL_LAYERS`): a crowd of thousands pushing itself apart makes as many contacts a step, and an event each costs time and garbage (step 29: 17,000 events a step at 5,000 zombies; filtered, 10.8 → 9.0 ms a step and 12.3 → 9.6 ms a frame).
- **Contacts are lent.** A rule's `overlap()` may hand out the same contact object on every call, written anew: read it before asking again. A step allocates nothing per pair.
- **Stats.** `world.stats`: `bodies`, `pairs_tested`, `contacts`, `step_ms`, `sleeping` and `steps`, for the last step and update.
- **No spin.** A crate that lands flat on a corner stays balanced there. Step 26 (Paketrutsche) tips such a body off by hand; the world leaves that to the game until bodies can turn.

---

## Miscellaneous

Other helpful tools included in the library.

### Commons

- **Colors**: A collection of common color constants.

### Data

- **RgbColor**: A class to handle RGB colors and conversions.
- **HsvColor**: hue, saturation and value: `to_rgb()`, `to_css()`, `with_hue()` and friends, `lerp()`.
- **Grid2D**: a fixed grid of values, row-major: `get`, `set`, `is_inside`, `cells()`, `row()`, `column()`.

### DOM

- **CanvasHelper**: Utilities for working with the HTML5 Canvas API.
- **QuerySelector**: Helper for selecting DOM elements with type safety.
- **`play_video_splash(container, url, options)`**: plays a video over the container and resolves with how it ended (`"ended"`, `"skipped"`, `"timeout"`, `"error"`, `"blocked"`, `"aborted"`). `hold_ms` keeps the last frame that long after the end; a click or key during the hold counts as `"ended"`, not as skipped. The game shell's `IntroGate` uses it for the intro (see [game-shell.md](game-shell.md)).

### Math helpers

Exported from the root as well:

- **`clamp(value, min, max)`**: `value` held inside `[min, max]`.
- **`lerp(from, to, t)`**: `from` at `t = 0`, `to` at `t = 1`; `t` is not clamped.
- **`angle_difference(from, to)`**: the signed turn from one angle to another in radians, wrapped into `[-π, π]`: the shortest way round.

```ts
const facing = facing_now + clamp(angle_difference(facing_now, wanted), -turn_speed * dt, turn_speed * dt);
```

The `helpers` folder also has **ID** (unique ids), **MathHelper** (`float_equals`) and **Settings**.

### Canvas

- **`PixelCanvas`**: a buffer of palette indices with the tools of a small pixel editor: `set`, `line`, `rect`, `flood_fill`, `snapshot` / `restore` for undo, and `to_image_data(palette)` for painting it. Step 14 (Pixel Paint) is built on it.
- **`SpriteBatch`**: many sprites drawn quickly. `add(image, x, y, angle, width, height)` for each (the middle of the sprite, radians clockwise, 0 faces right), then `draw(context)` once a frame. It draws image by image, with one `setTransform` per sprite on top of the context's transform and no `save()` / `restore()`, and leaves the transform as it was. All sprites of the first image added lie under those of the next: draw what must be on top in a batch of its own. The batch keeps its storage between frames. Step 29 (Horde) draws its crowd with it.

```ts
const batch = new SpriteBatch();
for (const zombie of zombies) {
    batch.add(zombie_image, zombie.x, zombie.y, zombie.angle, 32, 32);
}
camera.apply(context);
batch.draw(context);
```

### Input

- **`KeyboardState`**: key events in, per-frame questions out: `is_down(key)`, `was_pressed`, `was_released`, `typed()`, then `end_frame()`. Keys are `KeyboardEvent.key`.
- **`PointerInput`**: the same for mouse, touch and pen: taps, drags, drops, the wheel.
- **`ComboMatcher`** and **`ComboList`**: a sequence of inputs (a dance step, a cheat code) with an optional `max_gap_seconds` between steps; `input()` says `"progress"`, `"complete"`, `"broken"` or `"ignored"`.
- **`MenuInput`**: keys and presses for a `Menu`, with a buffer of presses; see [ui.md](ui.md#menus).

### Random, camera, tile maps

- **`SeededRandom`**: a seeded generator (mulberry32): `next()`, `int(min, max)`, `float(min, max)`, `chance(p)`, `fork()`. The same seed gives the same game.
- **`Camera2D`**: a view that follows a target inside the world's bounds, with a dead zone, look-ahead and smoothing; `apply(context)` puts its transform on the canvas, `world_to_screen` / `screen_to_world` map points, `is_visible(rect)` culls, `parallax(factor)` for background layers.
- **`TileMap`** and **`TileLayer`**: named layers of tiles on a grid.

### Testing

A custom test suite used for internal testing and available for general use.

- **TestClass**: Base class for tests.
- **TestDashboard**: A UI for viewing test results in the browser. The playground in `test-src/` (`npm run dev`) is built on it.
