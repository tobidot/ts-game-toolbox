# Trees

Data structures for spatial partitioning and efficient data access.

## QuadTree

A `QuadTree` is used to partition a 2D space by recursively subdividing it into four quadrants. It is highly efficient for spatial queries like "find all objects in this rectangle".

### Usage

```typescript
import { QuadTree, Rect } from 'ts-game-toolbox';

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

## Collection

A simple wrapper around an array with additional utility methods.
