import { Rect } from "../../../../geometries/Rect";
import { Vector2I } from "../../../../geometries/Vector2";

export interface UserInterfaceAdaptable<INTERFACE_ACTION> {
    collider: Rect;
    is_clickable: boolean;
    click: (target: Vector2I) => INTERFACE_ACTION | null
}

export class UserInterfaceModelAdapter<INTERFACE_ACTION> {
    protected constructor(public target: UserInterfaceAdaptable<INTERFACE_ACTION>) { }

    public is_clicked(in_game_mouse_position: Vector2I): boolean {
        return (this.target.collider.contains(in_game_mouse_position))
            && this.target.is_clickable;
    }

    public click(in_game_mouse_position: Vector2I): INTERFACE_ACTION | null {
        return this.target.click(in_game_mouse_position);
    }

    /**
     * Static Functions
     */
    private static instance?: UserInterfaceModelAdapter<any>;

    public static for<INTERFACE_ACTION>(target: UserInterfaceAdaptable<INTERFACE_ACTION>): UserInterfaceModelAdapter<INTERFACE_ACTION> {
        if (!UserInterfaceModelAdapter.instance) {
            UserInterfaceModelAdapter.instance = new UserInterfaceModelAdapter(target);
        }
        UserInterfaceModelAdapter.instance.target = target;
        return UserInterfaceModelAdapter.instance;
    }
}