import { Line } from "./Line";
import { Vector2 } from "./Vector2";
import { Ray } from "./Ray";
import { expect } from "chai";

describe('Line', () => {
    it('intersects', () => {
        const line = new Line(new Vector2(0, 0), new Vector2(1, 1));
        const line2 = new Line(new Vector2(1, 0), new Vector2(0, 1));
        expect(line.get_ray_projection(line2)).to.be.approximately(0.5, 0.01);
        expect(line2.get_ray_projection(line)).to.be.approximately(0.5, 0.01);
        const intersections = line.get_line_intersections(line2);
        expect(intersections[0].x).to.be.approximately(0.5, 0.01);
        expect(intersections[0].y).to.be.approximately(0.5, 0.01);
        const ray = new Ray(new Vector2(1, 0), new Vector2(-1, 0));
        expect(line.get_ray_projection(ray)).to.be.approximately(0.0, 0.01);
        expect(ray.get_ray_projection(line)).to.be.approximately(1.0, 0.01);
        const ray_intersections = line.get_ray_intersections(ray);
        expect(ray_intersections[0].x).to.be.approximately(0.0, 0.01);
        expect(ray_intersections[0].y).to.be.approximately(0.0, 0.01);
    })
});