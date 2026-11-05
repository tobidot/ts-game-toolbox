/**
 * Feedback that shows for a moment over a game's usual message ("Zu wenig Gold"): a game shows it
 * from an input handler, runs it down in `update()`, and reads `text` where it paints or says the
 * message. Null when nothing is showing.
 */
export class TimedNotice {
    private _text: string | null = null;
    private seconds_left = 0;

    public get text(): string | null {
        return this._text;
    }

    public show(text: string, seconds: number): void {
        this._text = text;
        this.seconds_left = seconds;
    }

    public clear(): void {
        this._text = null;
        this.seconds_left = 0;
    }

    public update(delta_seconds: number): void {
        this.seconds_left -= delta_seconds;
        if (this.seconds_left <= 0) {
            this._text = null;
        }
    }
}
