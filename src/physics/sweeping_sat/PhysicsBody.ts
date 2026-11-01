import { Vector2, Vector2I } from "../../geometries";
import { Polygon, PolygonI } from "../../geometries/Polygon";

export class PhysicsBody<REFERENCE> {
    public reference: REFERENCE | null = null;
    public position: Vector2;
    public shape: Polygon;
    public velocity: Vector2;
    public is_static: boolean;

    public constructor(
        shape: PolygonI,
        position: Vector2I = { x: 0, y: 0 },
        velocity: Vector2I = { x: 0, y: 0 },
        is_static: boolean = false,
    ) {
        this.shape = new Polygon(shape.points);
        this.position = new Vector2(position);
        this.velocity = new Vector2(velocity);
        this.is_static = is_static;
    }
}
