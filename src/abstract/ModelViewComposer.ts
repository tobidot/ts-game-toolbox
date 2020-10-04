import p5 from "p5";

/**
 * Use to handle all your logic and data in this class,
 * no other class except controllers should directly access its properties.
 * Most of the properties should be Observable, 
 * to allow for to pass a readonly reference to the view
 */
export class Model {
    /**
     * Most likely used if the model is regularly updated
     * 
     * @param delta_ms time passed
     */
    public update(delta_ms: number) {

    }
}

export abstract class View {
    public abstract load(): void;
    public abstract unload(): void;
    public abstract draw(): void;
}

export class ViewManager {
    public constructor(protected p: p5, protected active_view: View | null = null) {

    }

    public set_view(view: View): View {
        if (this.active_view) this.active_view.unload();
        this.active_view = view;
        this.active_view.load();
        return view;
    }

    public draw() {
        if (this.active_view) this.active_view.draw();
    }
}


/**
 * This class has a function for each "interaction" with the game.
 * It is supposed to be minimal and only decide,
 * what data from the model gets shoved to the view.
 */
export class Controller<MODEL extends Model, VIEW_MANAGER extends ViewManager> {
    /**
     * 
     * @param model 
     * @param view 
     */
    public constructor(public model: MODEL, public view_manager: VIEW_MANAGER) {

    }

    public draw() {
        this.view_manager.draw();
    }

    public update(ms: number) {
        this.model.update(ms);
    }
}