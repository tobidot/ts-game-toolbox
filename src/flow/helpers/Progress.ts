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
     * Includes progress from all child tasks.
     */
    public get_percent(): number {
        if (this.max <= 0) {
            return 100;
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
