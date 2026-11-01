import { Segment } from "./Segment";
import { Vector2 } from "./Vector2";
import { Ray } from "./Ray";
import { expect } from "chai";

describe("Segment", () => {
    it("intersects", () => {
        const segment = new Segment(new Vector2(0, 0), new Vector2(1, 1));
        const segment2 = new Segment(new Vector2(1, 0), new Vector2(0, 1));
        expect(segment.get_ray_projection(segment2)).to.be.approximately(
            0.5,
            0.01,
        );
        expect(segment2.get_ray_projection(segment)).to.be.approximately(
            0.5,
            0.01,
        );
        const intersections = segment.get_segment_intersections(segment2);
        expect(intersections[0].x).to.be.approximately(0.5, 0.01);
        expect(intersections[0].y).to.be.approximately(0.5, 0.01);
        const ray = new Ray(new Vector2(1, 0), new Vector2(-1, 0));
        expect(segment.get_ray_projection(ray)).to.be.approximately(0.0, 0.01);
        expect(ray.get_ray_projection(segment)).to.be.approximately(1.0, 0.01);
        const ray_intersections = segment.get_ray_intersections(ray);
        expect(ray_intersections[0].x).to.be.approximately(0.0, 0.01);
        expect(ray_intersections[0].y).to.be.approximately(0.0, 0.01);
    });

    it("from_points matches the constructor (no Y-flip / no double-subtraction)", () => {
        const start = new Vector2(3, 4);
        const end = new Vector2(7, 1);
        const from_constructor = new Segment(start, end);
        const from_static = Segment.from_points(start, end);
        expect(from_static.point.x).to.be.approximately(
            from_constructor.point.x,
            0.001,
        );
        expect(from_static.point.y).to.be.approximately(
            from_constructor.point.y,
            0.001,
        );
        expect(from_static.direction.x).to.be.approximately(
            from_constructor.direction.x,
            0.001,
        );
        expect(from_static.direction.y).to.be.approximately(
            from_constructor.direction.y,
            0.001,
        );
        expect(from_static.get_vector_at(1).x).to.be.approximately(
            end.x,
            0.001,
        );
        expect(from_static.get_vector_at(1).y).to.be.approximately(
            end.y,
            0.001,
        );
    });

    it("cpy() returns a Segment (not a plain Line)", () => {
        const segment = new Segment(new Vector2(0, 0), new Vector2(4, 2));
        const copy = segment.cpy();
        expect(copy).to.be.instanceOf(Segment);
        expect(copy.get_segment_intersections).to.be.a("function");
        expect(copy.point.x).to.be.approximately(segment.point.x, 0.001);
        expect(copy.point.y).to.be.approximately(segment.point.y, 0.001);
        expect(copy.direction.x).to.be.approximately(
            segment.direction.x,
            0.001,
        );
        expect(copy.direction.y).to.be.approximately(
            segment.direction.y,
            0.001,
        );
    });

    it("get_vector_projection returns a t usable with get_vector_at, even for a non-normalized direction", () => {
        const segment = new Segment(new Vector2(0, 0), new Vector2(10, 0));
        const t = segment.get_vector_projection(new Vector2(4, 3));
        expect(t).to.be.approximately(0.4, 0.001);
        const projected = segment.get_vector_at(t);
        expect(projected.x).to.be.approximately(4, 0.001);
        expect(projected.y).to.be.approximately(0, 0.001);
    });

    it("get_segment_intersections returns nothing when the intersection falls outside the bounded segment", () => {
        const segment = new Segment(new Vector2(0, 0), new Vector2(1, 1));
        // This line crosses the infinite extension of `segment`, but far outside its [0, 1] bounds.
        const far_line = new Segment(new Vector2(5, -5), new Vector2(5, 5));
        expect(segment.get_segment_intersections(far_line)).to.have.length(0);
    });
});
