# Geometries

Contains classes and functions handling Geometric calculations.

The Geometric functions and classes assume a 2D-coordinate system, where:
- `-x` is left
- `+x` is right
- `-y` is top
- `+y` is bottom

*Note: The coordinate system in code seems to follow standard screen coordinates (y increases downwards), as indicated by `UP = new Vector2(0, -1)` and `DOWN = new Vector2(0, 1)` in `Vector2.ts`.*

## Vector2

A 2D vector class with common mathematical operations.

### Usage

```typescript
import { Vector2 } from 'ts-game-toolbox';

const pos = new Vector2(10, 20);
const dir = new Vector2(1, 0);

pos.add(dir.mul(5)); // pos is now (15, 20)

const distance = pos.len();
const normalized = pos.cpy().normalize();
```

## Rect

Represents a rectangle defined by `top`, `left`, `width`, and `height`.

### Usage

```typescript
import { Rect } from 'ts-game-toolbox';

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

### Methods and Properties

- `intersects(other: RectI): boolean`
- `contains(point: Vector2I): boolean`
- `is_within(outer: RectI): boolean`
- `expand_to(point: Vector2I): this`
- `get_corners(): Vector2I[]`
- `center: Vector2I` (getter and setter)
- `lerp(target: Rect, t: number): this`

## Other Shapes

- **Line**: A line segment defined by two points.
- **Polygon**: A shape defined by a set of points.
- **Ray**: A ray starting from a point in a direction.
