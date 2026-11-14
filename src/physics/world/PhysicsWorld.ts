import { RectI } from "../../geometries/Rect";
import { Vector2I } from "../../geometries/Vector2";
import { FixedStepClock } from "../../flow/timers/FixedStepClock";
import { EventSocket } from "../../signals/EventSocket";
import { Contact, elastic_impact, reflect } from "../bounce/Bounce";
import {
    BroadPhase,
    BroadPhaseOptions,
    create_broad_phase,
} from "./BroadPhase";
import { CollisionRule, SAT_SWEEP } from "./CollisionRule";
import { ContactEvent } from "./ContactEvent";
import { ALL_LAYERS, BodyOptions, PhysicsBody } from "./PhysicsBody";

/** What `new PhysicsWorld()` takes; every field has a default. */
export interface PhysicsWorldOptions {
    /** How two shapes meet. Default: `SAT_SWEEP`. */
    rule?: CollisionRule;
    /** How pairs are found. Default: a grid of 64 by 64. */
    broad_phase?: BroadPhaseOptions;
    /** Units per second per second. Default: none. */
    gravity?: Vector2I;
    /** The share of the closing speed that comes back after a contact: 0 a thud, 1 a perfect bounce. Default: 0. */
    restitution?: number;
    /**
     * Contacts closing slower than this, in units per second, don't bounce. Without it every
     * body in a resting pile bounces a little off the one below, and the bounces add up the
     * pile. Default: 60, what a body has after falling 2 units at gravity 900.
     */
    bounce_speed?: number;
    /** The share of the speed a contact takes away along its normal that sliding loses too. Default: 0. */
    friction?: number;
    /** The length of one even step, in seconds. Default: 1/60. */
    step_seconds?: number;
    /**
     * At most this many steps per `update()`; the time still due after them is dropped, so one
     * slow frame never makes the next one slower. Default: 4.
     */
    max_steps_per_update?: number;
    /**
     * A further step in the same `update()` runs only while the steps before it took less than
     * this many milliseconds of real time; otherwise the time still due is dropped and the world
     * runs slower than real time. Catching up a slow frame with costly steps makes the next frame
     * slower still, until every frame runs `max_steps_per_update`: a few bodies too many cut
     * the frame rate to a quarter. Default: 8, half a frame at 60 FPS. `Infinity` catches up
     * whatever it costs.
     */
    catch_up_ms?: number;
    /** How often a step pushes overlapping bodies apart. More settles a pile faster and costs more. Default: 2. */
    passes?: number;
    /** Contacts closing slower than this, in units per second, send no event. Default: 0, every contact. */
    contact_event_speed?: number;
    /**
     * Only a contact with a body on one of these layers (bits) sends an event. A crowd that
     * pushes itself apart makes thousands of contacts a step that no game listens to: an event
     * each costs time and garbage. Default: `ALL_LAYERS`, every contact.
     */
    contact_event_layers?: number;
    /**
     * A body falls asleep once it has stayed within `sleep_distance` of one spot for this many
     * seconds: the world stops moving it and doesn't test two sleepers against each other, so a
     * settled heap costs next to nothing. Default: 0.5. `Infinity`: never.
     */
    sleep_seconds?: number;
    /** How far a resting body may stray and still count as resting, in world units. Default: 0.5. */
    sleep_distance?: number;
}

/** What the last step cost and found. */
export interface PhysicsWorldStats {
    /** All bodies, still ones included. */
    bodies: number;
    /** Pairs the rule was asked about: overlaps tested, and walls handed to a move. */
    pairs_tested: number;
    /** Overlaps and hits resolved, each pass counted. */
    contacts: number;
    /** Milliseconds the last step took. */
    step_ms: number;
    /** Steps the last `update()` ran. */
    steps: number;
    /** Moving bodies asleep after the last step. */
    sleeping: number;
}

/**
 * A contact whose normal points at least this much against gravity holds the upper body up:
 * a slope up to 60 degrees carries, a steeper one doesn't. Less a hair, so that a face of
 * exactly 60 degrees carries however its normal was rounded: a triangle's and a hexagon's
 * slanted faces come out a hair either side of 0.5, and one side of a triangle would carry
 * while the other didn't.
 */
const SUPPORT_SLOPE = 0.5 - 1e-9;

/**
 * Whether a contact with `normal`, pointing from the lower body towards the upper one, holds the
 * upper one up against gravity along `down` (a unit vector): a slope up to 60 degrees does.
 */
export function holds_up(normal: Vector2I, down: Vector2I): boolean {
    return -(normal.x * down.x + normal.y * down.y) >= SUPPORT_SLOPE;
}

/** A sleeper wakes when a neighbour moved more than this share of `sleep_distance` in its last step: a falling body does at once, a resting one that jitters doesn't. */
const WAKE_SHARE = 0.2;

/**
 * A body pushed deeper than this share of `sleep_distance` in a step is wedged, not resting: a
 * resting one sinks in by a step's fall (0.25 at gravity 900) and is pushed out again.
 */
const WEDGED_SHARE = 2;

/** A pair of moving bodies is looked at when their boxes come this close, so a push in an early pass still finds its neighbours. */
const PAIR_MARGIN = 1;

/** Which world a body was added to; a body knows nothing of worlds. */
const owners = new WeakMap<PhysicsBody<any>, PhysicsWorld<any>>();

/** A clock that is there in Node and in browsers. */
function now_ms(): number {
    return performance.now();
}

/**
 * Bodies the library owns: it moves them in even steps, finds the pairs that touch and turns
 * contacts into speeds, so a game with thousands of bodies doesn't do that itself. A
 * `CollisionRule` says how two shapes meet; bodies translate and never turn.
 *
 * One step: gravity, then every moving body moves by its velocity against the still bodies (the
 * rule's `move()`, which sweeps for `AABB_SWEEP` and `SAT_SWEEP`, so nothing tunnels through a
 * wall). Then, `passes` times, moving bodies that overlap are pushed apart, split by mass, and
 * lose their closing speed (`elastic_impact` with `restitution`); whatever was pushed into a
 * still body is pushed back out. Moving bodies don't sweep against each other, so two fast ones
 * can pass through each other. Contacts go out as `ContactEvent`s after the step.
 */
export class PhysicsWorld<D = unknown> {
    public rule: CollisionRule;
    public gravity: Vector2I;
    public restitution: number;
    public bounce_speed: number;
    public friction: number;
    public passes: number;
    public contact_event_speed: number;
    public contact_event_layers: number;
    public max_steps_per_update: number;
    public catch_up_ms: number;
    public sleep_seconds: number;
    public sleep_distance: number;
    public readonly step_seconds: number;
    /** `ContactEvent`s, sent after each step. */
    public readonly events = new EventSocket<ContactEvent<D>>();
    public readonly stats: PhysicsWorldStats = {
        bodies: 0,
        pairs_tested: 0,
        contacts: 0,
        step_ms: 0,
        steps: 0,
        sleeping: 0,
    };
    private readonly clock: FixedStepClock;
    private all: PhysicsBody<D>[] = [];
    /** Some bodies were removed and `all` still holds them. */
    private has_removed = false;
    /** The moving bodies, lowest first along gravity: a pile is pushed apart from the bottom up. */
    private moving: PhysicsBody<D>[] = [];
    private still: PhysicsBody<D>[] = [];
    private pending: ContactEvent<D>[] = [];
    /** Moving bodies pushed in this pass: only they can have been pushed into a wall. */
    private pushed: boolean[] = [];
    /** Moving bodies that rest on a still body, or on one that does, in this step. */
    private supported: boolean[] = [];
    /** Gravity's direction, or null without gravity. */
    private down: Vector2I | null = null;
    private broad_phase_options: BroadPhaseOptions;
    private broad: BroadPhase;
    /** The still bodies changed: the broad phase must stand them anew. */
    private is_still_changed = true;
    private readonly pairs: number[] = [];
    private readonly boxes: RectI[] = [];
    private readonly wall_indices: number[] = [];
    private readonly walls: PhysicsBody<D>[] = [];
    /** Scratch for a move and a push, so a step allocates nothing per body. */
    private readonly delta: Vector2I = { x: 0, y: 0 };
    private readonly swept: RectI = { left: 0, top: 0, width: 0, height: 0 };
    private readonly up: Vector2I = { x: 0, y: 0 };
    /** The deepest push each moving body took in this step: a body pushed deep isn't resting, however still it stands. */
    private deepest = new Float64Array(0);
    /** Where each moving body was when the step began. */
    private start_x = new Float64Array(0);
    private start_y = new Float64Array(0);
    /** The boxes of bodies removed since the last step: what rested on them wakes. */
    private readonly wake_boxes: RectI[] = [];
    /** Moving bodies asleep when the step began. */
    private sleepers = 0;
    /** Gravity in the last step: a change wakes every body. */
    private last_gravity: Vector2I = { x: NaN, y: NaN };

    public constructor(options: PhysicsWorldOptions = {}) {
        this.rule = options.rule ?? SAT_SWEEP;
        const gravity = options.gravity ?? { x: 0, y: 0 };
        this.gravity = { x: gravity.x, y: gravity.y };
        this.restitution = options.restitution ?? 0;
        this.bounce_speed = options.bounce_speed ?? 60;
        this.friction = options.friction ?? 0;
        this.passes = options.passes ?? 2;
        this.contact_event_speed = options.contact_event_speed ?? 0;
        this.contact_event_layers = options.contact_event_layers ?? ALL_LAYERS;
        this.step_seconds = options.step_seconds ?? 1 / 60;
        this.max_steps_per_update = options.max_steps_per_update ?? 4;
        this.catch_up_ms = options.catch_up_ms ?? 8;
        this.sleep_seconds = options.sleep_seconds ?? 0.5;
        this.sleep_distance = options.sleep_distance ?? 0.5;
        this.broad_phase_options = options.broad_phase ?? {
            kind: "grid",
            cell_size: 64,
        };
        this.broad = create_broad_phase(this.broad_phase_options);
        this.clock = new FixedStepClock(this.step_seconds);
    }

    /** How pairs are found; a new value takes effect from the next step. */
    public get broad_phase(): BroadPhaseOptions {
        return this.broad_phase_options;
    }

    public set broad_phase(options: BroadPhaseOptions) {
        this.broad_phase_options = options;
        this.broad = create_broad_phase(options);
        this.is_still_changed = true;
    }

    /** Every body in the world, in the order they were added. */
    public get bodies(): readonly PhysicsBody<D>[] {
        this.compact();
        return this.all;
    }

    /** Adds a body and returns it. */
    public add(options: BodyOptions<D>): PhysicsBody<D> {
        const body = new PhysicsBody<D>(options);
        owners.set(body, this);
        this.all.push(body);
        if (body.is_static) {
            this.still.push(body);
            this.is_still_changed = true;
        } else {
            this.moving.push(body);
        }
        return body;
    }

    /** Takes a body out; safe from a contact listener. Returns false when it wasn't in the world. */
    public remove(body: PhysicsBody<D>): boolean {
        if (!body.is_in_world || owners.get(body) !== this) {
            return false;
        }
        body.is_in_world = false;
        this.has_removed = true;
        const box = body.box;
        this.wake_boxes.push({
            left: box.left - PAIR_MARGIN,
            top: box.top - PAIR_MARGIN,
            width: box.width + 2 * PAIR_MARGIN,
            height: box.height + 2 * PAIR_MARGIN,
        });
        if (body.is_static) {
            this.is_still_changed = true;
        }
        return true;
    }

    /**
     * Runs the even steps that `delta_seconds` of frame time makes due: at most
     * `max_steps_per_update`, and a further one only while the steps so far took less than
     * `catch_up_ms`. A device that can't keep up then runs slower instead of ever slower: the
     * time still due is dropped but for half a step, so the next frame runs one step.
     */
    public update(delta_seconds: number): void {
        const started = now_ms();
        let steps = 0;
        this.clock.advance(
            delta_seconds,
            () => {
                this.step();
                steps += 1;
                if (this.clock.unused_seconds < this.step_seconds) {
                    // no further step is due: whatever is left carries over
                    return undefined;
                }
                const is_capped = steps >= this.max_steps_per_update;
                const is_costly = now_ms() - started >= this.catch_up_ms;
                return is_capped || is_costly ? true : undefined;
            },
            this.step_seconds / 2,
        );
        this.stats.steps = steps;
    }

    /** One step of `step_seconds`, and its events after it. */
    public step(): void {
        const started = now_ms();
        const stats = this.stats;
        stats.pairs_tested = 0;
        stats.contacts = 0;
        this.sort_bodies();
        const dt = this.step_seconds;
        const moving = this.moving;
        this.supported.length = moving.length;
        this.supported.fill(false);
        this.note_starts();
        for (let index = 0; index < moving.length; index++) {
            const body = moving[index];
            if (body.is_sleeping) {
                continue;
            }
            body.velocity.x += this.gravity.x * dt;
            body.velocity.y += this.gravity.y * dt;
            this.delta.x = body.velocity.x * dt;
            this.delta.y = body.velocity.y * dt;
            this.move(index, this.delta);
        }
        this.find_pairs();
        for (let pass = 0; pass < this.passes; pass++) {
            this.separate();
        }
        this.settle();
        stats.bodies = this.all.length;
        stats.step_ms = now_ms() - started;
        this.send_events();
    }

    /**
     * Notes where every moving body starts the step, and wakes the sleepers the game gave a
     * speed or moved, or all of them when gravity changed.
     */
    private note_starts(): void {
        const moving = this.moving;
        if (this.start_x.length < moving.length) {
            this.start_x = new Float64Array(moving.length * 2);
            this.start_y = new Float64Array(moving.length * 2);
            this.deepest = new Float64Array(moving.length * 2);
        }
        this.deepest.fill(0, 0, moving.length);
        const gravity = this.gravity;
        const is_new_gravity =
            gravity.x !== this.last_gravity.x ||
            gravity.y !== this.last_gravity.y;
        this.last_gravity = { x: gravity.x, y: gravity.y };
        let sleepers = 0;
        for (let index = 0; index < moving.length; index++) {
            const body = moving[index];
            const position = body.position;
            if (body.is_sleeping) {
                const is_disturbed =
                    is_new_gravity ||
                    body.velocity.x !== 0 ||
                    body.velocity.y !== 0 ||
                    position.x !== body.rest.x ||
                    position.y !== body.rest.y;
                if (is_disturbed) {
                    body.wake();
                } else {
                    sleepers += 1;
                }
            }
            this.start_x[index] = position.x;
            this.start_y[index] = position.y;
        }
        this.sleepers = sleepers;
    }

    /** Notes that moving body `index` was pushed `depth` deep in this step. */
    private note_push(index: number, depth: number): void {
        if (depth > this.deepest[index]) {
            this.deepest[index] = depth;
        }
    }

    /**
     * After the step: how far each awake body went, and whether it has rested at one spot for
     * `sleep_seconds`, which puts it to sleep. A body that a contact pushed further than twice
     * `sleep_distance` isn't resting, even when the pushes leave it where it was: it is wedged,
     * and asleep it would stay inside what it is wedged into.
     */
    private settle(): void {
        const moving = this.moving;
        const dt = this.step_seconds;
        let sleeping = 0;
        for (let index = 0; index < moving.length; index++) {
            const body = moving[index];
            if (body.is_sleeping) {
                sleeping += 1;
                continue;
            }
            const position = body.position;
            body.step_distance = Math.hypot(
                position.x - this.start_x[index],
                position.y - this.start_y[index],
            );
            const rest = body.rest;
            const strayed = Math.hypot(
                position.x - rest.x,
                position.y - rest.y,
            );
            const is_resting =
                strayed <= this.sleep_distance &&
                this.deepest[index] <= this.sleep_distance * WEDGED_SHARE;
            if (is_resting) {
                rest.seconds += dt;
            } else {
                rest.x = position.x;
                rest.y = position.y;
                rest.seconds = 0;
            }
            if (rest.seconds >= this.sleep_seconds) {
                body.is_sleeping = true;
                body.velocity.x = 0;
                body.velocity.y = 0;
                body.step_distance = 0;
                rest.x = position.x;
                rest.y = position.y;
                sleeping += 1;
            }
        }
        this.stats.sleeping = sleeping;
    }

    /** Drops the removed bodies, keeping the order. */
    private compact(): void {
        if (!this.has_removed) {
            return;
        }
        const is_in_world = (body: PhysicsBody<D>) => body.is_in_world;
        this.all = this.all.filter(is_in_world);
        this.moving = this.moving.filter(is_in_world);
        this.still = this.still.filter(is_in_world);
        this.has_removed = false;
    }

    /** Lets the broad phase know the still bodies, when they changed. */
    private stand_still_bodies(): void {
        if (!this.is_still_changed) {
            return;
        }
        this.broad.stand(this.still.map((body) => ({ ...body.box })));
        this.is_still_changed = false;
    }

    /**
     * Sorts the moving bodies lowest first along gravity. From one step to the next the order
     * hardly changes, and the engine's sort is close to linear on an almost sorted list.
     */
    private sort_bodies(): void {
        this.compact();
        this.stand_still_bodies();
        const gravity = this.gravity;
        const length = Math.hypot(gravity.x, gravity.y);
        if (length === 0) {
            this.down = null;
            return;
        }
        const down = { x: gravity.x / length, y: gravity.y / length };
        this.down = down;
        this.moving.sort(
            (a, b) =>
                b.position.x * down.x +
                b.position.y * down.y -
                (a.position.x * down.x + a.position.y * down.y),
        );
    }

    /** The still bodies `body` meets that its `box` may touch, in the order they were added. */
    private walls_near(body: PhysicsBody<D>, box: RectI): PhysicsBody<D>[] {
        const indices = this.wall_indices;
        this.broad.near(box, indices);
        const walls = this.walls;
        walls.length = 0;
        for (const index of indices) {
            const wall = this.still[index];
            if (body.meets(wall)) {
                walls.push(wall);
            }
        }
        return walls;
    }

    /** Moves moving body `index` by `delta` against the still bodies, as the rule says. */
    private move(index: number, delta: Vector2I): void {
        const body = this.moving[index];
        const box = body.box;
        const swept = this.swept;
        swept.left = box.left + Math.min(0, delta.x);
        swept.top = box.top + Math.min(0, delta.y);
        swept.width = box.width + Math.abs(delta.x);
        swept.height = box.height + Math.abs(delta.y);
        const walls = this.walls_near(body, swept);
        if (walls.length === 0) {
            body.position.x += delta.x;
            body.position.y += delta.y;
            return;
        }
        this.stats.pairs_tested += walls.length;
        const moved = this.rule.move(body, delta, walls);
        body.position.x += moved.offset.x;
        body.position.y += moved.offset.y;
        for (const hit of moved.hits) {
            this.stats.contacts += 1;
            this.note_push(index, Math.hypot(hit.overlap.x, hit.overlap.y));
            this.land(index, walls[hit.wall], hit.normal);
        }
    }

    /** The moving pairs whose boxes, grown by `PAIR_MARGIN`, overlap: flat, two indices a pair. */
    private find_pairs(): void {
        const moving = this.moving;
        const boxes = this.boxes;
        while (boxes.length < moving.length) {
            boxes.push({ left: 0, top: 0, width: 0, height: 0 });
        }
        boxes.length = moving.length;
        for (let index = 0; index < moving.length; index++) {
            const box = moving[index].box;
            const grown = boxes[index];
            grown.left = box.left - PAIR_MARGIN;
            grown.top = box.top - PAIR_MARGIN;
            grown.width = box.width + 2 * PAIR_MARGIN;
            grown.height = box.height + 2 * PAIR_MARGIN;
        }
        // the boxes of removed bodies go last, so that what rested on them wakes
        const wake_boxes = this.sleepers > 0 ? this.wake_boxes : [];
        for (const box of wake_boxes) {
            boxes.push(box);
        }
        this.wake_boxes.length = 0;
        const pairs = this.pairs;
        this.broad.pairs(boxes, pairs);
        boxes.length = moving.length;
        if (this.sleepers > 0) {
            this.wake_near(pairs);
        }
        // two sleepers are not tested, nor pairs whose layers and masks rule them out
        let kept = 0;
        for (let at = 0; at < pairs.length; at += 2) {
            const first = pairs[at];
            const second = pairs[at + 1];
            if (second >= moving.length) {
                continue;
            }
            const a = moving[first];
            const b = moving[second];
            if ((a.is_sleeping && b.is_sleeping) || !a.meets(b)) {
                continue;
            }
            pairs[kept] = first;
            pairs[kept + 1] = second;
            kept += 2;
        }
        pairs.length = kept;
    }

    /**
     * Wakes the sleepers near the box of a removed body, and those near a body that moved more
     * than a fifth of `sleep_distance` in its last step. A body that has only just woken hasn't
     * moved yet, so waking spreads a step at a time, and only as far as things move.
     */
    private wake_near(pairs: readonly number[]): void {
        const moving = this.moving;
        const moved = this.sleep_distance * WAKE_SHARE;
        for (let at = 0; at < pairs.length; at += 2) {
            const first = pairs[at];
            const second = pairs[at + 1];
            if (first >= moving.length) {
                // two removed bodies
                continue;
            }
            const a = moving[first];
            if (second >= moving.length) {
                if (a.is_sleeping) {
                    a.wake();
                }
                continue;
            }
            const b = moving[second];
            if (a.is_sleeping === b.is_sleeping || !a.meets(b)) {
                continue;
            }
            const sleeper = a.is_sleeping ? a : b;
            const awake = a.is_sleeping ? b : a;
            if (awake.step_distance > moved) {
                sleeper.wake();
            }
        }
    }

    /** One pass: moving pairs apart, then whatever got pushed out of the walls again. */
    private separate(): void {
        const moving = this.moving;
        const pairs = this.pairs;
        const pushed = this.pushed;
        pushed.length = moving.length;
        pushed.fill(false);
        const rule = this.rule;
        for (let index = 0; index < pairs.length; index += 2) {
            const a = moving[pairs[index]];
            const b = moving[pairs[index + 1]];
            this.stats.pairs_tested += 1;
            const contact = rule.overlap(a, b);
            if (contact === null) {
                continue;
            }
            this.stats.contacts += 1;
            this.push_apart(pairs[index], pairs[index + 1], contact);
            pushed[pairs[index]] = true;
            pushed[pairs[index + 1]] = true;
        }
        for (let index = 0; index < moving.length; index++) {
            if (pushed[index] && !moving[index].is_sleeping) {
                this.push_out_of_walls(index);
            }
        }
    }

    /**
     * Both bodies give way by the share of the other's mass, and lose their closing speed. A body
     * that rests on something still is a still floor to the body on top of it: the upper one
     * takes the whole push and lands on it as on a wall. So a pile doesn't sink into itself,
     * doesn't pass its weight down as speed, and a landing column doesn't bounce each crate off
     * the bounce of the one below. Lowest pairs come first, so the support climbs a pile in one
     * pass. A sleeping body holds still like a wall, whichever side it is on, unless the other
     * is pushed deep into it: then it wakes and gives way.
     */
    private push_apart(first: number, second: number, contact: Contact): void {
        const a = this.moving[first];
        const b = this.moving[second];
        const supported = this.supported;
        const normal = contact.normal;
        const depth = contact.depth;
        const down = this.down;
        this.note_push(first, depth);
        this.note_push(second, depth);
        if (depth > this.sleep_distance * WEDGED_SHARE) {
            // pushed deep into a sleeper: it gives way too, or the knot never loosens
            if (a.is_sleeping) {
                a.wake();
            }
            if (b.is_sleeping) {
                b.wake();
            }
        }
        if (b.is_sleeping) {
            a.position.x += normal.x * depth;
            a.position.y += normal.y * depth;
            this.land(first, b, normal);
            return;
        }
        if (a.is_sleeping) {
            const up = this.up;
            up.x = -normal.x;
            up.y = -normal.y;
            b.position.x += up.x * depth;
            b.position.y += up.y * depth;
            this.land(second, a, up);
            return;
        }
        if (down !== null) {
            // the normal points from b towards a: against gravity means a is on top
            const along = normal.x * down.x + normal.y * down.y;
            if (-along >= SUPPORT_SLOPE && supported[second]) {
                a.position.x += normal.x * depth;
                a.position.y += normal.y * depth;
                this.land(first, b, normal);
                return;
            }
            if (along >= SUPPORT_SLOPE && supported[first]) {
                const up = this.up;
                up.x = -normal.x;
                up.y = -normal.y;
                b.position.x += up.x * depth;
                b.position.y += up.y * depth;
                this.land(second, a, up);
                return;
            }
        }
        const inverse_a = 1 / a.mass;
        const inverse_b = 1 / b.mass;
        const share_a = inverse_a / (inverse_a + inverse_b);
        const share_b = 1 - share_a;
        a.position.x += normal.x * depth * share_a;
        a.position.y += normal.y * depth * share_a;
        b.position.x -= normal.x * depth * share_b;
        b.position.y -= normal.y * depth * share_b;
        const closing =
            (a.velocity.x - b.velocity.x) * normal.x +
            (a.velocity.y - b.velocity.y) * normal.y;
        if (closing >= 0) {
            return;
        }
        const after = elastic_impact(
            a,
            b,
            normal,
            this.restitution_at(-closing),
        );
        this.rub(a, after.a, b, after.b, normal, -closing);
        if (this.is_event(a, b, -closing)) {
            this.pending.push(new ContactEvent(a, b, { ...normal }, -closing));
        }
    }

    /**
     * Friction between two moving bodies: their sliding against each other loses `friction`
     * times the closing speed the contact took, split by mass, never past standing still.
     */
    private rub(
        a: PhysicsBody<D>,
        after_a: Vector2I,
        b: PhysicsBody<D>,
        after_b: Vector2I,
        normal: Vector2I,
        closing: number,
    ): void {
        // the tangent is the normal turned a quarter: (-normal.y, normal.x)
        const tangent_x = -normal.y;
        const tangent_y = normal.x;
        const sliding =
            (after_a.x - after_b.x) * tangent_x +
            (after_a.y - after_b.y) * tangent_y;
        const loss = Math.min(Math.abs(sliding), this.friction * closing);
        const inverse_a = 1 / a.mass;
        const inverse_b = 1 / b.mass;
        const share_a = inverse_a / (inverse_a + inverse_b);
        const change = Math.sign(sliding) * loss;
        a.velocity.x = after_a.x - change * share_a * tangent_x;
        a.velocity.y = after_a.y - change * share_a * tangent_y;
        b.velocity.x = after_b.x + change * (1 - share_a) * tangent_x;
        b.velocity.y = after_b.y + change * (1 - share_a) * tangent_y;
    }

    private push_out_of_walls(index: number): void {
        const body = this.moving[index];
        const walls = this.walls_near(body, body.box);
        const rule = this.rule;
        for (const wall of walls) {
            this.stats.pairs_tested += 1;
            const contact = rule.overlap(body, wall);
            if (contact === null) {
                continue;
            }
            this.stats.contacts += 1;
            this.note_push(index, contact.depth);
            body.position.x += contact.normal.x * contact.depth;
            body.position.y += contact.normal.y * contact.depth;
            this.land(index, wall, contact.normal);
        }
    }

    /**
     * What touching a still body does to the speed: the part into it is gone but for the
     * restitution, and sliding along it loses `friction` times that part. A wall facing up
     * enough holds the body up.
     */
    private land(index: number, wall: PhysicsBody<D>, normal: Vector2I): void {
        const body = this.moving[index];
        const down = this.down;
        if (down !== null && holds_up(normal, down)) {
            this.supported[index] = true;
        }
        const velocity = body.velocity;
        const into = -(velocity.x * normal.x + velocity.y * normal.y);
        if (into <= 0) {
            return;
        }
        const after = reflect(velocity, normal, this.restitution_at(into));
        // the tangent is the normal turned a quarter: (-normal.y, normal.x)
        const tangent_x = -normal.y;
        const tangent_y = normal.x;
        const sliding = after.x * tangent_x + after.y * tangent_y;
        const slowed =
            Math.sign(sliding) *
            Math.max(0, Math.abs(sliding) - this.friction * into);
        velocity.x = after.x + (slowed - sliding) * tangent_x;
        velocity.y = after.y + (slowed - sliding) * tangent_y;
        if (this.is_event(body, wall, into)) {
            this.pending.push(
                new ContactEvent(body, wall, { ...normal }, into),
            );
        }
    }

    /** Whether a contact of `a` and `b` closing at `speed` sends an event: fast enough, and one of them on `contact_event_layers`. */
    private is_event(
        a: PhysicsBody<D>,
        b: PhysicsBody<D>,
        speed: number,
    ): boolean {
        return (
            speed >= this.contact_event_speed &&
            ((a.layer | b.layer) & this.contact_event_layers) !== 0
        );
    }

    /** `restitution`, or none for a contact closing slower than `bounce_speed`. */
    private restitution_at(closing: number): number {
        return closing < this.bounce_speed ? 0 : this.restitution;
    }

    /** The step's contacts, oldest first; a listener may add and remove bodies. */
    private send_events(): void {
        const events = this.pending;
        if (events.length === 0) {
            return;
        }
        this.pending = [];
        for (const event of events) {
            this.events.dispatch(event);
        }
    }
}
