# Game shell

The canvas game shell runs a browser game as a custom element: it reads the attributes, plays the intro, fits the canvas into any window, routes the input, loads the images and sounds, and drives a throttled frame loop. A game writes its rules and its painting; the rest is the shell's. It lives in `src/game-element/`, on top of `src/stage/` and `src/audio/`, which also work on their own.

Every game of the Spielwerk series is built on it; the series template (`collection-spielwerk/_template/src/`) is the smallest real one.

## The five parts

- **`CanvasGameSettings`**: everything constant: the title, the layouts, the frame rate, colors, images, sounds, themes. A game subclasses it and overrides what differs.
- **`CanvasGameReferences`**: the DOM, built once: the shadow root, the `CanvasStage`, a status line for screen readers, and the `AssetManager` (`assets`). Most games use it as it is.
- **`CanvasGameProperties`**: the mutable state: the game, the seed, the UI page, the keyboard, the sound player. It survives a disconnect and reconnect (a window being moved). A game subclasses it for its own state and widgets.
- **`CanvasGameRenderer`**: pure painting. A game implements `paint()`; the shell clears the canvas before it and draws the UI page after it.
- **`CanvasGameLogic`**: the lifecycle and the hooks. A game implements `create_game(seed)` and overrides the hooks it needs.

The game itself (`G` in the type parameters) is a plain class without DOM, so tests can run it alone. The element is a `CanvasGameElement` that names the five classes in `assemble()`.

## A whole game

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

## The element

- **`assemble(parts)`** builds the five parts in order. `references` and `properties` may be left out when the base classes do; `css` adds styles to the shadow root.
- **Attributes.** `init-seed` (a whole number; omitted: random) and `init-intro` (`false` skips the intro) are read once, at the first connection. A game reads its own in the logic's `read_attributes(read)`.
- **Hooks for a host.** `load_intro_url()` says where the intro video comes from; the default rejects, which skips the intro. `on_connected(title)` runs after every connection (a desktop retitles its window there). `load_catalogue_url(id, kind)` says where an entry of `settings.catalogue_images` or `catalogue_sounds` lives (a `CatalogueFile`: `url`, `cors`, `sheet` for an animated sprite sheet, and `rig` for a cut-out puppet); it is asked once per entry at the first connection, the file loads through `references.assets.request()` under the game's name, and the default rejects, so the game paints or plays its fallback. Catalogue sounds count for the sound button, and a catalogue `music` track starts when it arrives. A picture with `sheet` data fills `references.sheet(name)`, and `logic.load_animation(name)` plays it (see [animation.md](animation.md)). A picture with `rig` data fills `references.puppet(name)`, and `logic.load_puppet(name)` makes a puppet of it; one whose `rig` is a wardrobe (clothes for puppets) fills `references.wardrobe(name)`, and `logic.load_wardrobe(name)` hands it to `puppet.use_wardrobe()` (see [puppet.md](puppet.md#clothes-on-anchors)); one whose `rig` is a mark sheet (tattoos, scars, paint for skins) fills `references.mark_sheet(name)`, and `logic.load_marks(name)` hands it to `puppet.use_marks()` (see [puppet.md](puppet.md#body-shape-and-skin)). `@tce-v3/game-boot`'s `GameElement` (and the Spielwerk's `SpielwerkElement`, which renames it) fills all three from `dll-tce-assets`. `open_save_store(tag)` says where `properties.saves` keeps its files; it is asked once, before the game starts, with `settings.save_tag` (default the element's tag name), and the default is local storage under `<tag>/` (memory where there is none). game-boot fills it from `dll-tce-file-system` (`/saves/<tag>/<slot>.json`), falling back to local storage. See [saves.md](saves.md).
- **Seeds.** Game n of an element is created with `init-seed + n` (`properties.restarts`). `restart()` starts the next game of the series; the same seed replays the same series.

## Settings

Override what differs; everything has a default.

- **Look and size.** `title`, `rule` (one line on the start screen), `layouts` (default one of 960 x 640), `colors` (`HOUSE_COLORS`), `background`, `font_family`, `button_font_size`, `label_font_size`, `slider_font_size`, `radius`, `press_transition_seconds`.
- **`layout_for`**: for a game that arranges itself in whatever room it gets. It makes the layout for the stage's size in CSS pixels on every resize; `layouts` then only holds what shows before the stage was measured, usually `[layout_for(960, 640)]`.
- **`frames_per_second`** (default 30). A still game repaints only when something changed.
- **Keys.** `game_keys` lose their browser default (scrolling) once the game runs. `next_round_keys` (Space, Enter) start the next round on a finished one.
- **Rounds.** `round_end_hold_seconds` (default 0): an end card stays this long before a press can start the next round, so a press meant for the game doesn't skip it.
- **Themes.** `themes` maps names to theme rules, and `theme_fade_seconds` fades between them. See "Themes" below.
- **Files.** `images` and `sounds` map names to imported files; the shell loads them when the element starts. `music` names the track from `sounds` that loops while the game can be played. `sound_mute_key` (`s`) and `music_mute_key` (`m`) do what the mute buttons do; `mute_answer_sound` (`select`) is what a mute button answers with.
- **Actions.** `actions`, the game's `ActionBindings` (default `DEFAULT_ACTIONS`: `move`, `confirm`, `back`, `pause`); see "Actions" below. `touch_stick` and `touch_buttons` (both off) turn on the shell's touch controls, `stick_dead_zone` (0.2) is a gamepad stick's still part, `unsupported_pad_notice` what shows for a pad without the standard mapping.
- **Saves.** `save_version` (1), `save_tag` (null: the element's tag name), `save_slots` (`slot-1` to `slot-3`, for a `SaveSlotsPage`), `autosave_seconds` (10). See [saves.md](saves.md).
- **Intro and start screen.** `intro_timeout_ms` (6000), `intro_hold_ms` (1500), `start_button`, `start_hint`, and `start_hint_gamepad` and `start_hint_touch` for the device in use.

## Properties

- **State.** `game`, `seed`, `restarts`, `best` (a `SessionBest`), `pointer` (the last pointer position in layout coordinates, null when it left), `layout` (the stage's choice), `is_dirty` (set it when something changed outside `update()`).
- **`frame_seconds`**: how long the last frame really took. `update()` gets the same time capped at 0.1 s, so a slow frame can't throw the game; this one is for a frame rate meter or a `FrameBudget`.
- **Input.** `ui` and `page`, the toolbox UI on the canvas; `actions`, the `ActionMap` of `settings.actions`, updated before every `update()`; `keyboard`, a `KeyboardState` to read in `update()`; `menu_inputs`, the `MenuInput`s the shell hands the keys and the gamepad (every placed `MenuView` brings its own); `touch_controls`, the stick and buttons of `settings.touch_stick` and `touch_buttons`; `pad_notice`, the shell's `TimedNotice` for a pad it doesn't support.
- **Saves.** `saves`, null until a game sets it with `save_slots(options)`: a `SaveSlots` in `settings.save_version` that gets the element's store when it connects; the logic's `start()` resumes its autosave and `stop()` pauses it (saving once more). See [saves.md](saves.md).
- **Sound.** `audio`, an `AudioPlayer` over the loaded sounds; `sound_button` and `music_button`, see below.
- **`place(widget, rect_of, parent = page)`** adds a widget and keeps it at `rect_of(layout)` in every layout the stage picks. Build the widget with `UNPLACED`; the rect comes from the layout. `place_widgets()` moves them all again, for a rule that depends on game state.
- **Themes.** `set_theme(rules, fade_seconds = 0)` swaps the game's theme rules; the house rules stay underneath and the layout's `theme_rules` on top. `show_theme(name)` shows one of `settings.themes`, and `blended(table)` gives a game's own table per theme name (the colors it paints) as it stands right now, in step with the widgets during a fade. Usually the logic's `theme_name(game)` decides and the shell calls `show_theme()`.

The house look (`default_theme(settings)`) gives every widget a finished look with no rules at all, and button classes `primary`, `accent`, `secondary` and `off`. Widgets, states and theme rules: see [ui.md](ui.md).

## The renderer

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

## The logic

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

## Actions

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

## Sound

Name the files in `settings.sounds` and play them with `properties.audio.play_sound("hit")`. `settings.music` loops from the end of the intro, stands still while the tab is hidden and stops when the element goes. A browser that refused the music gets it again from the next click or key.

A layout that is a `MuteButtonsLayout` and has a `sound_button` or `music_button` rect gets a mute button there: the shell builds it (`MuteButton`, an icon with a strike while off), places it on top of the game's widgets, wires it and keeps it showing what `audio` says. A layout without the rect hides it.

## Helpers for games

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

## The stage

`src/stage/` is the part that knows nothing of games, for a canvas page without the shell.

- **`StageLayout`**: one arrangement of the screen in its own reference resolution, `width` x `height`, with optional `theme_rules` (a phone's larger text). A game extends it with the rects of its widgets and areas.
- **`pick_layout(layouts, width, height)`** takes the layout that shows the game largest; a later one must be 5 % larger to win, so a window near the break-even doesn't flip. `fit_layout(layout, width, height)` gives `{ scale, offset_x, offset_y }`, centred. A `LayoutFor` function makes the layout for the size instead.
- **Grids.** `grid_in(area, columns, rows, gap)` and `grid_cell(grid, index)` lay out cells row by row; `rect_contains(rect, point)`.
- **`CanvasStage(element, layouts, options?)`**: a canvas that fills `element`, in device pixels. `observe(signal, on_resize)` resizes on every change until the signal aborts, picks and fits the layout, and places every `attach()`ed `UiPage` in the same rectangle, so the scene and its buttons never drift apart. `begin(background)` clears and leaves the context in layout coordinates, `end()` goes back to canvas pixels for the UI. `to_layout(event)` and `to_canvas(event)` map the pointer; `visible` is all the canvas shows.
- **`IntroGate`**: the opening: a start screen (`waiting`) until a click or key allows sound, the intro video, a hold on its last frame, then `done`. Every way out ends in `done`, even a failed video, so the game never depends on the intro. `start(container, signal, options)` on every connection, `leave()` with the start screen's click.
- **`draw_start_screen(context, layout, options)`**: the default start screen, in layout coordinates; the whole screen is the button. `start_screen_block()` is where its text goes.
- **`bind_stage_input(signal, targets, handlers)`**: the input wiring: pointer events go to the `UiManager` in canvas pixels, the first gesture on the start screen goes to the intro and nowhere else, and the rest goes to the handlers in layout coordinates. All listeners end with the signal.

## AudioPlayer

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
