import { TreeElementNotFoundException } from "./exceptions/TreeElementNotFoundException";
import { RectI, Rect } from "../geometries/Rect";

export class QuadTree<T extends RectI> {
    private root_branch: QuadTreeBranch<T>;

    constructor(base_rect: RectI) {
        this.root_branch = new QuadTreeBranch<T>(base_rect);
    }

    public pick(rect: RectI): Array<T> {
        return this.root_branch.pick(rect);
    }

    public add(element: T): void {
        const is_within = Rect.is_within(element, this.root_branch);
        if (is_within) {
            this.root_branch.add(element);
        } else {
            this.elevate_root_branch();
            this.add(element);
        }
    }

    /**
     * First wrap the root in a branch that contains the root at the bottom right,
     * then create a branch wich has that new branch in the bottom left,
     * like that the tree expands in all directions
     */
    public elevate_root_branch() {
        const old_root_branch = this.root_branch;
        const extend_top_left_rect: RectI = {
            top: old_root_branch.top - old_root_branch.height,
            left: old_root_branch.left - old_root_branch.width,
            width: old_root_branch.width * 2,
            height: old_root_branch.height * 2,
        };
        const extend_bottom_right_rect: RectI = {
            top: extend_top_left_rect.top,
            left: extend_top_left_rect.left,
            width: extend_top_left_rect.width * 2,
            height: extend_top_left_rect.height * 2,
        };

        this.wrap_root_node_in_node_with_rect(extend_top_left_rect, 2);
        this.wrap_root_node_in_node_with_rect(extend_bottom_right_rect, 0);
    }

    public wrap_root_node_in_node_with_rect(
        rect: RectI,
        node_pos: 0 | 1 | 2 | 3,
    ) {
        const wrapper_node = new QuadTreeBranch<T>(rect);
        wrapper_node.create_child_branches();
        if (!wrapper_node.child_branch_nodes) throw new Error();
        wrapper_node.child_branch_nodes[node_pos] = this.root_branch;
        this.root_branch = wrapper_node;
    }

    public change_element(element: T, rect: RectI) {
        this.remove(element);
        element.top = rect.top;
        element.left = rect.left;
        element.width = rect.width;
        element.height = rect.height;
        this.add(element);
    }

    public remove(element: T) {
        if (!this.root_branch.remove(element)) {
            throw new TreeElementNotFoundException();
        }
    }

    public is_empty(): boolean {
        return this.root_branch.is_empty();
    }

    public clear() {
        this.root_branch.clear(8);
    }
}

export class QuadTreeBranch<T extends RectI> extends Rect {
    public child_branch_nodes:
        | [
              QuadTreeBranch<T>,
              QuadTreeBranch<T>,
              QuadTreeBranch<T>,
              QuadTreeBranch<T>,
          ]
        | null = null;
    public elements: Array<T> = [];

    public add(element: T): boolean {
        if (this.child_branch_nodes === null) {
            this.elements.push(element);
            this.create_child_branches_if_necessary();
            return true;
        }
        const overlapping_branches = this.child_branch_nodes.filter(
            (branch) => {
                return branch.intersects(element);
            },
            [],
        );
        if (overlapping_branches.length === 0)
            throw Error("Inconsistent Result");
        if (overlapping_branches.length === 1) {
            overlapping_branches[0].add(element);
        } else {
            this.elements.push(element);
        }
        return true;
    }

    public readd_own_elements(): void {
        const elements = this.elements.splice(0);
        elements.forEach((element) => {
            this.add(element);
        });
    }

    public create_child_branches_if_necessary() {
        if (this.elements.length < 10) return;
        this.create_child_branches();
        this.readd_own_elements();
    }

    public create_child_branches() {
        const w_half = this.width / 2;
        const h_half = this.height / 2;
        this.child_branch_nodes = [
            new QuadTreeBranch<T>({
                left: this.left,
                top: this.top,
                width: w_half,
                height: h_half,
            }),
            new QuadTreeBranch<T>({
                left: this.left + w_half,
                top: this.top,
                width: w_half,
                height: h_half,
            }),
            new QuadTreeBranch<T>({
                left: this.left + w_half,
                top: this.top + h_half,
                width: w_half,
                height: h_half,
            }),
            new QuadTreeBranch<T>({
                left: this.left,
                top: this.top + h_half,
                width: w_half,
                height: h_half,
            }),
        ];
    }

    public pick(rect: RectI, result: Array<T> = []): Array<T> {
        if (!this.intersects(rect)) return result;
        result.push(
            ...this.elements.filter((element) =>
                Rect.intersects(rect, element),
            ),
        );
        if (this.child_branch_nodes === null) return result;
        if (this.is_within(rect)) return this.pick_all(result);
        for (const branch of this.child_branch_nodes) {
            branch.pick(rect, result);
        }
        return result;
    }

    public pick_all(result: Array<T>): Array<T> {
        result.push(...this.elements);
        if (this.child_branch_nodes === null) return result;
        for (const branch of this.child_branch_nodes) {
            branch.pick_all(result);
        }
        return result;
    }

    public remove(element: T): boolean {
        const id = this.elements.indexOf(element);
        if (id !== -1) {
            this.elements.splice(id, 1);
            return true;
        }
        if (this.child_branch_nodes === null) return false;
        for (const branch of this.child_branch_nodes) {
            if (branch.remove(element)) return true;
        }
        return false;
    }

    public is_empty(): boolean {
        if (!this.is_self_empty()) return false;
        if (this.child_branch_nodes === null) return true;
        for (const branch of this.child_branch_nodes) {
            if (!branch.is_empty()) return false;
        }
        return true;
    }

    public is_self_empty(): boolean {
        return this.elements.length === 0;
    }

    public clear(max_levels_deep: number) {
        this.elements.splice(0);
        if (this.child_branch_nodes) {
            if (max_levels_deep <= 0) {
                this.child_branch_nodes = null;
            } else {
                this.child_branch_nodes.forEach((node) => {
                    node.clear(max_levels_deep - 1);
                });
            }
        }
    }
}
