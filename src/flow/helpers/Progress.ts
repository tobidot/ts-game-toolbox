/**
 * This class is meant to abstract a process that takes longer time.
 * Allowing things like loading bars while it is being processed.
 */
export class Progress {
    protected max: number = 1;
    protected current: number = 0;
    protected listeners: Array<ProgressListener> = [];
    protected children: Array<Progress> = [];

    public constructor(max: number = 1) {
        this.max = max;
    }

    /**
     * Attach a callback that will be notified when progress changes.
     */
    public listen(callback: (percent: number, self: Progress) => void): void {
        this.listeners.push(callback);
    }

    public set_self_progress(current: number): void {
        this.current = current;
        this.notify_listeners();
    }

    /**
     * Get the current progress as a decimal between 0 and 1.
     * Includes progress from all child tasks. A task with nothing to do is done.
     */
    public get_percent(): number {
        if (this.max <= 0) {
            return 1;
        }
        const children_progress = this.children.reduce(
            (acc, child) => acc + child.get_percent(),
            0,
        );
        return (this.current + children_progress) / this.max;
    }

    /**
     * Create a child progress task that contributes to this task's total progress.
     * @param max The "weight" or maximum value of the child task
     */
    public make_child_progress(max: number): Progress {
        const child = new Progress(max);
        child.listen(() => {
            this.notify_listeners();
        });
        this.children.push(child);
        return child;
    }

    /**
     * A child task for work that arrives while this one runs (files requested one by one): this
     * task's total grows by one, the child's share. Start such a task with `new Progress(0)`.
     * @param max The child's own maximum, as in `make_child_progress`
     */
    public append_child_progress(max: number = 1): Progress {
        this.max += 1;
        const child = this.make_child_progress(max);
        this.notify_listeners();
        return child;
    }

    /**
     * Mark this task as 100% complete.
     */
    public mark_as_done(): void {
        this.current = this.max;
        this.notify_listeners();
    }

    public notify_listeners(): void {
        const percent = this.get_percent();
        for (const listener of this.listeners) {
            listener(percent, this);
        }
    }
}

type ProgressListener = (percent: number, self: Progress) => void;
