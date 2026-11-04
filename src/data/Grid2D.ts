/** One cell of a `Grid2D`: its position and the value stored there. */
export interface GridCell<T> {
    x: number;
    y: number;
    value: T;
}

/** A position on a grid, without the value. */
export interface GridPosition {
    x: number;
    y: number;
}

/**
 * A generic rectangular grid of `width` x `height` cells stored row-major in one array.
 * Board games (Tic-Tac-Toe, Four in a Row, Minesweeper), tile maps and cellular automata all
 * need the same handful of questions: what is at (x, y), which cells are next to it, which
 * straight runs of n cells exist. `Grid2D` answers those; what a cell means is up to the game.
 */
export class Grid2D<T> {
    private readonly _cells: T[];

    /**
     * Creates a grid and fills every cell with `fill`, or with the value `fill(x, y)` returns
     * when it is a function. Width and height must be whole numbers >= 0.
     */
    public constructor(
        public readonly width: number,
        public readonly height: number,
        fill: T | ((x: number, y: number) => T),
    ) {
        if (
            !Number.isInteger(width) ||
            !Number.isInteger(height) ||
            width < 0 ||
            height < 0
        ) {
            throw new Error(
                `Grid2D: invalid size ${width}x${height}, expected whole numbers >= 0`,
            );
        }
        this._cells = new Array<T>(width * height);
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                this._cells[y * width + x] =
                    typeof fill === "function"
                        ? (fill as (x: number, y: number) => T)(x, y)
                        : fill;
            }
        }
    }

    /** `true` when (x, y) is a cell of this grid. */
    public is_inside(x: number, y: number): boolean {
        return (
            Number.isInteger(x) &&
            Number.isInteger(y) &&
            x >= 0 &&
            y >= 0 &&
            x < this.width &&
            y < this.height
        );
    }

    /** The row-major array index of (x, y): `y * width + x`. Not range checked. */
    public index_of(x: number, y: number): number {
        return y * this.width + x;
    }

    /** The value at (x, y); throws when the position is outside the grid. */
    public get(x: number, y: number): T {
        this.assert_inside(x, y);
        return this._cells[this.index_of(x, y)];
    }

    /** Stores `value` at (x, y); throws when the position is outside the grid. */
    public set(x: number, y: number, value: T): void {
        this.assert_inside(x, y);
        this._cells[this.index_of(x, y)] = value;
    }

    /** Every cell with its position, row by row from the top left. */
    public cells(): GridCell<T>[] {
        const result: GridCell<T>[] = [];
        for (let y = 0; y < this.height; y++) {
            for (let x = 0; x < this.width; x++) {
                result.push({ x, y, value: this._cells[this.index_of(x, y)] });
            }
        }
        return result;
    }

    /** The values of row `y`, left to right. */
    public row(y: number): T[] {
        this.assert_inside(0, y);
        return this._cells.slice(y * this.width, (y + 1) * this.width);
    }

    /** The values of column `x`, top to bottom. */
    public column(x: number): T[] {
        this.assert_inside(x, 0);
        const result: T[] = [];
        for (let y = 0; y < this.height; y++) {
            result.push(this._cells[this.index_of(x, y)]);
        }
        return result;
    }

    /**
     * Every straight run of exactly `length` cells: along rows, columns and both diagonal
     * directions. A 3x3 grid has 8 lines of length 3 (the Tic-Tac-Toe lines); a 7x6 board has
     * 69 lines of length 4. Each line lists its positions in order from its start cell.
     */
    public lines(length: number): GridPosition[][] {
        if (!Number.isInteger(length) || length < 1) {
            return [];
        }
        // A run of one cell has no direction: every cell once, not four times.
        const directions: GridPosition[] =
            length === 1
                ? [{ x: 1, y: 0 }]
                : [
                      { x: 1, y: 0 },
                      { x: 0, y: 1 },
                      { x: 1, y: 1 },
                      { x: 1, y: -1 },
                  ];
        const result: GridPosition[][] = [];
        for (const direction of directions) {
            for (let y = 0; y < this.height; y++) {
                for (let x = 0; x < this.width; x++) {
                    const end_x = x + direction.x * (length - 1);
                    const end_y = y + direction.y * (length - 1);
                    if (!this.is_inside(end_x, end_y)) {
                        continue;
                    }
                    const line: GridPosition[] = [];
                    for (let i = 0; i < length; i++) {
                        line.push({
                            x: x + direction.x * i,
                            y: y + direction.y * i,
                        });
                    }
                    result.push(line);
                }
            }
        }
        return result;
    }

    /**
     * The cells around (x, y) that lie inside the grid: the 4 orthogonal ones, or all 8 when
     * `diagonal` is true. Row-major order, the cell itself is never included.
     */
    public neighbours(x: number, y: number, diagonal = false): GridCell<T>[] {
        const result: GridCell<T>[] = [];
        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                if (dx === 0 && dy === 0) {
                    continue;
                }
                if (!diagonal && dx !== 0 && dy !== 0) {
                    continue;
                }
                const nx = x + dx;
                const ny = y + dy;
                if (!this.is_inside(nx, ny)) {
                    continue;
                }
                result.push({ x: nx, y: ny, value: this.get(nx, ny) });
            }
        }
        return result;
    }

    /** A new grid of the same size whose cells are `fn(value, x, y)`. This grid is unchanged. */
    public map<U>(fn: (value: T, x: number, y: number) => U): Grid2D<U> {
        return new Grid2D<U>(this.width, this.height, (x, y) =>
            fn(this._cells[this.index_of(x, y)], x, y),
        );
    }

    /** A shallow copy: same size and values, independent storage. */
    public clone(): Grid2D<T> {
        return this.map((value) => value);
    }

    /** Sets every cell to `value`. */
    public fill(value: T): void {
        this._cells.fill(value);
    }

    /** How many cells satisfy `predicate`. */
    public count(predicate: (value: T) => boolean): number {
        let total = 0;
        for (const value of this._cells) {
            if (predicate(value)) {
                total++;
            }
        }
        return total;
    }

    private assert_inside(x: number, y: number): void {
        if (!this.is_inside(x, y)) {
            throw new Error(
                `Grid2D: (${x}, ${y}) is outside the ${this.width}x${this.height} grid`,
            );
        }
    }
}
