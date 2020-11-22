import { Model } from "./mvc/Model";
import { View } from "./mvc/View";
import { Controller } from "./mvc/Controller";
import { CanvasView } from "./mvc/CanvasView";
import { ControllerEventConstructor } from "./mvc/helpers/ControllerEvent";
import { MvcGame as MvcGame } from "./mvc/MVCgame";
import { MvcCanvasGame } from "./mvc/MvcCanvasGame";

export var abstract = {
    mvc: {
        MvcGame,
        MvcCanvasGame,
        CanvasView,
        Model,
        View,
        Controller,


        helpers: {
            ControllerEventConstructor
        }
    }
};