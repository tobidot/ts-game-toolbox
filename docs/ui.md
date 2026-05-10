# UI

A simple canvas-based UI system.

## UiManager

The `UiManager` handles event propagation and rendering for a set of UI elements.

### Usage

```typescript
import { UiManager, Group, Button } from 'ts-game-toolbox';

const ui = new UiManager();
const menu = new Group();

const btn = new Button({ top: 10, left: 10, width: 100, height: 40 });
btn.on_click(() => console.log("Button clicked!"));

menu.add(btn);
ui.active_menu = menu;

// In your event listeners
canvas.addEventListener('mousedown', (e) => {
    ui.pointer_down({ x: e.offsetX, y: e.offsetY });
});

// In your render loop
function draw() {
    ui.draw(ctx);
}
```

## Widgets

The library provides several built-in widgets:
- **Button**: A simple clickable button.
- **CheckBox**: A toggleable checkbox.
- **Slider**: A horizontal slider to select a value.
- **Label**: Displays text.
- **Gallery**: A scrollable or paginated collection of items.
- **ValueLabel**: A label that displays a value from an observable.

## Layout and Groups

Elements can be grouped using the `Group` class, which also acts as a container for hits and drawing.
Each element is defined by its position (`top`, `left`) and size (`width`, `height`).
