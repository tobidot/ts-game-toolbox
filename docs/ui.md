# UI

A canvas UI system: widgets in a tree, a page that scales the tree to the canvas, a manager that feeds it the pointer, and themes as lists of rules. It lives in `src/ui/`.

What you can press is a widget. What you only look at may be painted.

## The parts

- **`Element`**: the base of everything on the page. A `rect`, a `type`, a `class`, a `state`, `events`, and a `theme` computed from the rules.
- **`Group`**: an element with children. Their rects are relative to its rect. `add(child)` and `remove(child)`.
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
- `properties.set_theme(rules)`: swaps the game's rules; see below.

## Widgets

| Widget                      | Constructor                      | Worth knowing                                                                                                                                                          |
| --------------------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Button`                    | `(label, rect)`                  | Text is always centered.                                                                                                                                               |
| `Label`                     | `(text, rect)`                   | Text that is too wide gets squeezed into the box.                                                                                                                      |
| `ValueLabel`                | `(label, value, rect)`           | Shows `label: value`.                                                                                                                                                  |
| `CheckBox`                  | `(checked, rect)`                | `checked`, and an optional `label`. With a label the rect's height decides the box. Without one the box is at most 20 units, and the game paints what goes next to it. |
| `Slider`                    | `(title, min, max, value, rect)` | `value`; `format: (value) => string`, default two decimals. Pressing anywhere on it sets the value.                                                                    |
| `Panel`                     | `(children, rect)`               | A `Group` with a background.                                                                                                                                           |
| `ScrollGroup`               | `(children, rect)`               | See below.                                                                                                                                                             |
| `Gallery`, `Image`, `Video` |                                  | Not used in the Spielwerk series yet.                                                                                                                                  |

All of them also take `is_visible` and `theme_rules` as the last two arguments. A hidden element isn't hit, and neither is anything inside it.

## States and classes

`element.state` is one of `disabled`, `active`, `selected`, `hover`, or `null`, in that priority. `active` is a press being held.

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
- Borders: `border_width`, `border_radius`. A border draws outward from the rect, so inside a clipping `ScrollGroup` leave room for it.
- Text: `font_size`, `font_family`, `text_align`, `text_baseline`. `font_weight` and `font_style` exist, but no widget reads them.

**The house look.** `default_theme(settings)` styles every widget, so one with no rules at all looks finished. Button classes: `primary`, `accent`, `secondary`, `off`. A game adds only what differs.

**Swapping.** `properties.set_theme(rules)` keeps the house rules underneath, replaces the game's rules, and everything on the page follows at once; rules a widget has for itself stay. No widget needs to know.

Without the shell it is `page.theme_rules = rules; page.update_theme_instance();`, with your own base rules in `rules`.

## Scrolling, drags and the wheel

`ScrollGroup` is a `Group` with a vertical offset. It clips its drawing to its rect, and whatever is clipped away can't be hit. It doesn't arrange its children: the game gives each one a rect, in the group's scrolling coordinates.

- `scroll`: the offset, kept between 0 and `max_scroll`.
- `content_height`, `max_scroll`.
- `scroll_to(child)`: the least scroll that shows the child, for following a keyboard cursor.

A press locks the element under it, and moves go to that element's `drag()`. If it returns false, and the press has moved more than `UiManager.drag_threshold` (10 reference units), the parents are offered the drag, the nearest first. The one that takes it holds the press from then on, and the release is no click. So a tap on a row presses the row, even a shaky one, and a drag starting on a row scrolls the list.

`UiManager.wheel(canvas_coords, delta_y)` offers the wheel to what's under the pointer, the top element first. `bind_stage_input` feeds it, and stops the page from scrolling only if an element took it.

## Taking things off the page

`group.remove(child)` returns whether it was a child. The removed element loses its press and its hover, and the manager lets go of it, so a dead widget keeps nothing and clicks nothing.
