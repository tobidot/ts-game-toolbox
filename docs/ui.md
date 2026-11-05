# UI

A canvas UI system: widgets in a tree, a page that scales the tree to the canvas, a manager that feeds it the pointer, and themes as lists of rules. It lives in `src/ui/`.

What you can press is a widget. What you only look at may be painted.

## The parts

- **`Element`**: the base of everything on the page. A `rect`, a `type`, a `class`, a `state`, `events`, and a `theme` computed from the rules.
- **`Group`**: an element with children. Their rects are relative to its rect. `add(child)` and `remove(child)`. A child with `stays_on_top` set stays last, so it paints over the others and gets hit first, whatever is added after it; the mute buttons do that.
- **`UiPage`**: the root `Group`. Its `rect` is in fractions of the canvas, its `reference_rect` is the coordinate system its children live in.
- **`UiManager`**: holds the `active_menu` page, and takes the pointer in canvas pixels: `pointer_down`, `pointer_up`, `pointer_move`, `pointer_exit`, `wheel`.

## Without the game shell

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

## With the game shell

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

## Widgets

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
| `Gallery`, `Image`, `Video` |                                  | Not used in the Spielwerk series yet.                                                                                                                                  |

All of them also take `is_visible` and `theme_rules` as the last two arguments. A hidden element isn't hit, and neither is anything inside it.

A row of a table is a `Button` with columns. The widths are shares of the width inside `text_padding`, and each column squeezes its text to fit, so a long name can't push the next column away:

```typescript
row.columns = [
    { text: train.name, share: 0.43, align: "left" },
    { text: "Gleis 2", share: 0.32, align: "left" },
    { text: "16:04", share: 0.25, align: "right" },
];
```

A column without `align` takes the theme's `text_align`. While `columns` isn't null, the label doesn't show.

A long label on a `Button` is squeezed. `text_overflow = "ellipsis"` ends it in `…` instead, for a list where the squeezed rows would differ. `wrap_text(ctx, text, width)` and `ellipsize_text(ctx, text, width)` are the same two rules for your own painting.

## States and classes

`element.state` is one of `refused`, `disabled`, `active`, `selected`, `entering`, `hover`, or `null`, in that priority. `entering` lasts a moment after `show_entering(seconds?)`, for what has just appeared. `active` is a press being held. `refused` lasts a moment, after `show_refused()`, and a selector with `:disabled` matches it too, so an element with no `:refused` rule simply stays disabled.

```typescript
button.is_selected = train === game.selected;
button.is_disabled = route_problem(game, request) !== null;
button.class = train.is_late ? "late" : null;
```

Each of these updates the theme when it changes.

A disabled element still gets hit, so a press can't fall through to the game, and still gets hover, so it can show why. It never clicks and never drags. A press released on it, or `click()` from a key, dispatches `ElementRefusedEvent` instead. Touch has no hover, so that event is where a game says why.

## Theme rules

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

## Movement

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

## Borders

`border_style` is `"solid"`, or `"raised"` and `"sunken"`: a bevel, lighter and darker than `border_color`, as `border_width` wide. A `Panel` and anything else that draws a background has it.

## Menus

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
- `is_held`: while true, presses wait in the buffer and nothing moves. `is_enabled`: a menu on a screen not in use; off, it hears nothing.
- `handle_key(key, is_repeat?)`, `handle_hover(depth, index)`, `handle_press(depth, index)`: what a view or your own painting feeds it. Up and Down move and repeat; Enter and Space confirm; Escape and Left go back; Right opens a submenu; a letter picks the entry with that `key`.
- `attach(target, signal)` for keys without the shell. In a game, the shell routes keys to every placed view's input, after the intro and after the mute and next-round keys, and calls `update()` before your `update()` and `end_frame()` after it. A second menu on another screen is the same with `is_enabled`.

**The buffer** holds presses, not choices: typing ahead means pressing Down, Down, Enter during a wait, so the moves have to wait too. They replay in order when the hold ends, and a replayed Enter may open the next submenu and start the next wait. The rules, all of them from what bots showed:

- `buffer_seconds`, default 1: how long the oldest press may wait in one hold. Make it longer than your longest hold; a shorter one is worse than none, because a press typed ahead dies and those behind it are lost with it.
- `buffer_size`, default 16: how many may wait. A press that doesn't fit is the one that goes.
- No holes: a queue with a press missing means something else, so what goes, goes with all behind it. Those count in `dropped_presses`.
- A replayed press on a disabled entry drops the rest, so a mashing player doesn't open the wrong form.
- A new tree drops the queue: the presses were meant for a tree that isn't there.
- Replay stops at a choice, so the game can hold before the next one plays.

**`MenuView`** takes `MenuViewOptions`: `style` (theme rules), `level` (which level it shows, default the open one), `row_height`, `row_gap`, `padding`, `submenu_mark`, `show_hint`, `show_path`, `root_text`, `held_text`, `create_row`. It's a `Panel` holding a `ScrollGroup` in `list`, between `path` and `hint`, because those two mustn't scroll. `row_height` can change, for a layout that wants taller rows.

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

## Scrolling, drags and the wheel

`ScrollGroup` is a `Group` with a vertical offset. It clips its drawing to its rect, leaving room for the border of its widest child, and whatever is clipped away can't be hit.

Set `row_height` and it stacks its children top to bottom, in the order of adding, with `row_gap` between them and `padding` around them, and leaves a gutter for the scroll bar; `reserves_gutter = false` gives rows that fit the whole width until there is something to scroll. Without `row_height` it doesn't arrange them: the game gives each child a rect, in the group's scrolling coordinates.

- `scroll`: the offset, kept between 0 and `max_scroll`.
- `content_height`, `max_scroll`.
- `scroll_to(child)`: the least scroll that shows the child, for following a keyboard cursor.

A press locks the element under it, and moves go to that element's `drag()`. If it returns false, and the press has moved more than `UiManager.drag_threshold` (10 reference units), the parents are offered the drag, the nearest first. The one that takes it holds the press from then on, and the release is no click. So a tap on a row presses the row, even a shaky one, and a drag starting on a row scrolls the list.

`UiManager.wheel(canvas_coords, delta_y)` offers the wheel to what's under the pointer, the top element first. `bind_stage_input` feeds it, and stops the page from scrolling only if an element took it.

## Taking things off the page

`group.remove(child)` returns whether it was a child. The removed element loses its press and its hover, and the manager lets go of it, so a dead widget keeps nothing and clicks nothing.
