import { TestClass } from "../../src/testing/TestClass"
import { Rect } from "../../src/geometries/Rect"

export class RectTest extends TestClass {
    private rect: Rect = new Rect();

    public get_name(): string {
        return "Rect Test";
    }

    public set_up() {
        this.rect = new Rect(0, 0, 100, 100);
    }

    public test_rect_right_and_bottom_on_rect_at_0_0() {
        this.assert_equals(100, this.rect.get_right());
        this.assert_equals(100, this.rect.get_bottom());
    }

    public test_rect_right_and_bottom_on_rect_at_50_25() {
        this.rect.x = 50;
        this.rect.y = 25;
        this.assert_equals(150, this.rect.get_right());
        this.assert_equals(125, this.rect.get_bottom());
    }

    public test_rect_area() {
        this.assert_equals(10000, this.rect.get_area());
    }

    public test_rect_should_overlap() {
        const rect_same_start = {
            x: 0, y: 0, w: 50, h: 50
        };
        this.assert_true(this.rect.overlaps_with(rect_same_start));

        const rect_overlap_x = {
            x: 0, y: -100, w: 50, h: 50
        };
        this.assert_false(this.rect.overlaps_with(rect_overlap_x));

        const rect_overlap_y = {
            x: -100, y: -100, w: 50, h: 150
        };
        this.assert_false(this.rect.overlaps_with(rect_overlap_y));

        const rect_overlap_fraction = {
            x: -100, y: -100, w: 100.001, h: 100.001
        };
        this.assert_true(this.rect.overlaps_with(rect_overlap_fraction));
    }
}