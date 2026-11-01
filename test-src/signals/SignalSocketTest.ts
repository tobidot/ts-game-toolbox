import { TestClass, EventSocket, EventBase, Rect } from "../../src";

/**
 * Event for the red channel
 */
class RedChannelEvent extends EventBase {
    public static readonly EVENT_NAME = "channel.red";
    public constructor() {
        super(RedChannelEvent.EVENT_NAME);
    }
}

/**
 * Event for the green channel
 */
class GreenChannelEvent extends EventBase {
    public static readonly EVENT_NAME = "channel.green";
    public constructor() {
        super(GreenChannelEvent.EVENT_NAME);
    }
}

/**
 * Event for the blue channel
 */
class BlueChannelEvent extends EventBase {
    public static readonly EVENT_NAME = "channel.blue";
    public constructor() {
        super(BlueChannelEvent.EVENT_NAME);
    }
}

/**
 * Represents a subscriber box that pulses when it receives an event
 */
class SubscriberBox {
    public last_pulse_at: number | null = null;
    public event_count = 0;

    public constructor(
        public readonly rect: Rect,
        public readonly color: string,
        public readonly label: string,
    ) {}

    public pulse(): void {
        this.last_pulse_at = performance.now();
        this.event_count++;
    }

    public draw(ctx: CanvasRenderingContext2D, now: number): void {
        const pulse_duration = 500;
        let scale = 1.0;
        let highlight = 0;

        if (this.last_pulse_at !== null) {
            const elapsed = now - this.last_pulse_at;
            if (elapsed < pulse_duration) {
                const progress = elapsed / pulse_duration;
                // Pulse effect: scale up and then back down
                scale = 1.0 + Math.sin(progress * Math.PI) * 0.15;
                highlight = 1.0 - progress;
            } else {
                this.last_pulse_at = null;
            }
        }

        ctx.save();
        ctx.translate(
            this.rect.left + this.rect.width / 2,
            this.rect.top + this.rect.height / 2,
        );
        ctx.scale(scale, scale);

        // Draw main box
        ctx.fillStyle = this.color;
        ctx.globalAlpha = 0.7 + highlight * 0.3;
        ctx.fillRect(
            -this.rect.width / 2,
            -this.rect.height / 2,
            this.rect.width,
            this.rect.height,
        );

        // Draw highlight border
        ctx.strokeStyle = "white";
        ctx.lineWidth = 2 + highlight * 4;
        ctx.strokeRect(
            -this.rect.width / 2,
            -this.rect.height / 2,
            this.rect.width,
            this.rect.height,
        );

        // Draw label
        ctx.fillStyle = "white";
        ctx.font = "bold 14px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.globalAlpha = 1.0;
        ctx.fillText(this.label, 0, -5);
        ctx.font = "12px sans-serif";
        ctx.fillText(`Received: ${this.event_count}`, 0, 15);

        ctx.restore();
    }
}

/**
 * Represents an emitter button
 */
class EmitterButton {
    public constructor(
        public readonly rect: Rect,
        public readonly color: string,
        public readonly label: string,
        public readonly on_click: () => void,
    ) {}

    public draw(ctx: CanvasRenderingContext2D): void {
        ctx.fillStyle = this.color;
        ctx.fillRect(
            this.rect.left,
            this.rect.top,
            this.rect.width,
            this.rect.height,
        );
        ctx.strokeStyle = "rgba(0, 0, 0, 0.3)";
        ctx.lineWidth = 2;
        ctx.strokeRect(
            this.rect.left,
            this.rect.top,
            this.rect.width,
            this.rect.height,
        );

        ctx.fillStyle = "white";
        ctx.font = "14px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(
            this.label,
            this.rect.left + this.rect.width / 2,
            this.rect.top + this.rect.height / 2,
        );
    }

    public is_hit(x: number, y: number): boolean {
        return (
            x >= this.rect.left &&
            x <= this.rect.get_right() &&
            y >= this.rect.top &&
            y <= this.rect.get_bottom()
        );
    }
}

export class SignalSocketTest extends TestClass {
    private animation_frame: number | null = null;
    private event_socket = new EventSocket<EventBase>();
    private total_dispatched = 0;
    private canvas_listener: ((e: MouseEvent) => void) | null = null;
    private canvas_element: HTMLCanvasElement | null = null;

    public get_name(): string {
        return "Signals: Pub/Sub Event Bus";
    }

    public override tear_down(): void {
        if (this.animation_frame !== null) {
            cancelAnimationFrame(this.animation_frame);
            this.animation_frame = null;
        }
        if (this.canvas_listener !== null && this.canvas_element !== null) {
            this.canvas_element.removeEventListener(
                "mousedown",
                this.canvas_listener,
            );
            this.canvas_listener = null;
            this.canvas_element = null;
        }
        this.event_socket.detach_all();
    }

    public test_pub_sub_demo(): void {
        const test_container =
            document.querySelector(".test-dashboard__test-container") ||
            document.body;

        const canvas = document.createElement("canvas");
        this.canvas_element = canvas;
        canvas.width = 500;
        canvas.height = 320;
        canvas.className = "test-dashboard__demo-canvas";
        test_container.appendChild(canvas);

        const ctx = canvas.getContext("2d")!;

        const subscribers = [
            new SubscriberBox(new Rect(350, 40, 100, 60), "#dc2626", "Red Sub"),
            new SubscriberBox(
                new Rect(350, 130, 100, 60),
                "#16a34a",
                "Green Sub",
            ),
            new SubscriberBox(
                new Rect(350, 220, 100, 60),
                "#2563eb",
                "Blue Sub",
            ),
        ];

        this.event_socket.attach(RedChannelEvent, () => subscribers[0].pulse());
        this.event_socket.attach(GreenChannelEvent, () =>
            subscribers[1].pulse(),
        );
        this.event_socket.attach(BlueChannelEvent, () =>
            subscribers[2].pulse(),
        );

        const emitters = [
            new EmitterButton(
                new Rect(50, 40, 120, 40),
                "#991b1b",
                "Emit Red",
                () => {
                    this.event_socket.dispatch(new RedChannelEvent());
                    this.total_dispatched++;
                },
            ),
            new EmitterButton(
                new Rect(50, 130, 120, 40),
                "#166534",
                "Emit Green",
                () => {
                    this.event_socket.dispatch(new GreenChannelEvent());
                    this.total_dispatched++;
                },
            ),
            new EmitterButton(
                new Rect(50, 220, 120, 40),
                "#1e40af",
                "Emit Blue",
                () => {
                    this.event_socket.dispatch(new BlueChannelEvent());
                    this.total_dispatched++;
                },
            ),
        ];

        this.canvas_listener = (e: MouseEvent) => {
            const rect = canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            emitters.forEach((emitter) => {
                if (emitter.is_hit(x, y)) {
                    emitter.on_click();
                }
            });
        };

        canvas.addEventListener("mousedown", this.canvas_listener);

        const render = () => {
            const now = performance.now();
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            // Draw connections (background)
            ctx.strokeStyle = "#e5e7eb";
            ctx.setLineDash([5, 5]);
            ctx.lineWidth = 1;
            for (let i = 0; i < emitters.length; i++) {
                ctx.beginPath();
                ctx.moveTo(
                    emitters[i].rect.get_right(),
                    emitters[i].rect.top + emitters[i].rect.height / 2,
                );
                ctx.lineTo(
                    subscribers[i].rect.left,
                    subscribers[i].rect.top + subscribers[i].rect.height / 2,
                );
                ctx.stroke();
            }
            ctx.setLineDash([]);

            // Draw labels
            ctx.fillStyle = "#6b7280";
            ctx.font = "italic 12px sans-serif";
            ctx.textAlign = "center";
            ctx.fillText("PUBLISHERS", 110, 25);
            ctx.fillText("SUBSCRIBERS", 400, 25);

            emitters.forEach((emitter) => emitter.draw(ctx));
            subscribers.forEach((subscriber) => subscriber.draw(ctx, now));

            ctx.fillStyle = "#111827";
            ctx.font = "bold 14px sans-serif";
            ctx.textAlign = "left";
            ctx.fillText(
                `Total Events Dispatched: ${this.total_dispatched}`,
                10,
                canvas.height - 15,
            );

            this.animation_frame = requestAnimationFrame(render);
        };

        render();

        console.log(
            "Signals pub/sub demo created. This demo showcases decoupled communication using EventSocket. " +
                "Click the emitter buttons to dispatch events; notice how only the corresponding subscriber responds " +
                "without being directly coupled to the emitter.",
        );
    }
}
