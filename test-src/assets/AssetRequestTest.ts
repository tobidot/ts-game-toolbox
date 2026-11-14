import { TestClass } from "../../src";
import { AssetLoad, AssetManager, Rect } from "../../src";

const COLUMNS = 6;
const ROWS = 3;
const TILE = 96;
const GAP = 8;
const TOP = 56;
const HUES = [210, 150, 0, 270, 30, 190];

/** A picture made on the spot, as PNG bytes. */
function make_picture(index: number): Promise<Blob> {
    const canvas = document.createElement("canvas");
    canvas.width = 160;
    canvas.height = 160;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = `hsl(${HUES[index % HUES.length]}, 60%, 45%)`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 56px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(index + 1), canvas.width / 2, canvas.height / 2);
    return new Promise((resolve) => {
        canvas.toBlob((blob) => {
            resolve(blob!);
        }, "image/png");
    });
}

/**
 * A slow network for the demo: `/slides/<n>.png` is a picture made on the spot, sent in
 * chunks over about a second; `/slides/missing.png` is a 404.
 */
function slow_fetch(url: string): Promise<Response> {
    const match = /\/slides\/(\d+)\.png$/.exec(url);
    if (match === null) {
        return Promise.resolve(new Response(null, { status: 404 }));
    }
    return make_picture(Number(match[1])).then(async (blob) => {
        const bytes = new Uint8Array(await blob.arrayBuffer());
        const chunks = 10;
        const chunk_ms = 60 + Math.random() * 120;
        const body = new ReadableStream<Uint8Array>({
            async start(controller) {
                for (let index = 0; index < chunks; index++) {
                    await new Promise((resolve) => {
                        setTimeout(resolve, chunk_ms);
                    });
                    const from = Math.floor((index * bytes.length) / chunks);
                    const to = Math.floor(
                        ((index + 1) * bytes.length) / chunks,
                    );
                    controller.enqueue(bytes.slice(from, to));
                }
                controller.close();
            },
        });
        return new Response(body, {
            headers: new Headers([
                ["Content-Type", "image/png"],
                ["Content-Length", String(bytes.length)],
            ]),
        });
    });
}

const STATE_COLORS: Record<AssetLoad["state"], string> = {
    queued: "#cbd5e1",
    loading: "#93c5fd",
    ready: "#16a34a",
    failed: "#dc2626",
};

/**
 * `AssetManager.request()`: files wait in a queue and load two at a time, lowest priority
 * first. A click on a waiting tile moves it to the front. Spielwerk step 28 (Artbook) loads a
 * whole catalogue this way.
 */
export class AssetRequestTest extends TestClass {
    private animation_frame: number | null = null;
    private canvas: HTMLCanvasElement | null = null;
    private click_handler: ((event: MouseEvent) => void) | null = null;

    public get_name(): string {
        return "Assets: request() queue";
    }

    public override tear_down() {
        if (this.animation_frame !== null) {
            cancelAnimationFrame(this.animation_frame);
            this.animation_frame = null;
        }
        if (this.canvas !== null && this.click_handler !== null) {
            this.canvas.removeEventListener("click", this.click_handler);
        }
        this.canvas = null;
        this.click_handler = null;
    }

    public test_request_queue() {
        const test_container =
            document.querySelector(".test-dashboard__test-container") ||
            document.body;
        const canvas = document.createElement("canvas");
        canvas.width = GAP + COLUMNS * (TILE + GAP);
        canvas.height = TOP + ROWS * (TILE + GAP) + 28;
        canvas.className = "test-dashboard__demo-canvas";
        test_container.appendChild(canvas);
        this.canvas = canvas;
        const ctx = canvas.getContext("2d")!;

        const assets = new AssetManager({ fetch: slow_fetch });
        assets.max_parallel = 2;
        const tiles: Array<{ name: string; rect: Rect }> = [];
        for (let index = 0; index < COLUMNS * ROWS; index++) {
            const column = index % COLUMNS;
            const row = Math.floor(index / COLUMNS);
            const name = `slide-${index + 1}`;
            const is_missing = index === 7;
            assets.request({
                name,
                url: is_missing
                    ? "/slides/missing.png"
                    : `/slides/${index}.png`,
                kind: "image",
                // The first row is "in view": it loads first.
                priority: row === 0 ? 0 : 10 + index,
            });
            tiles.push({
                name,
                rect: new Rect(
                    GAP + column * (TILE + GAP),
                    TOP + row * (TILE + GAP),
                    TILE,
                    TILE,
                ),
            });
        }

        this.click_handler = (event: MouseEvent) => {
            const box = canvas.getBoundingClientRect();
            const point = {
                x: ((event.clientX - box.left) * canvas.width) / box.width,
                y: ((event.clientY - box.top) * canvas.height) / box.height,
            };
            for (const tile of tiles) {
                if (tile.rect.contains(point)) {
                    assets.set_priority(tile.name, -1);
                    console.log(`${tile.name} moves to the front`);
                }
            }
        };
        canvas.addEventListener("click", this.click_handler);

        const frame = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            const counts = assets.counts;
            ctx.fillStyle = "#0f172a";
            ctx.font = "13px sans-serif";
            ctx.textAlign = "left";
            ctx.textBaseline = "top";
            ctx.fillText(
                `All: ${Math.round(assets.progress.get_percent() * 100)} %, ${assets.loaded_bytes} bytes. ` +
                    `Queued ${counts.queued}, loading ${counts.loading}, ready ${counts.ready}, failed ${counts.failed}`,
                GAP,
                10,
            );
            ctx.fillStyle = "#64748b";
            ctx.fillText(
                "Two at a time, the first row first. Click a waiting tile to load it next.",
                GAP,
                30,
            );

            for (const tile of tiles) {
                const load = assets.loads.get(tile.name)!;
                const rect = tile.rect;
                const image = assets.images.get(tile.name);
                if (load.state === "ready" && image !== undefined) {
                    ctx.drawImage(
                        image.element,
                        rect.left,
                        rect.top,
                        rect.width,
                        rect.height,
                    );
                } else {
                    ctx.fillStyle = "#f1f5f9";
                    ctx.fillRect(rect.left, rect.top, rect.width, rect.height);
                    ctx.fillStyle = STATE_COLORS[load.state];
                    const share = load.progress.get_percent();
                    ctx.fillRect(
                        rect.left,
                        rect.top + rect.height - 10,
                        rect.width * share,
                        10,
                    );
                    ctx.fillStyle = "#334155";
                    ctx.textAlign = "center";
                    ctx.textBaseline = "middle";
                    ctx.fillText(
                        load.state === "failed"
                            ? (load.reason ?? "failed")
                            : load.state,
                        rect.left + rect.width / 2,
                        rect.top + rect.height / 2 - 8,
                    );
                    ctx.fillText(
                        `priority ${load.priority}`,
                        rect.left + rect.width / 2,
                        rect.top + rect.height / 2 + 10,
                    );
                    ctx.textAlign = "left";
                    ctx.textBaseline = "top";
                }
                ctx.strokeStyle = STATE_COLORS[load.state];
                ctx.lineWidth = 2;
                ctx.strokeRect(rect.left, rect.top, rect.width, rect.height);
            }

            ctx.fillStyle = "#64748b";
            ctx.fillText(
                "Full demo: Spielwerk step 28 (Artbook)",
                GAP,
                canvas.height - 20,
            );
            this.animation_frame = requestAnimationFrame(frame);
        };
        this.animation_frame = requestAnimationFrame(frame);

        console.log(
            "AssetManager.request() demo: 18 pictures over a slow, made-up network, two at a time, " +
                "lowest priority first; slide 8 is missing (HTTP 404). " +
                "Full demo: https://www.game-object.de/pages/spielwerk/28-artbook",
        );
    }
}
