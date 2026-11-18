# Saves

A game's progress in named slots, versioned, in any store of text files. A game says what it saves (plain JSON data), which version that is, and how an older version becomes the next; `SaveSlots` does the rest: reading, migrating, checking, writing in order, autosaving, and keeping a broken file aside instead of overwriting it. Since 6.2.0 (`storage/saves`), first used by Spielwerk step 35, Spielstand.

- **`SaveSlots<T>`**: load, save, remove, list, export and import slots; `autosave()` on a timer and when the page hides.
- **`SaveStore`**: where the files lie, four async functions of text. `memory_store()`, `local_storage_store(prefix)` and `default_save_store(prefix)` come with the toolbox; a host brings its own (a TCE desktop's file system).
- **In the game shell**: `settings.save_version`, `save_tag`, `save_slots`, `autosave_seconds`; `properties.save_slots(options)`; the element's hook `open_save_store(tag)`; and `SaveSlotsPage`, the slot list as a ready-made menu.

## Three lines

```ts
const saves = new SaveSlots<Garden>({ version: 2, fresh: new_garden, migrations: { 1: (old) => ({ ...old, bees: 2 }) } });
const garden = await saves.load("slot-1");    // always playable
saves.autosave("slot-1", () => garden);       // every 10 s and when the page hides
```

## Options

```ts
interface SaveSlotsOptions<T> {
    version: number;                    // the version the game saves now, a whole number from 1
    fresh: () => T;                     // a new game's data
    migrations?: SaveMigrations;        // { 1: v1 => v2, 2: v2 => v3, ... }
    validate?: (data: unknown) => T;    // checks loaded data; a throw makes the save broken
    summary?: (data: T) => string;      // the slot list's line: "Tag 12 · 34 Kräuter"
    store?: SaveStore | Promise<SaveStore>;  // default: local storage under "<name>/", else memory
    page?: PageHideSource | null;       // default: the browser's page (visibilitychange, pagehide)
    now?: () => number;                 // default Date.now; a test passes its own clock
    name?: string;                      // who speaks in the console
}
```

**Migrations** go one version at a time: `migrations[n]` turns plain data of version n into version n + 1. A save of version 1 in a game of version 4 runs 1, 2 and 3 in turn. A gap below the current version throws in the constructor, so a test finds it before a player does. A migration may throw; the save then counts as broken.

**`validate`** runs on every loaded or migrated save and returns the data typed. Whatever it throws makes the save broken, so a hand-edited file with a herb that doesn't exist never reaches the game.

## Loading never fails

`load(slot)` answers with the data; `load_save(slot)` with the data and how it went:

| `outcome` | What happened | `data` |
| --- | --- | --- |
| `empty` | nothing saved in the slot | `fresh()` |
| `loaded` | a save of the current version | the save |
| `migrated` | an older version, brought up to date | the save, migrated |
| `broken` | not JSON, not a save, a migration or `validate` threw | `fresh()`; the file kept aside |
| `newer` | a newer version of the game wrote it | `fresh()`; the file kept aside |
| `unreachable` | the store failed | `fresh()` |

`LoadedSave<T>` also has `header` (the file's `SaveHeader`, null without one), `from_version` and `reason` (what went wrong, in English). A file that can't be played is renamed before the load resolves: `slot-1.broken-20261118-201503` (or `.newer-`), with `-2` on a clash. If even that fails, the slot is guarded: saves into it are refused, so the only copy is never written over.

No method rejects, except for a slot name that isn't one (`/^[A-Za-z0-9_-]{1,64}$/`, a bug). Problems go to `events` and, once per kind, to the console; the game plays on.

## Saving

- **`save(slot, data, info?)`** resolves `true` once written, `false` when the store refused. The data is turned into text right away (later changes to the object don't count). Saves run one at a time in the order asked; a save that waits for its turn is replaced by a newer one of the same slot, so the last one wins and a slow store never writes stale data after fresh.
- **`info.seconds_played`**: default, the loaded save's seconds plus the time since it was loaded (or last saved). **`info.summary`**: default `options.summary(data)`.
- **`remove(slot)`** forgets the slot; files kept aside stay.
- **`list()`**: every slot with a file, headers only, newest first; unplayable files last with their `problem` (`"broken"` or `"newer"`). Files kept aside are not slots.
- **`flush()`** resolves when everything asked for so far is written.

## Autosave

```ts
const stop = saves.autosave("slot-1", () => (playing ? game.data : null), 10);
```

Saves `get_data()` every `seconds` and whenever the page hides (a tab switched, a phone locked, the page left); a `null` skips that one. One autosave at a time: a new one replaces the last. `autosave_now()` saves at once, `stop_autosave()` ends it, `pause_autosave()` saves once more and holds it, `resume_autosave()` goes on; `autosave_slot` says which slot it writes. The game shell pauses it in `logic.stop()` (the element left the page) and resumes it in `start()`.

## The file

A save is readable JSON, so a player can look into it and a developer can fix one by hand:

```json
{
  "format": "ts-game-toolbox/save",
  "version": 2,
  "saved_at": "2026-11-18T20:56:50.046Z",
  "seconds_played": 1260,
  "summary": "Tag 14 · 48 Kräuter",
  "data": { ... }
}
```

`saved_at` is an ISO date in the file (and milliseconds since 1970 in a `SaveHeader`); `seconds_played` is rounded to a thousandth. `export(slot)` gives that text for a download (null for an empty slot). `import(text, slot)` reads one, migrates and checks it, and saves it into the slot; a text that isn't a playable save writes nothing, and the answer's `outcome` says which it was. `decode(text)` and `encode(slot, data)` do the same without a store.

## Stores

```ts
interface SaveStore {
    readonly label: string;               // where the saves lie, for a player: "Browser", "/saves/tce-garden/"
    read(name: string): Promise<string | null>;
    write(name: string, text: string): Promise<void>;
    remove(name: string): Promise<void>;
    list(): Promise<string[]>;
}
```

Names are slot names and the names of files kept aside; a store may add an extension (`.json`). Every function may reject; `SaveSlots` catches it.

- **`memory_store(files?, label?)`**: a `Map` in `files`, for tests and where nothing else works.
- **`local_storage_store(prefix, storage?)`**: the browser's local storage, every name under `prefix` (`"tce-garden/"`), so games on one site don't meet. A full storage rejects the write.
- **`default_save_store(prefix, scope?)`**: local storage where the page may use it, else memory (a sandboxed frame, a browser that refuses it).

`saves.use_store(store)` switches stores (a promise is fine: everything waits for it); `where()` resolves the store's `label`.

## Events

`saves.events` is an `EventSocket<SaveEvent>`. `kind` is `fresh`, `loaded`, `migrated`, `saved`, `removed`, `imported`, `kept` (a file was kept aside under `name`), or a problem: `broken`, `newer`, `failed` (the store refused something); `is_problem` says which. `slot`, `reason` and `error` tell more.

```ts
saves.events.attach((event) => {
    if (event.kind === "saved") {
        show_saved_mark();
    }
});
```

## In the game shell

```ts
class MySettings extends CanvasGameSettings {
    public override save_version = 2;
    public override save_tag = "tce-garden";   // default: the element's tag name
    public override autosave_seconds = 5;      // default 10
}

class MyProperties extends CanvasGameProperties<Game, MySettings> {
    public override readonly saves = this.save_slots<Garden>({ fresh: new_garden, migrations, validate, summary });
}
```

`properties.save_slots(options)` builds `SaveSlots` with `settings.save_version` (the options may name another) and the name `save_tag ?? title`. When the element first connects, before the game starts, it asks its hook **`open_save_store(tag)`** for a store and hands it to `properties.saves`; the default is `default_save_store("<tag>/")`. `@tce-v3/game-boot`'s `GameElement` fills the hook from `dll-tce-file-system` (`/saves/<tag>/<slot>.json`) and falls back to local storage. A game without `saves` is untouched.

The game still says when to autosave: `properties.saves.autosave(slot, () => data, settings.autosave_seconds)` once a slot is open.

## SaveSlotsPage

```ts
const page = this.place(new SaveSlotsPage(this.saves, UNPLACED, { slots: settings.save_slots }), (layout) => layout.slots);
page.on_choose = (choice) => { ... };   // { action: "continue" | "new" | "remove", slot }
```

The slot list as a `MenuView`: a row per slot (`Platz 1  Tag 12 · 34 Kräuter · vor 3 Min.`), keys 1 to 3, arrows, Enter, Escape and a gamepad through `properties.place()`, and the house look. A press on a filled slot continues it, on an empty or unplayable one starts a new game there. "Löschen …" (key L) opens the filled slots, each with a confirm ("Ja, Platz 1 löschen" / "Nein, behalten"); the page deletes the slot itself, then `on_choose` hears of it.

It reads the slots when it first shows, with the cursor on the slot played last, and again after every save, removal, import or file kept aside, so a game never tells it to refresh (`refresh()` is there for a store changed from outside). `headers` has what it read. Show it with `page.input.is_enabled = true`, take it away with `false`. The texts are German (`SAVE_SLOTS_PAGE_TEXTS`); `options.texts` replaces any of them, and `ago_text(seconds)` is the "vor 3 Min." it uses.
