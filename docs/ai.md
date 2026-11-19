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
10. [World](#world)
11. [Animation](#animation)
12. [Puppets](#puppets)
13. [Particles](#particles)
14. [Noise](#noise)
15. [Saves](#saves)
16. [Miscellaneous](#miscellaneous)

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
- **Hooks for a host.** `load_intro_url()` says where the intro video comes from; the default rejects, which skips the intro. `on_connected(title)` runs after every connection (a desktop retitles its window there). `load_catalogue_url(id, kind)` says where an entry of `settings.catalogue_images` or `catalogue_sounds` lives (a `CatalogueFile`: `url`, `cors`, `sheet` for an animated sprite sheet, and `rig` for a cut-out puppet); it is asked once per entry at the first connection, the file loads through `references.assets.request()` under the game's name, and the default rejects, so the game paints or plays its fallback. Catalogue sounds count for the sound button, and a catalogue `music` track starts when it arrives. A picture with `sheet` data fills `references.sheet(name)`, and `logic.load_animation(name)` plays it (see "Animation"). A picture with `rig` data fills `references.puppet(name)`, and `logic.load_puppet(name)` makes a puppet of it; one whose `rig` is a wardrobe (clothes for puppets) fills `references.wardrobe(name)`, and `logic.load_wardrobe(name)` hands it to `puppet.use_wardrobe()`; one whose `rig` is a mark sheet (tattoos, scars, paint for skins) fills `references.mark_sheet(name)`, and `logic.load_marks(name)` hands it to `puppet.use_marks()` (see "Puppets"). `@tce-v3/game-boot`'s `GameElement` (and the Spielwerk's `SpielwerkElement`, which renames it) fills all three from `dll-tce-assets`. `open_save_store(tag)` says where `properties.saves` keeps its files; it is asked once, before the game starts, with `settings.save_tag` (default the element's tag name), and the default is local storage under `<tag>/` (memory where there is none). game-boot fills it from `dll-tce-file-system` (`/saves/<tag>/<slot>.json`), falling back to local storage. See "Saves".
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
- **Actions.** `actions`, the game's `ActionBindings` (default `DEFAULT_ACTIONS`: `move`, `confirm`, `back`, `pause`); see "Actions" below. `touch_stick` and `touch_buttons` (both off) turn on the shell's touch controls, `stick_dead_zone` (0.2) is a gamepad stick's still part, `unsupported_pad_notice` what shows for a pad without the standard mapping.
- **Saves.** `save_version` (1), `save_tag` (null: the element's tag name), `save_slots` (`slot-1` to `slot-3`, for a `SaveSlotsPage`), `autosave_seconds` (10). See "Saves".
- **Intro and start screen.** `intro_timeout_ms` (6000), `intro_hold_ms` (1500), `start_button`, `start_hint`, and `start_hint_gamepad` and `start_hint_touch` for the device in use.

### Properties

- **State.** `game`, `seed`, `restarts`, `best` (a `SessionBest`), `pointer` (the last pointer position in layout coordinates, null when it left), `layout` (the stage's choice), `is_dirty` (set it when something changed outside `update()`).
- **`frame_seconds`**: how long the last frame really took. `update()` gets the same time capped at 0.1 s, so a slow frame can't throw the game; this one is for a frame rate meter or a `FrameBudget`.
- **Input.** `ui` and `page`, the toolbox UI on the canvas; `actions`, the `ActionMap` of `settings.actions`, updated before every `update()`; `keyboard`, a `KeyboardState` to read in `update()`; `menu_inputs`, the `MenuInput`s the shell hands the keys and the gamepad (every placed `MenuView` brings its own); `touch_controls`, the stick and buttons of `settings.touch_stick` and `touch_buttons`; `pad_notice`, the shell's `TimedNotice` for a pad it doesn't support.
- **Saves.** `saves`, null until a game sets it with `save_slots(options)`: a `SaveSlots` in `settings.save_version` that gets the element's store when it connects; the logic's `start()` resumes its autosave and `stop()` pauses it (saving once more). See "Saves".
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
- **Overlay.** The shell paints `frame.overlay` over the scene and under the UI: `paint_touch_controls(context, touch)` from the first touch on, and `paint_notice(context, layout, text)` for the pad notice. Override either for a look of the game's own.
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
- **Actions.** Read `this.properties.actions` in `update()`: `vector("move")`, `is_down("fire")`, `just_pressed("pause")`. The keyboard, the first standard gamepad and the touch controls all feed it; see "Actions" below.
- **Widgets.** `on_click(widget, handler)`, `on_change(widget, handler)` and `on_refused(widget, handler)` (a press on a disabled widget: where a game says why). Each replaces the handler instead of adding a second one, so calling them in `on_start()` on every connection is safe.
- **Lifecycle.** `on_start(signal)` runs on every connection, `on_stop()` on every disconnection; the state stays. `on_layout(layout)` follows a layout switch, after the placed widgets moved.
- **Rounds.** A game whose `is_round_finished(game)` says so gets `on_round_finished(game)` once (offer the result to `properties.best` there), and a press or a `next_round_keys` key then calls `start_next_round()` (default: `restart()`) instead of reaching the input hooks. While `settings.round_end_hold_seconds` hasn't passed, `is_round_end_ready` is false and such a press does nothing.
- **Status line.** `set_status(text)` says something to assistive technology. `live_status(game)` keeps it in step with the game after every repaint, `ready_status(game)` and `intro_status(state)` cover the start.
- **Themes.** `theme_name(game)` names the entry of `settings.themes` that shows; the shell swaps when the answer changes.
- **Files that come later.** A file asked for with `references.assets.request()` repaints as it arrives, like an image of `settings.images`; `paint_image()` finds a requested image by its name. See [assets.md](assets.md).

### Actions

A game asks for actions by name, never for a key, a pad or a finger. `settings.actions` declares them as plain data, and the shell builds `properties.actions`, an `ActionMap` over the keyboard, the first gamepad in the browser's standard mapping and the touch controls, and updates it before every `update()`.

```ts
const ROVER_ACTIONS = {
    move: DEFAULT_ACTIONS.move,
    fire: { kind: "button", keys: ["Space"], pad: ["a", "rt"], touch: "button", label: "Boost" },
    confirm: { kind: "button", keys: ["Enter"], pad: ["a"] },
    back: DEFAULT_ACTIONS.back,
    pause: DEFAULT_ACTIONS.pause,
} as const satisfies ActionBindings;

class RoverSettings extends CanvasGameSettings {
    public override readonly actions = ROVER_ACTIONS;
    public override readonly touch_stick = true;    // a floating stick on the left half
    public override readonly touch_buttons = true;  // a round "Boost" button on the right
}

// in the logic's update(game, delta_seconds):
const actions = this.properties.actions;
game.drive(actions.vector("move"), actions.is_down("fire"));
```

- **Touch** is opt-in, because a stick on the left half takes the taps a puzzle game wants. When on, the shell gives the touch controls the touches no widget took, before `on_press()`, several fingers at once, and paints them from the first touch on; the rest of the touches reach the game as before.
- **Menus.** Every placed `MenuView`'s input reads `move`, `confirm` and `back` from the gamepad (`MenuInput.handle_actions()`), so every shell menu works with a pad.
- **The shell's own use.** A pad's `confirm` (A) leaves the start screen and starts the next round on a finished one, as Space does. `actions.last_device` picks the start screen's hint (`start_hint`, `start_hint_gamepad`, `start_hint_touch`) and the intro status; before any input it is `touch` on a device whose main pointer is coarse. A pad without the standard mapping is ignored, and `pad_notice` says so over the game for six seconds.
- A game that never reads `properties.actions` loses nothing: the map is read every frame anyway, and its keys and taps reach the hooks as before.

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

## World

Grids a game is played on, and the ways across them. Everything here works on `Grid2D`, so on a `TileMap` layer as well (a `TileLayer` is a `Grid2D`).

- **`TileMap`** and **`TileLayer`**: named layers of tiles on a grid, and the arithmetic between tile positions and world coordinates (`world_to_tile`, `tile_to_world`, `tiles_in`, `rects_where`, `from_ascii`).
- **`world/pathfinding`**: the cheapest way from one cell to another (`find_path`), from every cell to the nearest of some targets (`flow_field`), and fewer corners on the way (`smooth_path`). Since 6.1.0.
- **`world/visibility`**: what can be seen from where (`field_of_view`, symmetric shadowcasting), a `FogOfWar` with unseen, seen and visible cells for many viewers, and `draw_fog`. Since 6.2.0.

### Pathfinding

Functions, like the physics functions: the game owns its walkers, asks for a way and walks it. There is no pathfinding "world" that keeps walkers.

The one thing a game must say is which cells can be walked. Everything else has a default:

```ts
interface GridPathOptions<T> {
    passable: (value: T, x: number, y: number) => boolean;
    cost?: (value: T, x: number, y: number) => number;   // stepping onto the cell; default 1
    diagonal?: boolean;                                   // eight neighbours; default false (four)
}
```

- **Costs** are what stepping onto a cell costs. A value below 1 counts as 1, so the distance estimate never guesses too high and the path stays the cheapest. A diagonal step costs √2 times the cell's cost.
- **Diagonals never cut a corner.** A diagonal step needs both cells beside it open, not only one: a walker has a body, and squeezing past the corner of a wall would put it half inside.

#### One walker, one goal: `find_path`

```ts
find_path(grid, from, to, { passable, cost?, diagonal?, max_steps? }): GridPosition[] | null
```

A* with a binary heap; the estimate is the Manhattan distance, or the octile one with `diagonal`. The answer is the list of cells from `from` to `to`, both included, or `null` when there is no way, the goal is blocked or either cell lies outside. A path to the cell itself is that one cell.

- The start cell is never tested: a walker standing on a cell that was just closed still finds its way out.
- `max_steps`: how many cells to look at before giving up with `null` (default: no limit), for a map so large that a far goal shouldn't cost a frame.

#### Many walkers, one place: `flow_field`

```ts
const field = flow_field(grid, targets, { passable, cost?, diagonal? });
field.next_cell(x, y);      // the cell to step to, or null on a target and without a way
field.direction_at(x, y);   // the same as a step: each part -1, 0 or 1
field.distance_at(x, y);    // what the cheapest way costs; 0 on a target, Infinity without one
field.is_reachable(x, y);
field.is_target(x, y);
field.reached;              // how many cells have a way
```

One Dijkstra pass outwards from all targets at once: every open cell learns the cheapest way to the nearest target. A hundred walkers going to the same place then cost one pass in all, not a search each. The distances are the costs `find_path` adds up, so the two always agree. Targets that are blocked or outside are skipped. The field doesn't follow later changes of the grid: build a new one when a cell opens or closes.

#### Fewer corners: `smooth_path` and `has_line_of_sight`

A path of cells zigzags. `smooth_path(grid, path, passable)` keeps the first and the last cell and, from each kept cell, skips ahead while the cell after the next one is still in straight sight; every leg of the result is a straight line over open cells. The path given is not changed.

`has_line_of_sight(grid, a, b, passable)` walks the grid from the middle of `a` to the middle of `b`, every cell the line touches; where it passes exactly through a corner, both cells beside it must be open, as for a diagonal step. Measured against a test of the line against each blocked cell's box (`Rect.touches_segment`), the walk is about 3.5 times faster (0.22–0.25 µs against 0.80–0.89 µs per line on a 48 by 30 grid) and gives the same answers.

#### Which one

From step 31 (Ameisenbau), on a nest of 32 by 24 cells, Node 22:

| Nest | Open cells | One flow field | One A* path | Field cheaper from |
| --- | --- | --- | --- | --- |
| The start nest (long tunnels) | 137 | 26–27 µs | 8.4–9.1 µs | 3–4 walkers |
| Every cell dug open | 763 | 144–178 µs | 10.9–11.1 µs | 14–17 walkers |

A* is cheap where the estimate leads it straight to the goal; a flow field pays for every open cell, wanted or not. A handful of walkers with goals of their own want A*; a crowd going to one place wants a field. Rebuilding two fields and a path per walker on the way after the player digs: 65 µs on the start nest, 0.33 ms with everything open.

```ts
const WALKING = { passable: (kind: Cell) => kind === "tunnel", diagonal: true };

// After every dig: one field for all carriers ...
to_store = flow_field(nest, store_cells, WALKING);
// ... and one path per nurse.
const path = find_path(nest, nurse_cell, nursery_cell, WALKING);
nurse.path = path === null ? null : smooth_path(nest, path, WALKING.passable);

// Each frame, per carrier:
const next = to_store.next_cell(cell.x, cell.y);
if (next === null && !to_store.is_target(cell.x, cell.y)) {
    carrier.is_stuck = true; // no way: wait for the next dig
}
```

- **Walk to the middle of the next cell.** A walker heading for the middle of a neighbour stays inside the open cells (a diagonal neighbour has both side cells open). A walker that is off the middle of its own cell walks to that middle first before the first leg of a smoothed path, or the leg's line of sight doesn't hold for it.
- **A walker as wide as a cell** brushes the earth along a smoothed leg; the line test is for the middle line only.

### Visibility

What can be seen from where, on any `Grid2D`: one viewer's field of view as a function, and a fog of war that remembers. Since 6.2.0 (`world/visibility`), first used by Spielwerk step 36, Laterne. `has_line_of_sight` (pathfinding) answers one pair of cells; this answers a whole view at once.

The one thing a game must say is which cells stop sight:

```ts
interface FieldOfViewOptions<T> {
    blocks_sight: (value: T, x: number, y: number) => boolean;
    shape?: "round" | "square";   // default "round": dx² + dy² ≤ r² + r, a disc of radius r + ½
}
```

#### One view: `field_of_view`

```ts
field_of_view(grid, origin, radius, { blocks_sight }): GridPosition[]       // each visible cell once, the origin first
visit_field_of_view(grid, origin, radius, options, (x, y) => ...): number   // no list: a callback, returns the count
in_sight_radius(dx, dy, radius, shape?): boolean
```

Symmetric shadowcasting after Albert Ford: four quadrants of 90° (each two octants), scanned row by row away from the viewer; a row's light is a range of slopes, cut where a blocking cell stands. Slopes are whole-number fractions, so ties come out the same from both ends.

- **Symmetric.** An open cell B is seen from an open cell A exactly when A is seen from B (a test checks every pair on twelve random maps). A scout who sees an enemy is seen by it.
- **Walls are seen, not what is behind them.** A blocking cell shows whenever light reaches any part of it, so a room's walls and corners and a long corridor's walls all show; nothing behind a solid wall does.
- **No squeezing through corners.** Light never passes between two blocking cells that touch only at a corner (a diagonal line of walls is a wall, from either side). This is one rule added to Ford's scan: an open cell whose only way in is between two such cells counts as blocked.
- **What "seen" means.** The line from the viewer's middle to the cell's middle, sampled at each row's middle along its longer axis, lies in open cells (or exactly on the border of one). This is a little more generous than a line that may not touch any wall at all: a line may graze a wall's corner by up to half a cell between two row middles.
- Outside the grid counts as blocking; from outside the grid nothing is seen. Radius 0 sees the cell itself.

#### Many viewers that remember: `FogOfWar`

```ts
const fog = new FogOfWar(grid, { blocks_sight });
fog.update([{ id: 1, x: 10, y: 4, radius: 8 }, ...]);   // FogChanges { recomputed, seen, shown, hidden }
fog.state_at(x, y);          // "unseen" | "seen" | "visible"
fog.is_visible(x, y); fog.is_seen(x, y); fog.viewers_at(x, y);
fog.seen_count; fog.visible_count; fog.version;
fog.events.attach(FogSeenEvent, (event) => event.cells);  // cells seen for the first time, one event per update
fog.changed(x, y);           // a door opened: the next update casts the views that could reach it
fog.reveal_all(); fog.forget(); fog.copy_states(bytes);
```

- **Incremental.** A count per cell says how many viewers see it. `update(viewers)` casts the view again only for viewers that are new, moved to another cell, changed their radius, or stand within their radius of a cell reported `changed`; it takes back the view of viewers no longer listed. A unit standing still costs nothing. Viewers are matched by `id`, or by their place in the list when they have none (give all an id or none). Positions are cut to whole cells, so a unit's position in cells will do.
- **Events for treasure.** `FogSeenEvent.cells` lists the cells seen for the first time in that update: where a game makes a treasure, an enemy base or a tile appear. Walking back over known ground tells nothing.
- **Remembers.** A cell once seen stays `"seen"` when no one sees it any more; `forget()` keeps only what is visible now (a new round), `reveal_all()` marks everything seen.
- The fog asks `blocks_sight` once per cell and keeps the answer; `changed(x, y)` asks again.

#### Drawing it: `draw_fog`

```ts
draw_fog(context, fog, cell_size, { unseen_color: "#111111", seen_alpha: 0.6, soft: false, grey_seen: false, x: 0, y: 0 });
```

One picture of one pixel per cell, kept with the fog and made again only when `fog.version` changed, scaled onto the grid with one `drawImage`. Unseen cells get `unseen_color`, cells seen before get it at `seen_alpha`, visible cells stay clear. `soft` scales the picture smoothly, so the fog fades over one cell. `grey_seen` drains the color from cells seen before (a second picture drawn with the blend mode `saturation`), so only what is seen now is in color. Draw it after the map and before what should stay on top. `fog_pixels(fog, rgba, options)` gives the same pixels for a texture of one's own.

#### What it costs

Measured in Spielwerk step 36 (`src/game/Measure.ts`, the browser check calls it through the bundle), Intel i7-11700F, Node 22 and Playwright's headless Chromium. A 200 × 200 map with 12 % of the cells scattered rock (or none), views from 400 places; the fog updates are the best and middle of 12, with every viewer moved one cell (so every view is cast again; standing still is free). Chromium's clock counts in 0.1 ms steps, so its fog numbers are the mean of the batch.

| One view | Cells seen | Node 22 | Chromium |
| --- | --- | --- | --- |
| radius 8, 12 % rock | 141 | 9–11 µs (13 000–16 000 cells/ms) | 9–10 µs (14 000–16 000 cells/ms) |
| radius 16, 12 % rock | 321 | 21–25 µs | 21–23 µs |
| radius 8, open | 225 | 10–12 µs (19 000–22 000 cells/ms) | 10–11 µs |
| radius 16, open | 861 | 35–42 µs (20 000–24 000 cells/ms) | 35–38 µs |

| Fog update, 200 × 200, all moved | Node 22 | Chromium |
| --- | --- | --- |
| 10 viewers, radius 8 | 0.23–0.26 ms | 0.12–0.2 ms |
| 100 viewers, radius 8 | 1.4–2.2 ms | 1.1 ms |
| 10 viewers, radius 16 | 0.3–0.5 ms | 0.3–0.4 ms |
| 100 viewers, radius 16 | 2.7–3.0 ms | 2.4–2.6 ms |

A hundred units all moving at once fit in a frame many times over; units step into a new cell only now and then, so a real-time strategy game pays a fraction of that. Step 36's own fog (three scouts, radius 6, a 48 × 36 cave): 0.013–0.02 ms per update.

```ts
// A real-time strategy game: units in world units, cells of 32.
const fog = new FogOfWar(map, { blocks_sight: (tile) => tile.is_wall });
fog.events.attach(FogSeenEvent, (event) => reveal_treasures(event.cells));
// Each frame:
fog.update(units.map((unit) => ({ id: unit.id, x: unit.x / 32, y: unit.y / 32, radius: unit.sight })));
draw_fog(context, fog, 32, { soft: true });
// Enemies show only where some unit sees: fog.is_visible(cell.x, cell.y).
```

---

## Animation

A sprite sheet is one picture full of frames; clips play some of them, one after the other, and a player per sprite says which frame shows now. Pictures don't blend: that's what a sheet can't do. Since 6.1.0 (`canvas/animation`), first used by Spielwerk step 32, Daumenkino.

- **`SpriteSheet`**: the frames (rectangles in one picture), the clips by name, the anchor and the default clip.
- **`AnimationClip`**: one clip, made from plain data.
- **`AnimationPlayer`**: plays the clips of a sheet for one sprite: `play`, `queue`, `then`, `speed`, `paused`, and frame events on an `EventSocket`.

### A sheet in three lines

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
- **`SpriteSheet.from_frames(image, rects, anchor?)`** takes frames of any size, packed anywhere (an atlas); a frame may bring its own `anchor` (a `SheetFrame`, see Crowds below).
- **`SpriteSheet.from_data(image, data)`** takes a whole sheet as plain data (below): frames, anchor, clips and default clip.
- **`anchor`** is the point of every frame that is drawn at the sprite's position: the feet for a character, so it stands on the floor whatever the frame. Without one the frame's middle is drawn there.
- **`draw_frame(context, frame, x, y, { scale, flip_x })`** draws one frame with its anchor at `x`, `y`; `flip_x` mirrors it around the anchor, so a sprite drawn facing right faces left. It answers false while the picture or the frame isn't there. The player's `draw()` is the same for its current frame. Smoothing is the context's: off for pixel art, on for a rendered picture.

### Clips as plain data

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

### The player

- **`play(name, { restart? })`** switches at once, from the clip's first frame, and forgets the queue. The clip playing already goes on where it is, so a game may say `play("walk")` every frame while the walk key is held; `restart: true` starts it over.
- **`queue(name)`** plays `name` when the current clip ends: a loop at the end of its round, a clip played once after its last frame (instead of its `then`). Nothing playing, or a clip that stopped: at once.
- **`then`**: a clip played once goes on with the clip it names (`jump` → `idle`). Without `then` it stops on its last frame and `finished` is true.
- **`ping-pong`** turns at both ends and plays on: 0 1 2 3 2 1 0 1 …
- **Time carries over.** What is left of an update when a clip ends counts for the next one, so a queued clip starts exactly at the end, not a frame later.
- **`speed`** scales time: 2 plays twice as fast, 0.1 shows single frames, 0 stands. `paused` stops time.
- **What it says:** `clip` (the `AnimationClip`), `clip_name`, `frame_index` (within the clip), `frame` (the sheet's frame, -1 while there is none), `frame_time`, `queued`, `finished`.
- **`play()` and `queue()` answer false** for a name the sheet doesn't have; nothing changes then.

#### Frame events

A named frame sends an `AnimationFrameEvent` (`name`, `clip`, `frame_index`, `frame`) on `events` each time it comes up, also when one update passes several frames, so a footstep sound or a puff of dust sits on its frame at any speed. The first frame of a clip comes up at the first `update()` after it started. A clip that ends sends an `AnimationEndEvent` (`clip`, `next`: the clip that follows, or null when it stops).

```ts
hero.events.attach(AnimationFrameEvent, (event) => {
    if (event.name === "step") {
        audio.play_sound("step");
    }
});
```

#### Speed as a trick

`speed` changes how fast the pictures turn, not what they show. A walk at 1.6 times its speed reads as a hurried walk, almost a run, without a frame of its own; a character that moves across the screen should move at the same factor, or the feet slide. A run cut from its own video looks different (longer steps, a lean): Daumenkino lets both be compared.

### In the game shell

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

### Without a picture

A sheet and its players work without a picture (`SpriteSheet.grid(null, 32, 32, { columns: 8, rows: 2 })`, `from_data(null, data)`, `new SpriteSheet()`): a game's rules and its tests can run the clips, and the renderer draws once `sheet.image` is set.

---

### Crowds

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

#### Sheet frames in the batch

- **`add_frame(image, rect, x, y, { anchor, scale, flip_x, angle, picture_scale })`** adds the part `rect` of a picture with its `anchor` (default: the middle) at `x`, `y`. `add_animation(player, x, y, options)` is the same for the player's current frame and the sheet's anchor for it; it answers false while the picture or the frame isn't there.
- **Fewer transforms.** An unturned frame is drawn on the context's own transform; mirrored frames share one mirrored transform, so the batch only switches where flipped and unflipped ones take turns. A turned frame gets one `setTransform` of its own. `add()` (whole pictures, step 29) is unchanged.
- **Order.** Within a picture, sprites keep the order they were added in: add them sorted by y and the people in front cover the ones behind. Between pictures, the first picture added is drawn first. Something that stands among the crowd (a stall, a tree) goes between two `draw()` calls: draw the people above it, then it, then the rest.

#### Per-frame anchors

A packer that trims frames gives each one its own pivot. `SpriteSheet.from_frames(image, frames, anchor?)` takes a `SheetFrame` per frame (`left`, `top`, `width`, `height` and an optional `anchor`); a frame without one uses the sheet's `anchor`, or its middle. `sheet.anchor_of(frame)` answers which; `draw_frame`, the batch and the crowd use it.

#### A picture the size it is shown

`sheet.prescale(scale, make_canvas?)` draws the picture once at `scale` into a canvas and draws from that from now on (`picture_scale` says how much smaller it is). Frames, anchors and drawn sizes stay in the first picture's pixels, so nothing else changes. Choose the scale the sprites are shown at on the screen (their scale times the view's times the stage's), and make it again when that changes by much: set `sheet.image` back to the first picture (that resets it) and call `prescale` anew. It only shrinks. The cabbage kid's sheet is 1980 × 2048 and shown at about a third: on a graphics card that carried about a third more sprites (table below); in a software canvas it was within the noise.

#### `CrowdAnimation`

- **`new CrowdAnimation(sheet, capacity?, { random, events })`**: room for `capacity` members at first (it grows); `random` draws the start times (default seeded with 1); `events: false` sends no `CrowdFrameEvent`s and builds none.
- **`add(clip, { speed, time, flip_x, scale })`** returns the member's number. Without `time` a looping clip starts at a random point of one pass (a clip played once at its start): a crowd doesn't walk in step, and the same seed gives the same crowd. The frames a start time skips send no events.
- **`remove(index)`** moves the last member into the gap, as a game's own arrays do, and returns the number it had (-1 when `index` was the last). `clear()` empties it.
- **`play(index, clip, { restart })`**, `update(dt)`, `frame_of(index)`, `frame_index_of`, `clip_of`, `is_finished`; `speed_of`/`set_speed`, `is_flipped`/`set_flip`, `scale_of`/`set_scale`; `count`, `capacity`.
- **Exactly a player's frames.** Members play the same frames a single `AnimationPlayer` would (`then`, ping-pong, time carried over, at any speed); tested frame for frame against 1 000 players. They have no queue and no pause (speed 0 stands).
- **`draw(batch, positions, { order, count, scale })`** adds each member's frame to a batch: member `i` at `positions[2 i]`, `positions[2 i + 1]`, in `order` if given (an `Int32Array` of members sorted by y, or a part of it), at `scale` times its own. It answers how many it added; none while the sheet has no picture.
- **Events.** A named frame sends a `CrowdFrameEvent` (`member`, `name`, `clip`, `frame_index`, `frame`) on `events`. A single player can be quiet too: `player.sends_events = false`.

#### What it costs

Measured in Spielwerk 37 (Gewimmel): the cabbage kid's sheet, people walking on a market square seen at an angle, about 38 × 37 pixels each, sorted by y with eight stalls in between. "Messen" counts the most walking people that still give 57 FPS or more (double from 100, then halve the gap); Intel i7-11700F.

| Drawing | RTX 4070, Chrome in a window (ANGLE OpenGL) | Headless Chromium (SwiftShader, software canvas) |
| --- | --- | --- |
| Each player alone (`player.draw`) | 6 000–6 400 | 2 000–2 200 |
| Players through the batch (`add_animation`) | 7 200–7 600 | 2 000–2 200 |
| `CrowdAnimation` through the batch | 7 200–7 600 | 1 900–2 200 |
| The same three from the whole 1980 × 2048 sheet | 1 600–5 200 / 5 600 / 5 600 | 1 700 / 1 900 / 2 000 |

Updating is not what limits a crowd: in Node 22, 1 000 walkers update in 0.024 ms as players and 0.012 ms as a crowd, 20 000 in 0.16 ms and 0.22 ms (Chrome: 0.012 ms for 1 000 in the crowd); `CrowdAnimation` saves objects (one per sprite, with its event socket), not time. The rest is putting pixels on the canvas: in software every way stops near 2 000, on a graphics card the batch carries a fifth more than single draws and a picture the size it is shown a third more again. Headless Chrome on the card (`--enable-gpu`) measured like software: its compositor stays in software.

## Puppets

A puppet is a skeleton of bones with picture parts on them: a thigh, a shin and a boot, each cut out on its own, each turning on its joint. Clips turn the bones over time, and the parts follow. Unlike a sprite sheet (see "Animation") a pose can be anything between two keys, two clips blend into each other, and the same clips play on any set of parts made for the same bones: swap the parts and a wanderer runs as a gardener. Since 6.2.0 (`canvas/puppet`), first used by Spielwerk step 38, Puppenspieler.

- **`PuppetRig`**: everything a puppet is, made from plain data: bones, slots (the drawing order), skins (sets of parts in one picture), anchors and clips.
- **`Puppet`**: one puppet on stage: its own `Skeleton`, the skin it wears and a `PuppetPlayer`. Many puppets share a rig.
- **`PuppetPlayer`**: plays the rig's clips for one puppet: `play` with a fade, `queue`, `then`, `speed`, `paused`, `seek`, and named moments as events.
- **`Skeleton`**: the bones in flat arrays: the pose (`rotation`, `x`, `y` per bone, on the rest pose) and the world matrices `update()` makes from it.
- **`PuppetClip`**: one clip: keys per bone, sampled at any time.
- **`Wardrobe`**: clothes and accessories for every puppet of one skeleton, in one atlas: pieces (a hat, a coat with its sleeves and tails) on bones and anchors, worn by place (since step 39, Kleiderschrank; [below](#clothes-on-anchors)).
- **Body shape and skin**: shape values that scale bones and bend parts as meshes (`PartMesh`), tints that keep the shading, marks from a `MarkSheet` laid onto the skin, and the whole `character` as data (since step 40, Maskenbildner; [below](#body-shape-and-skin)).

The format is our own, close to Spine's and DragonBones' ideas (bones, slots, skins, keyed tracks) but much smaller; no Spine runtime or file is involved.

### A puppet in four lines

```ts
const rig = PuppetRig.from_data(rig_data, atlas_image);
const hero = rig.puppet("idle");          // one Puppet per character; many share a rig

// every frame:
hero.update(delta_seconds);
hero.draw(context, hero_x, floor_y, { flip_x: facing_left, scale: 0.6 });
```

- **`draw(context, x, y, { scale, flip_x, debug, debug_color, highlight })`** draws the parts in slot order, each on its bone, with the puppet's feet (the root bone) at `x`, `y`; `flip_x` mirrors it around its feet. `debug` draws the bones and joints on top, `highlight` one bone thicker (an editor's pick). It answers false while the data or the picture isn't there. The context's transform is the same afterwards: draw a puppet inside a camera's transform as anything else.
- **`play(name, { fade, restart })`** and **`queue(name)`** go to the player (below).
- **`set_skin(skin)`** puts on another set of parts (below).
- **`skeleton`**: change the pose after `update()` and call `skeleton.update()` to turn a head towards the mouse, or let an editor pose it.

### The rig as plain data

A rig is a JSON object, the shape a catalogue entry's `rig` has (dll-tce-assets 0.5.0), so an entry feeds `PuppetRig.from_data()` as it is. Units are the atlas's pixels, y points down, angles are degrees turning clockwise on the screen (from +x towards +y), and the root bone sits where the puppet stands.

```json
{
    "skeleton": "biped-side",
    "facing": "right",
    "bones": [
        { "name": "root", "length": 42 },
        { "name": "hip", "parent": "root", "y": -168, "rotation": -90, "length": 16.8 },
        { "name": "torso", "parent": "hip", "length": 105 },
        { "name": "thigh_r", "parent": "hip", "x": -12.6, "rotation": 180, "length": 65.1 }
    ],
    "slots": [
        { "name": "torso", "bone": "torso" },
        { "name": "thigh_r", "bone": "thigh_r" }
    ],
    "skins": {
        "wanderer": {
            "attachments": {
                "torso": { "rect": [154, 4, 89, 141], "pivot": [45.7, 121.5], "rotation": 90 },
                "thigh_r": { "rect": [297, 4, 46, 108], "pivot": [22.7, 23.1], "rotation": -90 }
            }
        }
    },
    "anchors": { "heel_r": { "bone": "foot_r", "x": -12.6, "y": 27.3 } },
    "clips": {
        "walk": {
            "length": 1, "loop": true, "travel": 177.68,
            "events": { "0": "step", "0.5": "step" },
            "tracks": { "thigh_r": [{ "t": 0, "rotation": -24 }, { "t": 0.125, "rotation": -14 }] }
        }
    },
    "default_clip": "idle"
}
```

(Cut down from the wanderer: the whole rig has 16 bones, 15 slots, two anchors per foot and five clips.)

- **`bones`**: parents before their children. A bone's `x`, `y` is where its joint sits in its parent's frame (along the parent is +x), `rotation` its angle on the parent's at rest, `length` from the joint to its tip (for drawing and picking the bones). All default to 0.
- **`slots`**: places for parts, in drawing order: the first is drawn first, behind the others. A slot sits on a bone. The far arm comes before the torso, the near arm after it.
- **`skins`**: sets of parts by name, all in the rig's one picture. A part (`attachments[slot]`) is a `rect` `[x, y, width, height]` of the atlas, its `pivot` (the point of the part, from the rectangle's top left, that sits on the bone's joint) and its `rotation` on the bone (a part drawn upright on a bone that points down is `-90`). `resolution` says how many atlas pixels make one unit, for a sharper atlas of the same puppet. A slot a skin has no part for draws nothing. `default_skin` is the one a new puppet wears (default: the first).
- **`anchors`**: named points on bones, in the bone's frame: the soles' heel and toe, where a hat or a sword goes. An anchor may have a `rotation` on its bone (default 0); clothes hang on it turned by that much, so a piece drawn upright hangs upright at rest (the catalogue's puppets have `head_top`, `hand_r`, `hand_l`, `belt`, `back`, `foot_r` and `foot_l`, each pointing the way the puppet faces at rest). `rig.anchors.get(name)` and `skeleton.world_point(anchor.bone, anchor.x, anchor.y)` say where they are now, `puppet.anchor_world(name)` with its angle.
- **`clips`** (below), **`default_clip`** (default: the first), `facing` (the way the pictures face), `bounds` (the rest pose's box around the root, `[x, y, width, height]`).

`from_data()` checks it and throws with a clear message: a bone before its parent, two bones of one name, a slot on an unknown bone, a part for an unknown slot, a clip on an unknown bone, keys out of order, an event past a clip's end. `new PuppetRig()` is a rig still on its way; `set_data(data)` fills it later and `image = picture` brings the picture; `has_data` and `is_ready` say how far it is, and `version` counts the changes (puppets made before follow by themselves).

### Clips as plain data

```json
"jump": {
    "length": 1.1,
    "then": "idle",
    "events": { "0.3": "jump", "0.8": "land" },
    "tracks": {
        "hip": [{ "t": 0, "y": 0 }, { "t": 0.3, "y": -6, "ease": "smooth" }, { "t": 0.55, "y": -150 }, { "t": 0.8, "y": 0 }],
        "thigh_r": [{ "t": 0, "rotation": 0 }, { "t": 0.25, "rotation": -40, "ease": "step" }]
    }
}
```

- **Keys are offsets on the rest pose**: `rotation` in degrees added to the bone's rest angle, `x` and `y` added to its rest position in the parent's frame (the hip's bob in a walk, a jump's height). A key may leave a channel out; it is then taken from the keys around it that have it. A bone without a track stays at rest.
- **`ease`** goes from this key to the next: `linear` (default), `smooth` (in and out) or `step` (hold until the next key).
- **`loop`** wraps from the last key to the first; without it the clip stops at its end and holds its last pose, or goes on with **`then`**.
- **`events`** name moments by time, in seconds as written (`{ "0.5": "step" }`).
- **`travel`**: how fast a standing foot slides back, in units per second. Move the puppet this fast (times its draw scale) and its feet don't skate. Leave it out for clips on the spot.

`rig.clip(name)` gives the `PuppetClip`; `clip.sample(time, skeleton)` poses a skeleton at any moment, `clip.moments` lists the events, `clip.to_data()` turns it back into data. `rig.add_clip(name, data)` adds or replaces a clip at run time (an editor's clip, below).

### The player

```ts
hero.play("run");                       // at once, the bones blend over default_fade (0.15 s)
hero.play("idle", { fade: 0.4 });       // a slower blend
hero.play("wave", { restart: true });   // from the start, also when it's playing
hero.queue("jump");                     // after the current clip's round
hero.player.speed = 1.5;
hero.player.events.attach(PuppetMomentEvent, (event) => {
    if (event.name === "step") {
        audio.play_sound("step");
    }
});
```

- **`play` fades** from the pose before into the new clip: every bone's angle blends the short way round (from 170° to -170° is 20°, not 340°), positions linearly. `fade: 0` cuts.
- **Time carries over**: what is left of an update at a clip's end goes into the next clip, so a walk that loops at 1 s and an update of 0.1 s at 0.95 s lands at 0.05 s.
- **Moments are sent once each**, also when one update passes several, at any `speed`: `PuppetMomentEvent` (`name`, `clip`, `time`) on `events`, and `PuppetEndEvent` (`clip`, `next`) when a clip played once ends. `sends_events = false` keeps a puppet quiet (a crowd in the back). More than `MAX_ROUNDS_PER_UPDATE` rounds in one update drop the rest: a tab that slept for an hour doesn't replay the hour.
- **`paused`** stops the time; **`seek(time)`** jumps within the clip without sending moments (an editor's scrubbing).
- `clip`, `clip_name`, `time`, `finished`, `queued`, `fading` say where it is.

### Reskinning

Two rigs with the same `skeleton` name have the same bones and slots: one's skin fits the other's puppet, and both play the same clips.

```ts
const wanderer = rig_of_wanderer.puppet("run");
wanderer.set_skin(rig_of_gardener);     // the gardener's default skin: same bones, same run
wanderer.set_skin("wanderer");          // one of its own skins by name
```

`set_skin` takes a skin name of the puppet's rig, a `PuppetSkin`, another `PuppetRig` (its default skin; one still loading is worn when it comes, the puppet's own until then) or another `Puppet`. It answers false, and nothing changes, for a skin of another skeleton or a name the rig doesn't have. The bones, the clip and its time stay; only the parts change.

A rig may also hold several skins itself (`skins` in the data): a red and a blue team in one atlas.

### Clothes on anchors

A **wardrobe** is a second atlas for every puppet of one skeleton: pieces of clothing and things to hold, each in a **place** (`hat`, `top`, `trousers`, `shoes`, `back`, `hand_r`, ...), one piece per place. A piece has one or more parts: a hat is one part on the `head_top` anchor, a coat is a torso part, four sleeve parts on the arm bones and two tails on the thighs. The parts follow their bones as the skin's do, through every clip and on every skin of the skeleton: a coat made once fits the wanderer and the gardener.

```ts
const clothes = Wardrobe.from_data(clothes_data, clothes_atlas);
const hero = rig.puppet("walk");
hero.use_wardrobe(clothes);                           // shared by every puppet that uses it
hero.wear("straw-hat");                               // in its place: what was there comes off
hero.set_outfit({ hat: "top-hat", top: "blue-coat" }); // the whole outfit, one change
hero.take_off("hat");                                 // a place, or a piece's id
save(hero.outfit);                                    // plain data: { top: "blue-coat" }
```

The data, the shape a catalogue entry's `rig` has for a wardrobe (dll-tce-assets 0.6.0, `rendered/puppet/clothes` and `rendered/puppet/accessories`):

```json
{
    "skeleton": "biped-side",
    "facing": "right",
    "places": { "trousers": 10, "shoes": 20, "top": 30, "hat": 60 },
    "pieces": {
        "straw-hat": {
            "place": "hat", "title": "Strohhut",
            "parts": [{ "name": "hat", "anchor": "head_top", "rect": [625, 480, 188, 56], "pivot": [96, 36.2] }]
        },
        "blue-coat": {
            "place": "top", "title": "Blauer Mantel",
            "parts": [
                { "name": "torso", "bone": "torso", "rect": [132, 4, 112, 151], "pivot": [49.7, 124.5], "rotation": 90 },
                { "name": "sleeve_upper_r", "bone": "upper_arm_r", "rect": [55, 292, 47, 97], "pivot": [23.7, 23.5], "rotation": -90 },
                { "name": "tail_l", "bone": "thigh_l", "rect": [196, 393, 77, 82], "pivot": [40.7, 18.1], "rotation": -90 }
            ]
        },
        "staff": {
            "place": "hand_r", "title": "Wanderstab",
            "parts": [{ "name": "staff", "anchor": "hand_r", "rect": [4, 4, 27, 273], "pivot": [8.9, 137], "behind": "hand_r" }]
        }
    }
}
```

- **`places`**: the places by name with their **layer**: of two parts at the same spot the lower layer lies nearer the body (trousers under boots under a coat). A piece in a place the wardrobe doesn't list is an error.
- **A part** sits on a `bone` or on an `anchor` (one of them), with `rect`, `pivot` and `rotation` as a skin's part. On an anchor, the pivot sits on the anchor's point and the part turns with the anchor's angle.
- **Where it is drawn** is data, never decided by a frame: by default in front of the first slot on its bone (a sleeve over the arm); `in_front_of: "slot"` in front of another slot; `behind: "slot"` behind one (a backpack behind the far thigh, a staff behind the hand that holds it); `slot: "slot"` instead of the skin's part there (a whole new foot). Among parts at one spot the place's layer orders them (`layer` on a part overrides it): in front, the inner layer first; behind, the outer layer furthest back. Ties go by piece id, then by the part's number.
- `title` is what a game shows; `resolution` as a skin's.

**The drawing order** is sorted once when the outfit changes (or the skin, the rig or a wardrobe's data), never per frame: `puppet.drawing_order` is the same array until then, the slots' names and `"piece:part"` for clothes (`"blue-coat:sleeve_upper_r"`), for tests and editors. Drawing a dressed puppet is one `setTransform` and one `drawImage` per part, as without clothes.

- **`use_wardrobe(wardrobe)`**: a puppet may use several (step 39: clothes and accessories); `find_piece(id)` looks in them in order. A wardrobe still loading is fine: an outfit naming its pieces waits for it and is worn when it comes (`set_outfit` answers true).
- **`wear(id)`**, **`take_off(place_or_id)`**, **`undress()`**, **`set_outfit(outfit)`**, **`outfit`** (`OutfitData`, a piece id per place: save it as it is), **`worn_pieces`**. `wear` answers false, and nothing changes, for a piece none of the wardrobes has or one that doesn't fit; `fit_problems(id)` says why (`no anchor "back"`, `is made for the skeleton "quadruped", not "biped-side"`). `set_outfit` leaves such pieces out and answers false.
- **`events`**: an `OutfitEvent` per change (`outfit`, `put_on`, `taken_off`), one for a whole `set_outfit`: a line on the stage ("Strohhut an"), a sound, an autosave.
- **`anchor_world(name, x?, y?, { scale, flip_x }?)`**: where an anchor is now, with its angle (`{ x, y, rotation }`), in the puppet's own space or, given where and how `draw()` draws it, in the context's (mirrored with `flip_x`, the angle too). For a game that spawns a spark at the sword's tip or a ball at the hand. After `update()`.
- **`bounds(of?)`**: the box around the parts as drawn now, of everything, the `"body"`, the `"clothes"` or one worn piece (its id). **`draw(..., { only_clothes: true })`** leaves the skin out: a piece on a hanger, framed with `bounds(id)`, as Kleiderschrank's drawers show them.
- **`wardrobe.problems_on(rig, id)`**, **`pieces_in(place)`**, **`piece(id)`**, `places`, `pieces`: for a game's drawers and its tests. `Wardrobe.from_data()` throws with a clear message on data that doesn't hold together (a piece in an unknown place, a part on both a bone and an anchor, two orders for one part); whether a piece fits a rig is a separate question, asked when it is worn.

The skin changes under the clothes: `set_skin(other_rig)` keeps the outfit, and the same parts sit on the same bones. A rig made for a later step may give its bones other shapes; clothes made for the skeleton still follow the bones.

### Body shape and skin

A puppet can be made taller, broader, rounder or thinner, its skin and hair coloured, and marks laid onto its skin: tattoos, scars, freckles, paint. All of it is plain data on the puppet (a **character**), and all of it moves with the bones through every clip, the clothes included (since step 40, Maskenbildner).

```ts
const hero = this.load_puppet("model");             // a rig with shapes and tint layers
hero.use_marks(this.load_marks("marks"));           // a mark sheet from the catalogue
hero.set_shape({ belly: 0.6, height: 0.3 });         // each kept within its min and max
hero.set_tint("skin", "#c29062");                    // the colour times the skin's shading
hero.add_mark("anchor", "upper_arm_r", { x: 26, y: -1, size: 1.2 });
save(hero.character);                                // { skin, shape, tints, marks, outfit }
other.set_character(loaded);                         // the same character on another puppet
```

**Shape values** are named in the rig (`shapes`), each a number from `min` (default -1) to `max` (default 1), 0 being the rig as drawn:

```json
"shapes": {
    "height": { "title": "Größe", "bones": { "torso": [0.12, 0], "thigh_r": [0.12, 0], "head": [0.05, 0.05] } },
    "shoulders": { "title": "Schultern", "bones": { "torso": [0, 0.2], "hip": [0, 0.12] } },
    "belly": {
        "title": "Bauch", "min": -0.4,
        "pushes": [{ "bone": "torso", "along": [-35, 5, 45, 75], "across": [4, 26], "push": [0, 22] }]
    },
    "arms": { "title": "Arme", "min": -0.7, "pushes": [{ "bone": "upper_arm_r", "along": [-30, 5, 42.5, 77.5], "swell": 0.42 }] }
},
"soles": ["heel_l", "toe_l", "heel_r", "toe_r"]
```

- **`bones`**: per bone `[length, width]`, the scale added per unit of the value: at `height: 1` the torso is 1.12 times as long. A longer bone carries its children further out, and its parts stretch with it; clothes on it stretch alike. Pieces on an **anchor** (a hat, a sword) move with the scale but keep their size. Values add up, and a scale never goes below 0.05.
- **`soles`**: the anchors that stand on the ground. With longer or shorter legs the whole puppet is lifted or lowered so its lowest sole is where it was at shape 0: the feet stay on the floor through every clip (`skeleton.lift` says by how much).
- **`pushes`**: where a plain scale looks wrong (a belly is not a longer torso), the parts on a bone are drawn as a **mesh**: a grid of points over the part (`puppet.mesh_cell`, default 16 pixels) whose points move. A point at `(x, y)` in the bone's frame (x along the bone from its joint, y across; for a bone that points up, +y is forward) moves at value 1 by `weight * [push[0], push[1] + swell * y]`. The weight is `along`'s trapezoid `[a, b, c, d]` (nothing before `a` and after `d`, full from `b` to `c`, smooth in between) times `across`'s ramp `[from, to]` (nothing at `from`, full at `to`). `swell` makes a limb fatter or thinner by its distance from the bone line. Points with no weight never move, so a mesh is cut only where it bends; give two bones that meet the same weight at their joint and the joint never opens.

`set_shape(values)` changes the named values (the rest stay), `reset_shape()` sets all back to 0, `shape` gives every value of the rig. `PartMesh.for_part()`, `moves_for()`, `deform()` and `draw()` are there for a game's own meshes.

**Tint layers.** A skin's part may carry grey **layers**, rectangles of the atlas the size of the part, rendered from the part's skin or hair alone: `"head": { "rect": [4, 4, 146, 163], ..., "layers": { "skin": [304, 4, 146, 163], "hair": [154, 4, 146, 163] } }`. `set_tint("skin", "#c29062")` multiplies the colour into the layer's grey and lays it over the part, so the shading and the outline stay; `set_tint("skin", null)` takes it off. `tints` gives them as data.

**Marks** come from a **mark sheet**, an atlas of small pictures whose catalogue `rig` holds `marks` and no bones (dll-tce-assets 0.7.0, `rendered/puppet/marks`):

```json
{
    "resolution": 2,
    "marks": {
        "dragon": { "rect": [4, 63, 90, 34], "pivot": [38, 20], "title": "Drache", "kind": "tattoo" },
        "scar": { "rect": [4, 101, 54, 20], "pivot": [27, 10], "title": "Narbe", "kind": "scar", "blend": "normal", "opacity": 0.85 }
    }
}
```

`blend` is `"multiply"` (the default: ink in the skin) or `"normal"` (laid on: a plaster, paint), `on` names the layer it is clipped to (default `"skin"`; a part without that layer clips to its own outline). `MarkSheet.from_data(data, image)`, `sheet.mark(id)` (a `MarkPicture`), `puppet.use_marks(sheet)` (several sheets; one still loading is fine).

- **`add_mark(id, slot, { x, y, angle, size, tint, blend, opacity, flip })`** puts a mark on a slot's part, at `x`, `y` in its bone's frame (rig units, as for anchors), turned by `angle` degrees on the bone (default: upright on the screen at rest), `size` times as large, an ink `tint`. It answers its number, or -1 for a slot or a mark the puppet doesn't have. The mark is clipped to the part (its skin layer), so nothing reaches past the outline; it moves, turns, stretches and bends with the part.
- **`move_mark(index, placement, slot?)`**, **`remove_mark(index)`**, **`clear_marks()`**, **`marks`** (plain data, in the order laid on), **`set_marks(marks)`**, **`find_mark(id)`**.
- For a game that drags marks on: **`slot_at(x, y)`** (the part under a point of `to_local()`), **`to_part(slot, x, y)`** (that point in the part's bone frame, through the mesh: where a mark dropped there goes), **`mark_at(x, y, within)`** (the mark under a point, to pick one up), **`mark_point(index, x, y, options)`** (where it is now), **`upright_angle(slot)`** (the angle that shows a mark upright in the pose now).

**A character** is `CharacterData`: `{ skin, shape, tints, marks, outfit }`, all plain. `puppet.character` gives it, `set_character(data)` becomes it (what is left out goes back to plain) and answers false when something didn't fit (an unknown shape, slot, mark or piece), taking the rest. It goes through `SaveSlots` as it is, and Maskenbildner exports it as a file another game reads.

**Drawing.** A part whose shape, tints or marks are not plain gets its **look** laid into a canvas once per change: the part, its tint layers, its marks clipped to it, the whole moved through its mesh. The looks of a puppet are packed side by side into one canvas, so drawing it stays one `setTransform` and one `drawImage` per part, from one picture, as at shape 0, and nothing is laid again until something changes. `puppet.make_canvas` makes the canvases (a page's canvas or an `OffscreenCanvas`; the ones a look is laid in are kept in memory, `willReadFrequently`, and only the packed one goes to the graphics card). Without a canvas (Node) meshes are drawn triangle by triangle, each through its own clip and transform, and tints and marks stay off; `draw(..., { direct_meshes: true })` forces that, for measuring.

### In the game shell

A picture of `settings.catalogue_images` whose catalogue entry has a `rig` brings its puppet along: the host's `load_catalogue_url()` answers with `rig` in the `CatalogueFile`, and the shell puts it into `references.puppet(name)`. `logic.load_puppet(name, clip?)` is then a puppet in one line:

```ts
class TheatreSettings extends CanvasGameSettings {
    public override readonly catalogue_images = {
        wanderer: "rendered/puppet/wanderer",
        gardener: "rendered/puppet/gardener",
    };
}

// in the logic:
protected create_game(): Game {
    const hero = this.load_puppet("wanderer");
    hero.set_skin(this.references.puppet("gardener"));   // optional: the other's parts
    return new Game({ hero });
}
```

A picture whose `rig` is a wardrobe (it has `pieces` and no `bones`) goes to `references.wardrobe(name)` instead, and `logic.load_wardrobe(name)` hands it out:

```ts
const hero = this.load_puppet("wanderer");
hero.use_wardrobe(this.load_wardrobe("clothes"));     // catalogue_images: { clothes: "rendered/puppet/clothes" }
hero.set_outfit(saved_outfit);                        // worn when the wardrobe has come
```

A picture whose `rig` is a mark sheet (it has `marks`, no `bones` and no `pieces`) goes to `references.mark_sheet(name)`, and `logic.load_marks(name)` hands it out:

```ts
const hero = this.load_puppet("model");                // catalogue_images: { model: "rendered/puppet/model", marks: "rendered/puppet/marks" }
hero.use_marks(this.load_marks("marks"));
hero.set_character(saved_character);                  // its marks are laid on when the sheet has come
```

The puppet exists at once and waits while the data is on its way: it draws nothing and plays nothing; it starts the clip it was told (or the rig's default clip) as soon as the rig has it, and draws once the picture has come. `references.puppet(name).set_data(data)` also takes a game's own rig for a picture of `settings.images`. `@tce-v3/game-boot` fills the hook from `dll-tce-assets` (0.5.0 and later: `rendered/puppet/wanderer` and `rendered/puppet/gardener`; 0.6.0 and later also the wardrobes `rendered/puppet/clothes` and `rendered/puppet/accessories`; 0.7.0 and later the model `rendered/puppet/model` with shapes and tint layers and the mark sheet `rendered/puppet/marks`).

### Picking a bone

For an editor or a game where a player grabs a limb:

```ts
const local = hero.to_local(pointer_x, pointer_y, hero_x, floor_y, { scale: 0.6, flip_x });
const bone = hero.pick_bone(local.x, local.y, 12);    // -1 for none
```

- **`to_local(px, py, x, y, options)`** turns a point of the context (where `draw()` drew the puppet with these options) into the puppet's own space.
- **`pick_bone(x, y, within)`**: of the parts under the point, the one whose bone line passes nearest. Where bone lines lie on each other (an arm hanging over the torso) the part drawn on top wins; where a forearm's rounded end reaches over the elbow, the upper arm's line is nearer. Off the parts, the bone line nearest within `within`.
- **`slot_at(x, y)`**: the slot whose part is drawn on top at the point (rectangles, not pixels); `rig.slots[slot].bone` is its bone.
- **`skeleton.nearest_bone(x, y, within)`** and **`distance_to_bone(index, x, y)`** go by the bone lines alone.

To turn a picked bone towards the pointer, set its pose so its world angle points there: `skeleton.rotation[bone] += target_angle - skeleton.world_rotation(bone)` (in degrees, the short way round), then `skeleton.update()`. Step 38's `ClipEditor` holds the clip still (`paused`, `seek`), lets a bone be dragged, and "Key setzen" writes every changed bone as a key into its own clip with `rig.add_clip()`, which plays back at once.

### Without a picture

The rig, the skeleton and the clips need no picture: `PuppetRig.from_data(data)` without an image plays its clips and poses its skeleton, so tests check poses, feet on the ground (`skeleton.world_point` of the sole anchors) and events in Node. `draw()` answers false until a picture comes; `debug: true` draws the bones even then.

### What it costs

Measured in Spielwerk step 38 (Intel i7-11700F; the wanderer, 16 bones and 15 parts, running, drawn at 0.3 so about 120 pixels tall):

| | Node 22 | Chromium, software canvas (headless) | Chrome on an RTX 4070 (window, ANGLE OpenGL) |
| --- | --- | --- | --- |
| Update 1 / 100 / 1 000 puppets | 0.003 / 0.10 / 0.57 ms | 0.001 / 0.12 / 1.2 ms | 0.002 / 0.12 / 1.2 ms |
| Draw 1 / 100 puppets (the script's time) | 0.003 / 0.017 ms (no canvas) | 0.013 / 1.4 ms | 0.013 / 1.4 ms |
| Most running puppets at 57 FPS or more, 960 × 640 | | 120 | 400 |

Dressed (step 39, Node 22, the same machine): 1 000 running puppets, half of them in an outfit of six pieces (35 parts instead of 15), update in 0.63 ms and lay out their draw calls in 0.25 ms; changing an outfit, with its one sort of the drawing order and the first draw, takes about 18 µs. The clothes cost what their parts cost to draw, and nothing per frame besides.

Shaped (step 40, the same machine; the model, 16 bones and 15 parts, running, drawn at 0.4 on 960 × 640; "shaped" is every shape value at its end, skin and hair tinted and three marks, "meshes" the same shapes with `direct_meshes`):

| | Node 22 (calls only) | Chromium, software canvas (headless) | Chrome on an RTX 4070 |
| --- | --- | --- | --- |
| Most at 57 FPS or more: plain / shaped / meshes | | 90 / 50 / under 5 | 400 / 85 / 5 |
| Draw 100, the script's time: plain / shaped / meshes | | 1.5 / 18 / 404 ms | 1.5 / 2.1 / 249 ms |
| One shaped puppet drawn triangle by triangle | 389 `drawImage` instead of 15, 47 µs | 0.74 ms | 0.76 ms |
| A slider step: the looks laid again and the first draw | 46 µs (meshes only) | 1.4 ms | 1.4 ms |

So a mesh drawn triangle by triangle every frame is affordable for one character and nothing more; laid into a canvas once per change it costs one `drawImage` per part again. Before the looks were packed into one canvas per puppet (and with the work canvases on the graphics card too), the GPU managed 50 shaped puppets and spent 24 ms of script on 100.

Updating is never the limit: a thousand puppets pose in about a millisecond. Drawing is the bill, one `setTransform` and one `drawImage` per part (about 1 µs of script per part, and the pixels after it): a few dozen puppets on any machine, a few hundred on a graphics card. For crowds of thousands, a sprite sheet rendered from the puppet ([animation.md](#crowds)) is the cheaper way.

## Particles

Sparks, smoke, dust and trails, as many as the frame allows: a game emits effects (plain data) and, once a frame, updates and draws them onto its 2D context. They run on the graphics card (WebGL 2) where the browser can, else on the CPU; the game never sees WebGL. Since 6.1.0 (`canvas/particles`), first used by Spielwerk step 33, Feuerwerk.

- **`Particles`**: the one class a game uses: `emit`, `update`, `draw`, `clear`, `use_backend`, and what it says (`backend`, `fallback_reason`, `count`, `capacity`, `time`).
- **`ParticleEffect`**: one kind of particles as plain data; **`PARTICLE_EFFECTS`** has five ready-made ones.
- Below them, for tests and the curious: `ParticleStore` (the births and the clock), `CpuParticles` and `GpuParticles` (the two backends), `ParticleRaster` (the CPU's pixels).

### Four lines

```ts
const particles = new Particles();                     // GPU where it can, else CPU
particles.emit(PARTICLE_EFFECTS.burst, x, y);          // when something happens

// every frame:
particles.update(delta_seconds);
particles.draw(context);                               // under the context's transform
```

`draw(context)` paints in the context's own units, under its transform: a game that scales its world onto the canvas emits and draws in world units. Only `context.canvas`'s size matters (the GPU draws into a canvas that big).

### Effects as plain data

```ts
interface ParticleEffect {
    count: number;                       // particles one emit() makes
    speed: [number, number];             // [min, max] units per second
    angle: number;                       // radians: 0 right, -Math.PI / 2 up
    spread: number;                      // fan around angle: 2 * Math.PI all round, 0 a beam
    radius: number;                      // start up to this far from the point
    lifetime: [number, number];          // [min, max] seconds, both above 0
    gravity: number;                     // units per second², down; below 0 it rises
    speed_half_life: number;             // seconds until drag halves the speed; Infinity: none
    color: [string, string];             // [birth, death] "#rrggbb"
    alpha: [number, number];             // [birth, death] 0 to 1
    size: [number, number];              // [birth, death] diameter in units
    blend: "normal" | "glow";            // paint over, or add light
}
```

- **Pairs.** `speed` and `lifetime` are `[min, max]`, picked evenly per particle; `color`, `alpha` and `size` are `[birth, death]`, blended over each particle's life.
- **Drag as a half-life.** `speed_half_life: 0.5` halves the speed every half second. Under gravity a particle settles at a fall speed of `gravity * speed_half_life / Math.LN2`: a burst with `gravity: 60` and `0.5` sinks at 43 units a second at most.
- **Ready-made:** `burst` (a firework's star, 180 sparks), `fountain`, `smoke` and `trail` (each a few particles, to emit every frame from a point that stays or moves), `sparks` (a grinder's fan). Sized for a game about 960 by 640 units. Change one with a spread: `{ ...PARTICLE_EFFECTS.burst, count: 400, color: ["#c8f0ff", "#2050ff"] }`.
- **One emit's changes** (`EmitOptions`): `count`, `angle`, `color` (the birth colour; the death colour stays the effect's), and `vx`, `vy` added to every particle (a trail that keeps some of its rocket's speed).
- **Refused** with an error: a lifetime not above 0, a half-life not above 0, a count that isn't a whole number ≥ 0, a colour that isn't `#rrggbb`.

### Normal and glow

`"normal"` paints over what is below, as `source-over` does: smoke and dust darken or hide. `"glow"` adds light, as `"lighter"` does: sparks over sparks turn white, and they don't darken a dark sky. All normal particles are painted first, then all glowing ones, whatever the order they were emitted in.

### The backends

- **`backend` option**: `"auto"` (default) takes the GPU where the browser has WebGL 2 with float render targets (`EXT_color_buffer_float`), else the CPU. A forced `"gpu"` still falls back where it can't run.
- **`fallback_reason`**: why the GPU isn't used, or `null`: "WebGL 2 is missing", "float render targets are missing (EXT_color_buffer_float)", "no canvas to draw on here", "the GPU set-up failed: …", "the WebGL context was lost". A game shows it to the player; the CPU never has a reason.
- **`use_backend(choice)`** changes while it runs and answers the backend it got. The living particles go along, where they are: both backends work from the same births (below).
- **A lost WebGL context** (a driver reset, too many contexts in the page) is noticed at the next `update()`: the particles go on on the CPU, `fallback_reason` says so. `use_backend("gpu")` then makes a new context.
- **The GPU backend is kept** while the CPU runs, so changing back costs no new context: browsers keep only a few alive, and losing one on purpose is a console warning.
- **`destroy()`** frees the GPU's textures and its context. A game that keeps one `Particles` for its life (the shell's properties) destroys it when the element stops.

### Exact motion, no read back

Each particle is stored once, at its birth: place, velocity, birth time, lifetime, drag, gravity, colours, sizes, opacities. Where it is at any time follows in closed form (constant gravity, drag k = ln 2 / half-life): moved = (1 − e^(−k t)) / k, so one long step lands exactly where many short ones do. Both backends step the same formula, the GPU in a fragment shader over two float textures that take turns, the CPU over a `Float32Array`; nothing is read back from the graphics card, ever. `count` comes from the births and the lifetimes alone.

- **`capacity`** (default 131 072, rounded up to whole rows of 1 024, at most 2 097 152): the most alive at once. When all are taken, the oldest makes room. The births take 64 bytes a particle; the CPU adds 20 for the motion, the GPU 80 bytes of graphics memory.
- **`random`** (an option and a field): where spread, speeds and lifetimes come from, default `Math.random`. A seeded one replays a show; a game swaps it for a new round on the same particles.
- **`time`**: the particles' own clock, the sum of `update()`s.
- **`snapshot()`**: every living particle's place, colour, opacity, size and blend, worked out on the CPU from the births, on either backend: for tests.

### How the CPU paints

The CPU path is real, not a stand-in: it runs every unit test and is what a browser without WebGL 2 shows. It splats each particle into a float buffer (`ParticleRaster`, premultiplied colour) exactly as the GPU rasterises its point sprites, one buffer for normal and one for glow, and puts each onto the 2D context with one `putImageData` (onto an `OffscreenCanvas`) and one `drawImage`. Dots smaller than 2 pixels are one solid pixel at (size / 2)² of the opacity on both backends, so they don't vanish between pixel centres. A test passes `make_canvas: () => null`: the CPU then paints squares with `fillRect`, which a fake context can count.

Why not one `drawImage` per particle: a 2D context spends about 2.5 µs on each, so 60 FPS ends near 5 000 particles. The raster holds 20 000 at 60 FPS and 50 000 at about 53 (the table below).

### How many, at 60 FPS

Measured for Spielwerk step 33 on a 960 by 640 canvas, glowing bursts of 2 seconds' life, nothing else drawn ("alone"), and in the game Feuerwerk with its sky, town and counters ("in the game": the most alive while the frame budget saw 58 FPS or more). Headless Chromium uses SwiftShader, software GL on the CPU; headless Chrome with `--enable-gpu --ignore-gpu-blocklist --use-angle=vulkan --enable-features=Vulkan` runs on the graphics card (an RTX 4070).

| | CPU, alone | CPU, in the game | GPU, alone | GPU, in the game |
|---|---|---|---|---|
| Headless Chromium, SwiftShader (software) | 20 000 (52 FPS at 50 000) | 33 000 | 100 000 (45 FPS at 150 000) | 29 000 |
| Headless Chrome, RTX 4070 (ANGLE, Vulkan) | 20 000 (54 FPS at 50 000) | 33 000 | 2 000 000 (the most it stores; JS ~9 ms a frame) | 262 000 |

In the game the births come in lumps (a star at ×200 is 36 000 particles in one frame) and the dots are bigger than in the probe, so the GPU's record lies below its probe's. In software GL the GPU path is no faster than the CPU's: copying the WebGL canvas onto a software 2D canvas costs as much as the work saved.

### Lessons from the GPU

- **Samplers are `lowp` by default in GLSL ES.** Under ANGLE on NVIDIA (Vulkan) a `lowp sampler2D` reads a float texture at half precision: positions jitter and packed colours turn white or black. The shaders declare `precision highp sampler2D`.
- **Colours are packed** as one float 0xrrggbb (exact in a float32) and unpacked with `floor` and `mod` in floats: `int(packed + 0.5)` overflowed for `#ffffff` on one driver.
- **Headless Chrome on a graphics card loses the first WebGL context of a fresh page** about 2 ms after making it. The fallback catches it; `use_backend("gpu")` gets a working one.
- **Shaders are plain string modules** (`shaders.ts`): the toolbox ships TypeScript source, so there is no bundler step to import `.glsl` files.
- **Headless Chromium logs "GPU stall due to ReadPixels"** when a WebGL canvas is drawn onto its software 2D canvas. The particles never read back themselves; a browser check may filter that line.

---

## Noise

Hills, coasts, clouds and marble for generated maps: smooth noise, seeded, the same on every machine. A noise is a function `(x, y) => number`; a recipe is plain data that says which noise, how big and how many layers. Since 6.2.0 (`random/noise`), first used by Spielwerk step 34, Inselkarte.

- **`simplex_noise_2d(seed)`** and **`value_noise_2d(seed)`** (or `noise_2d(seed, kind)`): the two base noises, -1..1, one lattice step per unit.
- **`NoiseRecipe`** and **`make_noise(recipe, seed)`**: a recipe as plain data turned into the same kind of function, with sizes in world units. **`NOISE_RECIPES`** has five ready-made ones.
- **`fill_grid(grid, noise, options)`** samples into any `Grid2D<number>` (and so a `TileMap` layer); **`normalize_grid(grid, range)`** stretches the values to the full range.

### Three lines

```ts
const heights = new Grid2D<number>(320, 240, 0);
fill_grid(heights, make_noise(NOISE_RECIPES.hills, seed), { cell_size: 1.5 });
normalize_grid(heights);   // lowest 0, highest 1
```

### Recipes as plain data

```ts
interface NoiseRecipe {
    kind?: "simplex" | "value";       // default "simplex"
    scale?: number;                   // how wide one hill is, in world units; default 100
    octaves?: number;                 // layers of finer detail, 1 to 12; default 1
    persistence?: number;             // each octave this share as strong as the one before; default 0.5
    lacunarity?: number;              // each octave's hills this many times narrower; default 2
    ridged?: boolean;                 // each octave folded to 1 - 2|n|: sharp crests (ridges)
    warp?: { amount, scale } | null;  // push every sample up to `amount` units by a second noise `scale` wide
    offset?: { x, y };                // move the window over the noise, in world units
    falloff?: { x, y, radius } | null;// sink to the bottom towards `radius` from (x, y): an island
    range?: "signed" | "unit";        // -1..1 (default) or 0..1
}
```

Every field has a default, so `make_noise({}, seed)` is simplex noise with hills 100 units across. Spread a ready-made recipe and change what differs: `{ ...NOISE_RECIPES.hills, scale: 60 }`. A recipe the noise can't make (a scale of 0, 40 octaves, a lacunarity under 1) throws.

**Sizes one can picture.** `scale` is not a frequency: it is how wide one hill of the first octave is, measured as the mean length of a run above zero along a straight line (simplex: 0.6955 lattice steps at frequency 1, value noise: 2.125; `NOISE_HILL_WIDTH`). A test checks that `scale: 40` and `scale: 120` give hills within 15 % of that, for both kinds. `warp.amount`, `offset` and `falloff` are world units too.

What happens to one sample, in order: `offset`, `warp` (two simplex noises push x and y), the octaves (each `ridged` when asked), their sum divided by the sum of their strengths (so it stays in -1..1), `falloff` around the unmoved position, then `range`. The warp's seeds are drawn before the octaves', so more or fewer octaves never change the warp, and the first octave stays where it was: more octaves only add detail.

| Name | What | The recipe |
| --- | --- | --- |
| `hills` | rolling hills 120 across | simplex, 4 octaves |
| `mountains` | ridged ranges 240 apart | simplex, 5 octaves, `ridged` |
| `islands` | one island in a 512 by 512 map | simplex 160, 5 octaves, `falloff` (256, 256) radius 256 |
| `clouds` | soft, many-layered | simplex 200, 6 octaves, persistence 0.6 |
| `marble` | swirling veins | simplex 80, 3 octaves, `warp` 60 by 160 |

All five answer 0..1 (`range: "unit"`), like a height map.

### The same everywhere

The permutation of each noise is `SeededRandom(seed)` shuffling 0..255; the octaves' offsets and the warp's seeds come from the same stream. The arithmetic is `+ - * /`, `Math.floor` and `Math.sqrt` only (all exact in IEEE 754, so every browser computes the same bits): no `Math.random`, no `Math.sin`, `Math.pow` or `Math.hypot`, whose last bits may differ between engines. The twelve simplex gradients are written as numbers. A test pins values exactly (`toEqual`, not `toBeCloseTo`).

Simplex noise is Ken Perlin's (2001) in Stefan Gustavson's form, scaled by 101.65 so its peak (0.0098371 raw, found by climbing from a dense sampling) lands at 0.99994; it is clamped as well. Value noise blends a random height on every whole-numbered point with a quintic curve, so neither the slope nor the bend jumps at a lattice line (a test compares the slope just left and right of one). Coordinates should stay below about a billion.

### Grids

```ts
fill_grid(grid, noise, { x0?, y0?, cell_size? }): Grid2D<number>
normalize_grid(grid, range = "unit"): Grid2D<number>
```

`fill_grid` gives cell (x, y) the noise at its middle, `(x0 + (x + 0.5) * cell_size, y0 + (y + 0.5) * cell_size)`. A chunk of a larger map passes its place in the world as `x0` / `y0`, and its edges meet the next chunk's. `normalize_grid` maps the lowest value to the bottom of the range and the highest to the top, keeping the order; a flat grid becomes the middle.

### How long a fill takes

The best of seven fills in Node and five in Chromium, after one to warm up, on an Intel i7-11700F (Spielwerk step 34, `measure_fills()` in its `src/game/Measure.ts`):

| Recipe | 256 × 256, Node 22 | 512 × 512, Node 22 | 512 × 512, Chromium (Playwright, headless) |
| --- | --- | --- | --- |
| `hills` (4 octaves) | 8.0 ms | 30 ms | 35 ms |
| `marble` (3 + warp) | 9.1 ms | 37 ms | 40 ms |
| `islands` (5) | 10.4 ms | 43 ms | 46 ms |
| `mountains` (5, ridged) | 11.0 ms | 46 ms | 49 ms |
| `clouds` (6) | 12.2 ms | 51 ms | 57 ms |

One simplex sample costs about 20 ns, about what the fastest JavaScript simplex libraries reach, and the time grows with octaves × cells. So 256 × 256 cells of `hills` fit into a frame at 60 FPS (a test checks it), 512 × 512 take about two frames. A map that is filled once at the start doesn't mind; a game that refills while a slider moves keeps the grid near 300 × 200 (Inselkarte: 320 × 240 cells with a warp, 17 ms at 5 octaves, about 31 ms at 7), fills only the part that changed, or spreads a large fill over frames in chunks (`x0`, `y0`).

---

## Saves

A game's progress in named slots, versioned, in any store of text files. A game says what it saves (plain JSON data), which version that is, and how an older version becomes the next; `SaveSlots` does the rest: reading, migrating, checking, writing in order, autosaving, and keeping a broken file aside instead of overwriting it. Since 6.2.0 (`storage/saves`), first used by Spielwerk step 35, Spielstand.

- **`SaveSlots<T>`**: load, save, remove, list, export and import slots; `autosave()` on a timer and when the page hides.
- **`SaveStore`**: where the files lie, four async functions of text. `memory_store()`, `local_storage_store(prefix)` and `default_save_store(prefix)` come with the toolbox; a host brings its own (a TCE desktop's file system).
- **In the game shell**: `settings.save_version`, `save_tag`, `save_slots`, `autosave_seconds`; `properties.save_slots(options)`; the element's hook `open_save_store(tag)`; and `SaveSlotsPage`, the slot list as a ready-made menu.

### Three lines

```ts
const saves = new SaveSlots<Garden>({ version: 2, fresh: new_garden, migrations: { 1: (old) => ({ ...old, bees: 2 }) } });
const garden = await saves.load("slot-1");    // always playable
saves.autosave("slot-1", () => garden);       // every 10 s and when the page hides
```

### Options

```ts
interface SaveSlotsOptions<T> {
    version: number;                    // the version the game saves now, a whole number from 1
    fresh: () => T;                     // a new game's data
    migrations?: SaveMigrations;        // { 1: v1 => v2, 2: v2 => v3, ... }
    validate?: (data: unknown) => T;    // checks loaded data; a throw makes the save broken
    summary?: (data: T) => string;      // the slot list's line: "Tag 12 · 34 Kräuter"
    store?: SaveStore | Promise<SaveStore>;  // default: local storage under "<name>/", else memory
    page?: PageHideSource | null;       // default: the browser's page (visibilitychange, pagehide)
    now?: () => number;                 // default Date.now; a test passes its own clock
    name?: string;                      // who speaks in the console
}
```

**Migrations** go one version at a time: `migrations[n]` turns plain data of version n into version n + 1. A save of version 1 in a game of version 4 runs 1, 2 and 3 in turn. A gap below the current version throws in the constructor, so a test finds it before a player does. A migration may throw; the save then counts as broken.

**`validate`** runs on every loaded or migrated save and returns the data typed. Whatever it throws makes the save broken, so a hand-edited file with a herb that doesn't exist never reaches the game.

### Loading never fails

`load(slot)` answers with the data; `load_save(slot)` with the data and how it went:

| `outcome` | What happened | `data` |
| --- | --- | --- |
| `empty` | nothing saved in the slot | `fresh()` |
| `loaded` | a save of the current version | the save |
| `migrated` | an older version, brought up to date | the save, migrated |
| `broken` | not JSON, not a save, a migration or `validate` threw | `fresh()`; the file kept aside |
| `newer` | a newer version of the game wrote it | `fresh()`; the file kept aside |
| `unreachable` | the store failed | `fresh()` |

`LoadedSave<T>` also has `header` (the file's `SaveHeader`, null without one), `from_version` and `reason` (what went wrong, in English). A file that can't be played is renamed before the load resolves: `slot-1.broken-20261118-201503` (or `.newer-`), with `-2` on a clash. If even that fails, the slot is guarded: saves into it are refused, so the only copy is never written over.

No method rejects, except for a slot name that isn't one (`/^[A-Za-z0-9_-]{1,64}$/`, a bug). Problems go to `events` and, once per kind, to the console; the game plays on.

### Saving

- **`save(slot, data, info?)`** resolves `true` once written, `false` when the store refused. The data is turned into text right away (later changes to the object don't count). Saves run one at a time in the order asked; a save that waits for its turn is replaced by a newer one of the same slot, so the last one wins and a slow store never writes stale data after fresh.
- **`info.seconds_played`**: default, the loaded save's seconds plus the time since it was loaded (or last saved). **`info.summary`**: default `options.summary(data)`.
- **`remove(slot)`** forgets the slot; files kept aside stay.
- **`list()`**: every slot with a file, headers only, newest first; unplayable files last with their `problem` (`"broken"` or `"newer"`). Files kept aside are not slots.
- **`flush()`** resolves when everything asked for so far is written.

### Autosave

```ts
const stop = saves.autosave("slot-1", () => (playing ? game.data : null), 10);
```

Saves `get_data()` every `seconds` and whenever the page hides (a tab switched, a phone locked, the page left); a `null` skips that one. One autosave at a time: a new one replaces the last. `autosave_now()` saves at once, `stop_autosave()` ends it, `pause_autosave()` saves once more and holds it, `resume_autosave()` goes on; `autosave_slot` says which slot it writes. The game shell pauses it in `logic.stop()` (the element left the page) and resumes it in `start()`.

### The file

A save is readable JSON, so a player can look into it and a developer can fix one by hand:

```json
{
  "format": "ts-game-toolbox/save",
  "version": 2,
  "saved_at": "2026-11-18T20:56:50.046Z",
  "seconds_played": 1260,
  "summary": "Tag 14 · 48 Kräuter",
  "data": { ... }
}
```

`saved_at` is an ISO date in the file (and milliseconds since 1970 in a `SaveHeader`); `seconds_played` is rounded to a thousandth. `export(slot)` gives that text for a download (null for an empty slot). `import(text, slot)` reads one, migrates and checks it, and saves it into the slot; a text that isn't a playable save writes nothing, and the answer's `outcome` says which it was. `decode(text)` and `encode(slot, data)` do the same without a store.

### Stores

```ts
interface SaveStore {
    readonly label: string;               // where the saves lie, for a player: "Browser", "/saves/tce-garden/"
    read(name: string): Promise<string | null>;
    write(name: string, text: string): Promise<void>;
    remove(name: string): Promise<void>;
    list(): Promise<string[]>;
}
```

Names are slot names and the names of files kept aside; a store may add an extension (`.json`). Every function may reject; `SaveSlots` catches it.

- **`memory_store(files?, label?)`**: a `Map` in `files`, for tests and where nothing else works.
- **`local_storage_store(prefix, storage?)`**: the browser's local storage, every name under `prefix` (`"tce-garden/"`), so games on one site don't meet. A full storage rejects the write.
- **`default_save_store(prefix, scope?)`**: local storage where the page may use it, else memory (a sandboxed frame, a browser that refuses it).

`saves.use_store(store)` switches stores (a promise is fine: everything waits for it); `where()` resolves the store's `label`.

### Events

`saves.events` is an `EventSocket<SaveEvent>`. `kind` is `fresh`, `loaded`, `migrated`, `saved`, `removed`, `imported`, `kept` (a file was kept aside under `name`), or a problem: `broken`, `newer`, `failed` (the store refused something); `is_problem` says which. `slot`, `reason` and `error` tell more.

```ts
saves.events.attach((event) => {
    if (event.kind === "saved") {
        show_saved_mark();
    }
});
```

### In the game shell

```ts
class MySettings extends CanvasGameSettings {
    public override save_version = 2;
    public override save_tag = "tce-garden";   // default: the element's tag name
    public override autosave_seconds = 5;      // default 10
}

class MyProperties extends CanvasGameProperties<Game, MySettings> {
    public override readonly saves = this.save_slots<Garden>({ fresh: new_garden, migrations, validate, summary });
}
```

`properties.save_slots(options)` builds `SaveSlots` with `settings.save_version` (the options may name another) and the name `save_tag ?? title`. When the element first connects, before the game starts, it asks its hook **`open_save_store(tag)`** for a store and hands it to `properties.saves`; the default is `default_save_store("<tag>/")`. `@tce-v3/game-boot`'s `GameElement` fills the hook from `dll-tce-file-system` (`/saves/<tag>/<slot>.json`) and falls back to local storage. A game without `saves` is untouched.

The game still says when to autosave: `properties.saves.autosave(slot, () => data, settings.autosave_seconds)` once a slot is open.

### SaveSlotsPage

```ts
const page = this.place(new SaveSlotsPage(this.saves, UNPLACED, { slots: settings.save_slots }), (layout) => layout.slots);
page.on_choose = (choice) => { ... };   // { action: "continue" | "new" | "remove", slot }
```

The slot list as a `MenuView`: a row per slot (`Platz 1  Tag 12 · 34 Kräuter · vor 3 Min.`), keys 1 to 3, arrows, Enter, Escape and a gamepad through `properties.place()`, and the house look. A press on a filled slot continues it, on an empty or unplayable one starts a new game there. "Löschen …" (key L) opens the filled slots, each with a confirm ("Ja, Platz 1 löschen" / "Nein, behalten"); the page deletes the slot itself, then `on_choose` hears of it.

It reads the slots when it first shows, with the cursor on the slot played last, and again after every save, removal, import or file kept aside, so a game never tells it to refresh (`refresh()` is there for a store changed from outside). `headers` has what it read. Show it with `page.input.is_enabled = true`, take it away with `false`. The texts are German (`SAVE_SLOTS_PAGE_TEXTS`); `options.texts` replaces any of them, and `ago_text(seconds)` is the "vor 3 Min." it uses.

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
- **Sprite animation** (`canvas/animation`): `SpriteSheet`, `AnimationClip`, `AnimationPlayer`; see "Animation" above.
- **`SpriteBatch`**: many sprites drawn quickly. `add(image, x, y, angle, width, height)` for each (the middle of the sprite, radians clockwise, 0 faces right), then `draw(context)` once a frame. It draws image by image, with one `setTransform` per sprite on top of the context's transform and no `save()` / `restore()`, and leaves the transform as it was. All sprites of the first image added lie under those of the next: draw what must be on top in a batch of its own. The batch keeps its storage between frames. Step 29 (Horde) draws its crowd with it. Since 6.2.0 it also draws parts of a picture: `add_frame(image, rect, x, y, { anchor, scale, flip_x, angle })` and `add_animation(player, x, y, options)` for an `AnimationPlayer`'s current frame, with fewer transforms than `add()`; see Crowds under Animation (step 37, Gewimmel).

```ts
const batch = new SpriteBatch();
for (const zombie of zombies) {
    batch.add(zombie_image, zombie.x, zombie.y, zombie.angle, 32, 32);
}
camera.apply(context);
batch.draw(context);
```

### Input

- **`KeyboardState`**: key events in, per-frame questions out: `is_down(key)`, `was_pressed`, `was_released`, `typed()`, then `end_frame()`. Keys are `KeyboardEvent.key`; the same by `KeyboardEvent.code`, the key's place whatever the layout types, are `is_code_down(code)`, `was_code_pressed`, `was_code_released` and `pressed_codes()`.
- **`PointerInput`**: the same for mouse, touch and pen: taps, drags, drops, the wheel.
- **`ComboMatcher`** and **`ComboList`**: a sequence of inputs (a dance step, a cheat code) with an optional `max_gap_seconds` between steps; `input()` says `"progress"`, `"complete"`, `"broken"` or `"ignored"`.
- **`MenuInput`**: keys and presses for a `Menu`, with a buffer of presses; `handle_actions(actions, device = "gamepad")` reads an `ActionMap`'s `move`, `confirm` and `back` as the keys they stand for. See [ui.md](ui.md#menus).
- **`ActionMap`** (`input/actions/`): input by name. See below.

#### ActionMap

A game asks for "move" and "fire", not for keys; the keyboard, a gamepad and touch controls all feed the same actions. The game shell owns one (`settings.actions`, `properties.actions`, see [game-shell.md](game-shell.md#actions)); this is the module on its own.

- **Bindings are data** (`ActionBindings`): a `button` has `keys` (by `KeyboardEvent.code`: `"Space"`, `"KeyF"`), `pad` (buttons of the standard mapping by name: `a`, `b`, `x`, `y`, `lb`, `rb`, `lt`, `rt`, `select`, `start`, `l3`, `r3`, `up`, `down`, `left`, `right`, `home`; `PAD_BUTTONS` has their indices), `touch: "button"` and a `label`. A `vector` has `keys` (crosses of four codes: `WASD`, `ARROWS`), `stick` (`"left"` or `"right"`), `dpad` and `touch: "stick"`. `DEFAULT_ACTIONS` is `move`, `confirm`, `back` and `pause`.
- **`new ActionMap({ bindings, keyboard, gamepads, touch, dead_zone, device })`**: `keyboard` a `KeyboardState`, `gamepads` a function that returns the pads (default `browser_gamepads`, `navigator.getGamepads()`; a test passes plain `GamepadLike` objects), `touch` a `TouchSource` (`TouchControls`, or a fake), `dead_zone` 0.2, `device` the `last_device` before the first input.
- **`update()`** once a frame, before the game reads. Two devices at once add up and are cut to 1 long: a key and a stick together are not faster.
- **Buttons**: `is_down(name)`, `just_pressed(name, device?)` (true for exactly one frame; a key pressed and let go between two frames still counts once), `just_released(name)`. **Vectors**: `vector(name, device?)`, at most 1 long; `nudge(name, device?)` is -1, 0 or 1 per axis on the frame a direction passes half way, a step for a cursor.
- **Devices**: `last_device` (`"keyboard"` with the mouse, `"gamepad"`, `"touch"`) follows the last input (a key, a new pad press or a stick leaving its dead zone, a touch); `note_device()` tells it about input it doesn't read, such as a mouse click. `pad` is the id of the standard pad in use; a connected pad with another mapping is ignored and its id is in `unsupported_pad`.
- **Sticks** get a radial dead zone: inside it they are still, outside the rest is scaled so a stick all the way still reaches 1 (`radial_dead_zone(x, y, dead_zone)`; `clamp_vector(x, y)` cuts to 1).
- `has(name)`, `clear()` (forget what is held; what a device still holds next frame is held, not pressed again). Asking for a name the map doesn't have, or a button as a vector, throws.

**`TouchControls`** are touch controls in layout coordinates, plain values in and out: a floating stick that appears where a thumb lands on the left half (`stick`, `stick_vector()`, reach `stick_radius`, a small dead zone of its own) and round buttons on the right (`buttons`, `is_button_down(action)`; `touch_buttons_of(bindings)` lists the ones the bindings ask for). `layout(width, height)` places the buttons, `handle_down(id, point)` / `handle_move` / `handle_up` take fingers by pointer id and say whether they were the controls', `is_shown` is true from the first touch on.

### Random, camera, tile maps

- **`SeededRandom`**: a seeded generator (mulberry32): `next()`, `int(min, max)`, `float(min, max)`, `chance(p)`, `fork()`. The same seed gives the same game. Seeded noise and recipes for maps are in [Noise](#noise).
- **`Camera2D`**: a view that follows a target inside the world's bounds, with a dead zone, look-ahead and smoothing; `apply(context)` puts its transform on the canvas, `world_to_screen` / `screen_to_world` map points, `is_visible(rect)` culls, `parallax(factor)` for background layers.
- **`TileMap`** and **`TileLayer`**: named layers of tiles on a grid; the ways across them are in [World](#world).

### Testing

A custom test suite used for internal testing and available for general use.

- **TestClass**: Base class for tests.
- **TestDashboard**: A UI for viewing test results in the browser. The playground in `test-src/` (`npm run dev`) is built on it.
