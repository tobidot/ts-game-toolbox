import { QuadTree } from "./QuadTree";
import { TreeElementNotFoundException } from "./exceptions/TreeElementNotFoundException";
export * from "./QuadTree";
export * from "./exceptions/TreeElementNotFoundException";

export const trees = {
    exceptions: {
        TreeElementNotFoundException,
    },
    QuadTree,
}