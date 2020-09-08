import { TestClass } from "../../src/test-helpers/TestClass";
import { QuadTree } from "../../src/trees/QuadTree";
import { TreeElementNotFoundException } from "../../src/trees/exceptions/TreeElementNotFoundException";
import { Rect, IRect } from "../../src/geometry/Rect";

export class QuadTreeTest extends TestClass {


    public base_rect: IRect = {
        x: -50, y: -50, w: 100, h: 100,
    };
    public tree = new QuadTree<DemoQuadElement<number>>(this.base_rect);

    public get_name() {
        return "quad_tree_test"
    }

    public set_up() {
        this.tree = new QuadTree(this.base_rect);
    }

    public test_new_quad_tree_is_empty() {
        this.assert_true(this.tree.is_empty());
    }

    public test_quad_tree_is_not_empty_after_add_element() {
        const element = new DemoQuadElement<number>(0, 0, 0, 0, 10);
        this.tree.add(element);
        this.assert_false(this.tree.is_empty());
    }

    public test_remove_element_from_empty_quad_tree_throws_element_not_found() {
        const element = new DemoQuadElement<number>(0, 0, 0, 0, 10);
        debugger;
        this.assert_exception(
            TreeElementNotFoundException,
            () => {
                this.tree.remove(element);
            }
        );
    }

    public test_quad_tree_is_empty_after_add_and_remove_element() {
        const element = new DemoQuadElement<number>(0, 0, 0, 0, 10);
        this.tree.add(element);
        this.tree.remove(element);
        this.assert_true(this.tree.is_empty());
    }

    public test_quad_tree_after_once_add_twice_remove_throws_element_not_found() {
        const element = new DemoQuadElement<number>(0, 0, 0, 0, 10);
        this.tree.add(element);
        this.tree.remove(element);
        this.assert_exception(TreeElementNotFoundException, () => {
            this.tree.remove(element);
        });
    }

    public test_quad_tree_pick_returns_empty_array() {
        const rect: IRect = { x: 0, y: 0, w: 500, h: 500 };
        const result: Array<DemoQuadElement<number>> = this.tree.pick(rect);
        this.assert_true(result.length === 0);
    }

    public test_quad_tree_picking_rect_with_element_within_returns_element_in_array() {
        const element = new DemoQuadElement<number>(0, 0, 0, 0, 10);
        const rect = new Rect(-1, -1, 3, 3);
        this.tree.add(element);
        const result = this.tree.pick(rect);
        this.assert_equals(result.length, 1);
        this.assert_equals(result[0], element);
    }
}

class DemoQuadElement<T> extends Rect {
    public constructor(
        x: number, y: number, w: number, h: number, public data: T
    ) {
        super(x, y, w, h);
    }
}
