import { describe, it, expect } from "vitest";
import { QuadTree } from "./QuadTree";
import { TreeElementNotFoundException } from "./exceptions/TreeElementNotFoundException";
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
});
