import { ViewCollectionBase } from "../Collections";

export interface ViewInterface {
    update: (() => void) | null;
    draw: () => void;
    set_update: (update: () => void) => this;
}

export function is_view_interface(view: any): view is ViewInterface {
    return view instanceof View;
}
export class View<VIEW_COLLECTION extends ViewCollectionBase> implements ViewInterface {
    public constructor(protected collection: VIEW_COLLECTION) {

    }
    public update: (() => void) | null = null;
    public draw() { };

    public set_update(update: () => void): this {
        this.update = update;
        return this;
    }
}