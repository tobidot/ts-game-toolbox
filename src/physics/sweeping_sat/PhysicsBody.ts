import { Vector2, Vector2I } from "../../geometries";
import { Polygon, PolygonI } from "../../geometries/Polygon";

export class PhysicsBody<REFERENCE> {
    public reference: REFERENCE | null = null;
    public position: Vector2;
    public shape: Polygon;

    public constructor(
        shape: PolygonI,
        position: Vector2I = { x: 0, y: 0 },
    ) {
        this.shape = new Polygon(shape.points);
        this.position = new Vector2(position);
    }
}
