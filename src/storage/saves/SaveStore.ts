/**
 * Where saves go: text in, text out, by name. `SaveSlots` asks nothing more of it, so a game on a
 * site with its own file system (a TCE desktop's `dll-tce-file-system`) brings a store of four
 * functions, and the toolbox never knows that library. Names are slot names (`slot-1`) and the
 * names of files kept aside (`slot-1.broken-20261118-201503`); a store may add an extension.
 *
 * Every function may reject; `SaveSlots` catches it and the game plays on.
 */
export interface SaveStore {
    /** Where the saves lie, for a player: "Browser", "/saves/tce-garden/". */
    readonly label: string;
    /** The text saved under `name`; null when there is none. */
    read(name: string): Promise<string | null>;
    /** Creates or replaces `name`. */
    write(name: string, text: string): Promise<void>;
    /** Forgets `name`; nothing happens when there is none. */
    remove(name: string): Promise<void>;
    /** Every name there is, in any order. */
    list(): Promise<string[]>;
}

/** `memory_store()`: the texts are in `files`, for a test to look at or fill. */
export interface MemoryStore extends SaveStore {
    readonly files: Map<string, string>;
}

/**
 * A store in memory, gone with the page: for tests, and where nothing else works. `files` may
 * start it with texts.
 */
export function memory_store(
    files: Readonly<Record<string, string>> = {},
    label: string = "Arbeitsspeicher",
): MemoryStore {
    const texts = new Map(Object.entries(files));
    return {
        label,
        files: texts,
        read: (name) => Promise.resolve(texts.get(name) ?? null),
        write: (name, text) => {
            texts.set(name, text);
            return Promise.resolve();
        },
        remove: (name) => {
            texts.delete(name);
            return Promise.resolve();
        },
        list: () => Promise.resolve([...texts.keys()]),
    };
}

/** The part of `Storage` a local-storage store uses. */
export type TextStorage = Pick<
    Storage,
    "getItem" | "setItem" | "removeItem" | "key" | "length"
>;

/**
 * A store in the browser's local storage, every name under `prefix` (`"tce-garden/"`), so games on
 * one site don't meet. A full storage rejects the write. Default storage: `localStorage`.
 */
export function local_storage_store(
    prefix: string,
    storage: TextStorage = localStorage,
): SaveStore {
    return {
        label: "Browser",
        read: (name) => attempt(() => storage.getItem(prefix + name)),
        write: (name, text) =>
            attempt(() => storage.setItem(prefix + name, text)),
        remove: (name) => attempt(() => storage.removeItem(prefix + name)),
        list: () =>
            attempt(() => {
                const names: string[] = [];
                for (let index = 0; index < storage.length; index++) {
                    const key = storage.key(index);
                    if (key !== null && key.startsWith(prefix)) {
                        names.push(key.slice(prefix.length));
                    }
                }
                return names;
            }),
    };
}

/**
 * Local storage under `prefix` where the page may use it, else memory (a sandboxed frame, a
 * browser that refuses it). `scope` is where `localStorage` is looked up; default `globalThis`.
 */
export function default_save_store(
    prefix: string,
    // eslint-disable-next-line @typescript-eslint/naming-convention -- DOM name
    scope: { readonly localStorage?: Storage } = globalThis,
): SaveStore {
    try {
        const storage = scope.localStorage;
        if (storage !== undefined && storage !== null) {
            return local_storage_store(prefix, storage);
        }
    } catch {
        // Access itself throws where the page may not store anything.
    }
    return memory_store();
}

/** `action` as a promise: a throw becomes a rejection. */
function attempt<T>(action: () => T): Promise<T> {
    try {
        return Promise.resolve(action());
    } catch (error) {
        return Promise.reject(
            error instanceof Error ? error : new Error(String(error)),
        );
    }
}
