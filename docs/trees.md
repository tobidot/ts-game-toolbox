# Trees

Data structures for spatial partitioning and efficient data access.

## QuadTree

A `QuadTree` is used to partition a 2D space by recursively subdividing it into four quadrants. It is highly efficient for spatial queries like "find all objects in this rectangle".

### Usage

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

## Collection

A simple wrapper around an array with additional utility methods.
