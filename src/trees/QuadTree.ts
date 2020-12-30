import { TreeElementNotFoundException } from "./exceptions/TreeElementNotFoundException";
import { IRect, Rect } from "../geometries/Rect";

export class QuadTree<T extends IRect> {
    private root_branch: QuadTreeBranch<T>;

    constructor(base_rect: IRect) {
        this.root_branch = new QuadTreeBranch<T>(base_rect.x, base_rect.y, base_rect.w, base_rect.h);
    }

    public pick(rect: IRect): Array<T> {
        return this.root_branch.pick(rect);
    }

    public add(element: T): void {
        let is_within = Rect.is_within(element, this.root_branch);
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
        const extend_top_left_rect = {
            x: old_root_branch.x - old_root_branch.w,
            y: old_root_branch.y - old_root_branch.h,
            w: old_root_branch.w * 2,
            h: old_root_branch.h * 2,
        };
        const extend_bottom_right_rect = {
            x: extend_top_left_rect.x,
            y: extend_top_left_rect.y,
            w: extend_top_left_rect.w * 2,
            h: extend_top_left_rect.h * 2,
        };

        this.wrap_root_node_in_node_with_rect(extend_top_left_rect, 2);
        this.wrap_root_node_in_node_with_rect(extend_bottom_right_rect, 0);
    }

    public wrap_root_node_in_node_with_rect(rect: IRect, node_pos: 0 | 1 | 2 | 3) {
        const wrapper_node = new QuadTreeBranch<T>(
            rect.x,
            rect.y,
            rect.w,
            rect.h,
        );
        wrapper_node.create_child_branches();
        if (!wrapper_node.child_branch_nodes) throw new Error();
        wrapper_node.child_branch_nodes[node_pos] = this.root_branch;
        this.root_branch = wrapper_node;
    }

    public change_element(element: T, rect: IRect) {
        this.remove(element);
        element.x = rect.x;
        element.y = rect.y;
        element.w = rect.w;
        element.h = rect.h;
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

export class QuadTreeBranch<T extends IRect> extends Rect {
    public child_branch_nodes: [QuadTreeBranch<T>, QuadTreeBranch<T>, QuadTreeBranch<T>, QuadTreeBranch<T>] | null = null;
    public elements: Array<T> = [];

    public add(element: T): boolean {
        if (this.child_branch_nodes === null) {
            this.elements.push(element);
            this.create_child_branches_if_necessary();
            return true;
        };
        const overlapping_branches = this.child_branch_nodes.filter((branch) => {
            return branch.overlaps_with(element);
        }, []);
        if (overlapping_branches.length === 0) throw Error('Inconsistent Result');
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
        const w_half = this.w / 2;
        const h_half = this.h / 2;
        this.child_branch_nodes = [
            new QuadTreeBranch<T>(this.x, this.y, w_half, h_half),
            new QuadTreeBranch<T>(this.x + w_half, this.y, w_half, h_half),
            new QuadTreeBranch<T>(this.x + w_half, this.y + h_half, w_half, h_half),
            new QuadTreeBranch<T>(this.x, this.y + h_half, w_half, h_half),
        ];
    }

    public pick(rect: IRect, result: Array<T> = []): Array<T> {
        if (!this.overlaps_with(rect)) return result;
        result.push(...this.elements.filter((element) => Rect.overlap(rect, element)));
        if (this.child_branch_nodes === null) return result;
        if (this.is_within(rect)) return this.pick_all(result);
        for (let branch of this.child_branch_nodes) {
            branch.pick(rect, result);
        }
        return result;
    }

    public pick_all(result: Array<T>): Array<T> {
        result.push(...this.elements);
        if (this.child_branch_nodes === null) return result;
        for (let branch of this.child_branch_nodes) {
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
        for (let branch of this.child_branch_nodes) {
            if (branch.remove(element)) return true;
        }
        return false;
    }

    public is_empty(): boolean {
        if (!this.is_self_empty()) return false;
        if (this.child_branch_nodes === null) return true;
        for (let branch of this.child_branch_nodes) {
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
                })
            }
        }
    }
}