import { SheetData } from "../canvas/animation/SheetData";
import { IntroGate } from "../stage/IntroGate";
import { StageLayout } from "../stage/StageLayout";
import { CanvasGameProperties } from "./CanvasGameProperties";
import { CanvasGameReferences } from "./CanvasGameReferences";
import { CanvasGameSettings } from "./CanvasGameSettings";

/** What an element needs from its logic; the concrete type is the game's own. */
export interface CanvasGameLifecycle {
    start(): void;
    stop(): void;
    restart(): void;
}

/**
 * The five classes of a game, by constructor. `references` and `properties` may be omitted when
 * the base classes suffice; the logic's constructor then takes the base types.
 */
export interface CanvasGameParts<S, R, P, Q, U> {
    settings: new () => S;
    references?: new (host: HTMLElement, settings: S, extra_css?: string) => R;
    properties?: new (settings: S, intro: IntroGate) => P;
    renderer: new (references: R, settings: S) => Q;
    logic: new (
        host: HTMLElement,
        references: R,
        properties: P,
        renderer: Q,
        settings: S,
    ) => U;
    /** Styles beyond the shell's own. */
    css?: string;
}

/** Where the catalogue keeps one entry: `CanvasGameElement.load_catalogue_url()` answers with it. */
export interface CatalogueFile {
    readonly url: string;
    /** Its server sends CORS headers (see `AssetRequest.cors`). */
    readonly cors?: boolean;
    /**
     * An image that is an animated sprite sheet: its frames and clips, as plain data. The shell
     * puts them into `references.sheet(name)`; `logic.load_animation(name)` plays them.
     */
    readonly sheet?: SheetData;
}

/** `HTMLElement` where there is a DOM; a stand-in where the module is only imported (tests of a game). */
const HOST_ELEMENT: typeof HTMLElement =
    typeof HTMLElement === "undefined"
        ? (class {} as unknown as typeof HTMLElement)
        : HTMLElement;

/**
 * The custom element of a canvas game: a shallow delegate to its logic. A game subclasses it
 * and names its five classes in `assemble()`; everything else (intro, input, fitting, loop) is
 * the base classes' business. Where the intro video comes from, and what happens on connect
 * (e.g. retitling a window), are the two hooks a hosting framework fills in.
 */

export abstract class CanvasGameElement<
    T extends CanvasGameLifecycle = CanvasGameLifecycle,
> extends HOST_ELEMENT {
    public abstract readonly logic: T;
    private title_of_game = "";
    /** Asks for `settings.catalogue_images` and `catalogue_sounds`; null once asked. */
    private request_catalogue: (() => void) | null = null;

    protected assemble<
        S extends CanvasGameSettings<StageLayout>,
        R,
        P,
        Q,
        U extends T,
    >(parts: CanvasGameParts<S, R, P, Q, U>): U {
        const settings = new parts.settings();
        this.title_of_game = settings.title;
        const intro = new IntroGate({
            load_url: () => this.load_intro_url(),
            timeout_ms: settings.intro_timeout_ms,
            hold_ms: settings.intro_hold_ms,
            background: settings.colors.black,
            on_error: (error) =>
                console.warn(`<${this.localName}>: intro skipped:`, error),
        });
        const references = parts.references
            ? new parts.references(this, settings, parts.css)
            : (new CanvasGameReferences(this, settings, parts.css) as R);
        const properties = parts.properties
            ? new parts.properties(settings, intro)
            : (new CanvasGameProperties(settings, intro) as P);
        const renderer = new parts.renderer(references, settings);
        const references_of_game =
            references as unknown as CanvasGameReferences;
        const assets = references_of_game.assets;
        this.request_catalogue = () => {
            const wanted = [
                ...Object.entries(settings.catalogue_images).map(
                    ([name, id]) => ({ name, id, kind: "image" as const }),
                ),
                ...Object.entries(settings.catalogue_sounds).map(
                    ([name, id]) => ({ name, id, kind: "audio" as const }),
                ),
            ];
            for (const { name, id, kind } of wanted) {
                this.load_catalogue_url(id, kind).then(
                    (file) => {
                        if (kind === "image" && file.sheet !== undefined) {
                            try {
                                references_of_game
                                    .sheet(name)
                                    .set_data(file.sheet);
                            } catch (error) {
                                console.warn(
                                    `<${this.localName}>: the sheet of "${id}" is not usable:`,
                                    error,
                                );
                            }
                        }
                        assets.request({
                            name,
                            url: file.url,
                            kind,
                            cors: file.cors,
                        });
                    },
                    (error: unknown) => {
                        console.warn(
                            `<${this.localName}>: "${id}" from the catalogue not loaded:`,
                            error,
                        );
                    },
                );
            }
        };
        return new parts.logic(
            this,
            references,
            properties,
            renderer,
            settings,
        );
    }

    /** The intro video's URL; rejecting (the default) skips the intro. */
    protected load_intro_url(): Promise<string> {
        return Promise.reject(new Error("no intro source"));
    }

    /**
     * Where the catalogue entry `id` of `settings.catalogue_images` or `catalogue_sounds` lives;
     * rejecting (the default) leaves it unloaded, and the game paints or plays its fallback.
     * Asked once per element, at its first connection.
     */
    protected load_catalogue_url(
        id: string,
        kind: "image" | "audio",
    ): Promise<CatalogueFile> {
        void kind;
        return Promise.reject(new Error(`no catalogue for "${id}"`));
    }

    /** After every connection, with the game's title. */
    protected on_connected(title: string): void {
        void title;
    }

    // eslint-disable-next-line @typescript-eslint/naming-convention -- DOM name
    public connectedCallback(): void {
        this.logic.start();
        if (this.request_catalogue !== null) {
            const request = this.request_catalogue;
            this.request_catalogue = null;
            request();
        }
        this.on_connected(this.title_of_game);
    }

    // eslint-disable-next-line @typescript-eslint/naming-convention -- DOM name
    public disconnectedCallback(): void {
        this.logic.stop();
    }

    /** What the game's "Neues Spiel" does: by default the next game of the seed series. */
    public restart(): void {
        this.logic.restart();
    }
}
