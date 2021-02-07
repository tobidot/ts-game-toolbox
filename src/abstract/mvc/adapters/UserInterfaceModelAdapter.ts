import { Rect } from "../../../geometries/Rect";
import { Vector2I } from "../../../geometries/Vector2";

export interface UserInterfaceAdaptable {
    collider: Rect;
    is_clickable: boolean;
}

export class UserInterfaceModelAdapter {
    protected constructor(public target: UserInterfaceAdaptable) { }

    public is_clicked(in_game_mouse_position: Vector2I): boolean {
        return (this.target.collider.contains(in_game_mouse_position))
            && this.target.is_clickable;
    }

    /**
     * Static Functions
     */
    private static instance?: UserInterfaceModelAdapter;

    public static for(target: UserInterfaceAdaptable): UserInterfaceModelAdapter {
        if (!UserInterfaceModelAdapter.instance) {
            UserInterfaceModelAdapter.instance = new UserInterfaceModelAdapter(target);
        }
        UserInterfaceModelAdapter.instance.target = target;
        return UserInterfaceModelAdapter.instance;
    }
}