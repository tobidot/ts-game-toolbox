import { CollectionTree } from "../../trees/Collection";
import { ControllerInterface } from "./controllers/Controller";
import { ModelInterface } from "./models/Model";
import { ViewInterface } from "./views/View";

export interface ModelCollectionBase extends CollectionTree<ModelInterface> { }
export interface ViewCollectionBase extends CollectionTree<ViewInterface> { }
export interface ControllerCollectionBase extends CollectionTree<ControllerInterface> { }
