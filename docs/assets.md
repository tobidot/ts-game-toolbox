# Assets

Tools to help with loading, storing, and retrieving various types of assets.

## AssetManager

The `AssetManager` loads pictures, sounds and videos and keeps them by name in `images`, `audios` and `videos`: maps of `Asset`s (`element`, `url`, `ready`). The canvas game shell's renderer (`paint_image()`), `AudioPlayer` and the `Image`, `Gallery` and `Video` widgets find them there.

There are two ways in: `load()` takes a record of names and URLs at once and resolves when all are there (files that ship with the game), `request()` queues files one by one, many of them, off the network.

### Loading a set at once

```typescript
import { AssetManager, Progress } from "@game.object/ts-game-toolbox";

const manager = new AssetManager();
const progress = new Progress();

progress.listen((percent) => {
    console.log(`Loading: ${Math.round(percent * 100)}%`);
});

await manager.load(
    {
        images: {
            hero: "/assets/images/hero.png",
            background: "/assets/images/bg.jpg",
        },
        audio: {
            jump: "/assets/audio/jump.mp3",
            music: "/assets/audio/theme.mp3",
        },
    },
    progress,
);

// Accessing assets
const hero_image = manager.images.get("hero")?.element;
const jump_sound = manager.audios.get("jump")?.element;
```

- `load(assets: { images?, audio?, videos? }, progress: Progress): Promise<void>`: Loads all three kinds.
- `load_images(assets: Record<string, string>, progress: Progress)`, `load_audio(...)`, `load_videos(...)`: One kind. The record may come from `import.meta.glob("/assets/images/**/*.png", { query: "url", eager: true, import: "default" })`.
- The promise rejects when a file fails; the failed file still counts as finished in `progress`.
- `list_pending(): string[]`: The names of the files that are still loading.

### Requesting files one by one

`request()` is for files off the network, many of them: a gallery, a catalogue, a level's pictures. They wait in a queue and load `max_parallel` (default 4) at a time, lowest `priority` first; the game may change a priority while a file waits, say for the ones scrolled into view. Each file has its own state, a reason when it failed and its own progress.

```typescript
const assets = new AssetManager();

for (const entry of catalogue) {
    assets.request({
        name: entry.name,
        url: entry.url,
        kind: "image", // or "audio", "video"
        priority: entry.is_visible ? 0 : 10, // lower loads first; default 0
    });
}
assets.set_priority("sunset", -1); // opened: load it next

const load = assets.loads.get("sunset");
if (load?.state === "ready") {
    show(assets.images.get("sunset")?.element);
} else if (load?.state === "failed") {
    say(`could not load: ${load.reason}`);
} else if (load !== undefined) {
    draw_bar(load.progress.get_percent());
}
```

- **`request(request: AssetRequest): AssetLoad`**: `name` (the key in `images`, `audios` or `videos`), `url`, `kind`, `priority?`, `cors?`. A name asked for again gets the load it already has, with the new priority when one is given.
- **`AssetLoad`**: `state` is `"queued"`, `"loading"`, `"ready"` or `"failed"` (`AssetLoadState`); `is_finished` once it is ready or failed. `reason` says why it failed (`HTTP 404`, `timed out`, `could not be loaded`, `network error: ...`). `loaded_bytes` and `total_bytes` (when the server sent `Content-Length`), and `progress`, this file's `Progress`: by bytes while they come, whole when it is ready or failed.
- **`set_priority(name, priority)`**: changes when a waiting file loads; one that already loads goes on.
- **`cancel(name)`**: withdraws a file that still waits, as if it had never been asked for: it leaves the queue, `loads`, `counts` and `progress`, and a later `request()` queues it afresh. A file that loads or finished stays. Returns whether it was withdrawn.
- **The whole queue.** `loads` keeps every requested file by name. `progress` is all of them together (a failed file counts as finished), `counts` the number in each state, `loaded_bytes` the bytes so far.
- **Limits.** `max_parallel` (default 4) files at the same time; a file that takes longer than `timeout_ms` (default 30000) fails with `timed out`.
- **Bytes or element.** A file on the page's own origin, or one requested with `cors: true` (its server sends CORS headers), is fetched as bytes: its progress follows them and a missing one fails with `HTTP 404`. Any other URL goes straight into its element, which loads without CORS and has no byte progress.
- **Tests.** `new AssetManager(options)` takes `AssetManagerOptions`: `fetch` (default the global one; `null` never fetches), `create_element(kind)` for fake elements, and `origin` (default `location.origin`).

In the canvas game shell, `references.assets` is the game's `AssetManager`, and a file from its `request()` repaints the game when it arrives. Step 28 (Artbook) loads a whole catalogue this way, pictures by visible position first, films when opened.
