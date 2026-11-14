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
import { Vector2 } from '@game.object/ts-game-toolbox';

const pos = new Vector2(10, 20);
const dir = new Vector2(1, 0);

pos.add(dir.mul(5)); // pos is now (15, 20)

const distance = pos.len();
const normalized = pos.cpy().normalize();
const stick = new Vector2(3, 4).limit(1); // (0.6, 0.8): never longer than 1
```

- `limit(max_length)`: shortens the vector to `max_length` if it is longer; a shorter one and the null vector stay as they are.

## Rect

Represents a rectangle defined by `top`, `left`, `width`, and `height`.

### Usage

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

### Methods and Properties

- `intersects(other: RectI): boolean`
- `contains(point: Vector2I): boolean`
- `is_within(outer: RectI): boolean`
- `expand_to(point: Vector2I): this`
- `get_corners(): Vector2I[]`
- `center: Vector2I` (getter and setter)
- `lerp(target: Rect, t: number): this`
- `Rect.contained(box, width, height): RectI`: the largest rect of a picture's shape (`width` by `height`) that fits inside `box`, centered. A picture with no size yet gets the box. The `Image`, `Gallery` and `Video` widgets use it for `is_contained`.
- `Rect.touches_segment(rect, a, b): boolean`: whether the segment from `a` to `b` touches the rect, inside it or across it.

## Other Shapes

- **Line**: A line segment defined by two points.
- **Polygon**: A shape defined by a set of points.
    - `contains(point)`: inside or not, for any polygon (concave too). A ray that only grazes a corner no longer counts as crossing it.
    - `bounding_rect`: the smallest `Rect` around the points: what to ask a `QuadTree` for before testing `contains()` on what it returns.
    - `translated(offset)` and `rotated(radians, pivot)`: moved and turned copies; the polygon itself stays. Positive radians turn clockwise on screen, like the canvas's `rotate()`.
- **Ray**: A ray starting from a point in a direction.
