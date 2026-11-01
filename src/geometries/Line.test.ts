import { Line } from "./Line";
import { Segment } from "./Segment";
import { Vector2 } from "./Vector2";
import { Ray } from "./Ray";
import { expect } from "chai";

describe("Line", () => {
    it("intersects", () => {
        // point + direction, where direction is the raw (non-normalized) vector towards the other point.
        const line = new Line(new Vector2(0, 0), new Vector2(1, 1));
        const line2 = new Line(new Vector2(1, 0), new Vector2(-1, 1));
        expect(line.get_ray_projection(line2)).to.be.approximately(0.5, 0.01);
        expect(line2.get_ray_projection(line)).to.be.approximately(0.5, 0.01);
        const intersections = line.get_ray_intersections(line2);
        expect(intersections[0].x).to.be.approximately(0.5, 0.01);
        expect(intersections[0].y).to.be.approximately(0.5, 0.01);
    });

    it("is unrestricted: it still intersects far outside a [0, 1] segment range", () => {
        // `line` only passes through the origin at t=0 and (1,1) at t≈1.41 (normalized direction),
        // but as an infinite Line it must still report the intersection with `other`
        // even though it lies far beyond that range.
        const line = Line.from_points(new Vector2(0, 0), new Vector2(1, 1));
        const other = Line.from_points(
            new Vector2(10, -10),
            new Vector2(10, 10),
        );
        const intersections = line.get_ray_intersections(other);
        expect(intersections).to.have.length(1);
        expect(intersections[0].x).to.be.approximately(10, 0.01);
        expect(intersections[0].y).to.be.approximately(10, 0.01);

        // The equivalent bounded Segment between the same two points does NOT
        // reach that far, demonstrating that Line is the more general shape.
        const segment = new Segment(new Vector2(0, 0), new Vector2(1, 1));
        expect(segment.get_segment_intersections(other)).to.have.length(0);
    });

    it("from_points normalizes the direction and matches the constructor", () => {
        const start = new Vector2(3, 4);
        const end = new Vector2(7, 1);
        const from_static = Line.from_points(start, end);
        expect(from_static.point.x).to.be.approximately(start.x, 0.001);
        expect(from_static.point.y).to.be.approximately(start.y, 0.001);
        expect(from_static.direction.len()).to.be.approximately(1, 0.001);
    });

    it("cpy() returns a Line", () => {
        const line = new Line(new Vector2(0, 0), new Vector2(4, 2));
        const copy = line.cpy();
        expect(copy).to.be.instanceOf(Line);
        expect(copy.point.x).to.be.approximately(line.point.x, 0.001);
        expect(copy.point.y).to.be.approximately(line.point.y, 0.001);
        expect(copy.direction.x).to.be.approximately(line.direction.x, 0.001);
        expect(copy.direction.y).to.be.approximately(line.direction.y, 0.001);
    });

    it("get_vector_projection returns a t usable with get_vector_at, even for a non-normalized direction", () => {
        const line = new Line(new Vector2(0, 0), new Vector2(10, 0));
        const t = line.get_vector_projection(new Vector2(4, 3));
        expect(t).to.be.approximately(0.4, 0.001);
        const projected = line.get_vector_at(t);
        expect(projected.x).to.be.approximately(4, 0.001);
        expect(projected.y).to.be.approximately(0, 0.001);
    });

    it("Ray extends Line and shares its projection math", () => {
        const line = new Line(new Vector2(0, 0), new Vector2(1, 1));
        const ray = new Ray(new Vector2(1, 0), new Vector2(-1, 0));
        expect(line.get_ray_projection(ray)).to.be.approximately(0.0, 0.01);
        expect(ray.get_ray_projection(line)).to.be.approximately(1.0, 0.01);
        const ray_intersections = line.get_ray_intersections(ray);
        expect(ray_intersections[0].x).to.be.approximately(0.0, 0.01);
        expect(ray_intersections[0].y).to.be.approximately(0.0, 0.01);
    });
});
