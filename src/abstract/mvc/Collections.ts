import { CollectionTree } from "../../trees/Collection";
import { ControllerInterface } from "./Controller";
import { ModelInterface } from "./Model";
import { ViewInterface } from "./View";

export interface ModelCollectionBase extends CollectionTree<ModelInterface> { }
export interface ViewCollectionBase extends CollectionTree<ViewInterface> { }
export interface ControllerCollectionBase extends CollectionTree<ControllerInterface> { }
