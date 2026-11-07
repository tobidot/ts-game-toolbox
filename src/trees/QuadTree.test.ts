import { describe, it, expect } from "vitest";
import { QuadTree } from "./QuadTree";
import { TreeElementNotFoundException } from "./exceptions/TreeElementNotFoundException";
import { Polygon } from "../geometries/Polygon";
import { Rect, RectI } from "../geometries/Rect";

class DemoQuadElement<T> extends Rect {
    public constructor(
        x: number,
        y: number,
        w: number,
        h: number,
        public data: T,
    ) {
        super({ left: x, top: y, width: w, height: h });
    }
}

describe("QuadTree", () => {
    const base_rect: RectI = {
        left: -50,
        top: -50,
        width: 100,
        height: 100,
    };

    it("new quad tree should be empty", () => {
        const tree = new QuadTree(base_rect);
        expect(tree.is_empty()).toBe(true);
    });

    it("should not be empty after adding an element", () => {
        const tree = new QuadTree(base_rect);
        const element = new DemoQuadElement<number>(0, 0, 0, 0, 10);
        tree.add(element);
        expect(tree.is_empty()).toBe(false);
    });

    it("should throw TreeElementNotFoundException when removing from empty tree", () => {
        const tree = new QuadTree(base_rect);
        const element = new DemoQuadElement<number>(0, 0, 0, 0, 10);
        expect(() => tree.remove(element)).toThrow(
            TreeElementNotFoundException,
        );
    });

    it("should be empty after add and remove", () => {
        const tree = new QuadTree(base_rect);
        const element = new DemoQuadElement<number>(0, 0, 0, 0, 10);
        tree.add(element);
        tree.remove(element);
        expect(tree.is_empty()).toBe(true);
    });

    it("should throw if removing same element twice", () => {
        const tree = new QuadTree(base_rect);
        const element = new DemoQuadElement<number>(0, 0, 0, 0, 10);
        tree.add(element);
        tree.remove(element);
        expect(() => tree.remove(element)).toThrow(
            TreeElementNotFoundException,
        );
    });

    it("pick should return empty array if tree is empty", () => {
        const tree = new QuadTree(base_rect);
        const rect: RectI = { left: 0, top: 0, width: 500, height: 500 };
        const result = tree.pick(rect);
        expect(result.length).toBe(0);
    });

    it("should pick element within rect", () => {
        const tree = new QuadTree(base_rect);
        const element = new DemoQuadElement<number>(0, 0, 0, 0, 10);
        const rect = new Rect({ left: -1, top: -1, width: 3, height: 3 });
        tree.add(element);
        const result = tree.pick(rect);
        expect(result.length).toBe(1);
        expect(result[0]).toBe(element);
    });

    describe("on a tree that has split", () => {
        const corners = (): Array<DemoQuadElement<number>> => {
            const elements: Array<DemoQuadElement<number>> = [];
            for (let index = 0; index < 12; index++) {
                elements.push(
                    new DemoQuadElement<number>(
                        -48 + index,
                        -48 + index,
                        1,
                        1,
                        index,
                    ),
                );
            }
            return elements;
        };

        it("pick returns an element once when the rect covers a whole branch", () => {
            const tree = new QuadTree<DemoQuadElement<number>>(base_rect);
            for (const element of corners()) {
                tree.add(element);
            }
            // Lies across the middle, so the root keeps it itself.
            const across = new DemoQuadElement<number>(-5, -5, 10, 10, 99);
            tree.add(across);

            const picked = tree.pick({
                left: -60,
                top: -60,
                width: 120,
                height: 120,
            });

            expect(picked).toHaveLength(13);
            expect(new Set(picked).size).toBe(13);
        });

        it("clear keeps the branches for the next fill by default", () => {
            const tree = new QuadTree<DemoQuadElement<number>>(base_rect);
            for (const element of corners()) {
                tree.add(element);
            }
            const leaves = tree.collect_leaf_rects().length;
            expect(leaves).toBeGreaterThan(1);

            tree.clear();

            expect(tree.is_empty()).toBe(true);
            expect(tree.collect_leaf_rects()).toHaveLength(leaves);
        });

        it("clear(0) drops the branches, so an emptied corner stops being subdivided", () => {
            const tree = new QuadTree<DemoQuadElement<number>>(base_rect);
            for (const element of corners()) {
                tree.add(element);
            }

            tree.clear(0);

            expect(tree.is_empty()).toBe(true);
            expect(tree.collect_leaf_rects()).toHaveLength(1);
        });
    });

    describe("pick_polygon", () => {
        const sea: RectI = { left: 0, top: 0, width: 1000, height: 1000 };
        const center = (element: Rect) => ({
            x: element.left + element.width / 2,
            y: element.top + element.height / 2,
        });
        /** Spread by a fixed sequence, so a failure stays the same one. */
        const filled = (count: number) => {
            const tree = new QuadTree<Rect>(sea);
            const elements: Array<Rect> = [];
            for (let index = 0; index < count; index++) {
                const element = new Rect({
                    left: 10 + ((index * 379) % 970),
                    top: 10 + ((index * 613) % 970),
                    width: 8,
                    height: 8,
                });
                elements.push(element);
                tree.add(element);
            }
            return { tree, elements };
        };
        const shapes: Record<string, Polygon> = {
            fan: new Polygon([
                { x: 500, y: 500 },
                { x: 960, y: 200 },
                { x: 990, y: 500 },
                { x: 960, y: 800 },
            ]),
            concave_star: new Polygon([
                { x: 500, y: 50 },
                { x: 560, y: 440 },
                { x: 950, y: 500 },
                { x: 560, y: 560 },
                { x: 500, y: 950 },
                { x: 440, y: 560 },
                { x: 50, y: 500 },
                { x: 440, y: 440 },
            ]),
            smaller_than_a_cell: new Polygon([
                { x: 500, y: 500 },
                { x: 503, y: 500 },
                { x: 503, y: 503 },
            ]),
            around_everything: new Polygon([
                { x: -100, y: -100 },
                { x: 1100, y: -100 },
                { x: 1100, y: 1100 },
                { x: -100, y: 1100 },
            ]),
            outside_everything: new Polygon([
                { x: 2000, y: 2000 },
                { x: 2100, y: 2000 },
                { x: 2100, y: 2100 },
            ]),
        };

        for (const [name, shape] of Object.entries(shapes)) {
            it(`finds what a loop over all elements finds: ${name}`, () => {
                const { tree, elements } = filled(2000);

                const picked = tree.pick_polygon(shape);

                const expected = elements.filter((element) =>
                    shape.contains(center(element)),
                );
                expect(new Set(picked).size).toBe(picked.length);
                expect(new Set(picked)).toEqual(new Set(expected));
            });
        }

        it("tests few elements one by one, where the cells are decided whole", () => {
            const { tree } = filled(2000);
            const checked: Array<Rect> = [];

            tree.pick_polygon(shapes.fan, checked);

            expect(checked.length).toBeGreaterThan(0);
            expect(checked.length).toBeLessThan(600);
        });

        it("tests hardly any when the polygon misses or covers it all", () => {
            const { tree } = filled(2000);
            const checked: Array<Rect> = [];

            expect(
                tree.pick_polygon(shapes.around_everything, checked),
            ).toHaveLength(2000);
            expect(
                tree.pick_polygon(shapes.outside_everything, checked),
            ).toHaveLength(0);

            expect(checked).toHaveLength(0);
        });
    });
});
