import { QuadTree } from "./QuadTree";
import { TreeElementNotFoundException } from "./exceptions/TreeElementNotFoundException";
export * from "./QuadTree";
export * from "./exceptions/TreeElementNotFoundException";

export var trees = {
    exceptions: {
        TreeElementNotFoundException,
    },
    QuadTree,
}