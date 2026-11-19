# Cut-out puppets

A puppet is a skeleton of bones with picture parts on them: a thigh, a shin and a boot, each cut out on its own, each turning on its joint. Clips turn the bones over time, and the parts follow. Unlike a sprite sheet ([animation.md](animation.md)) a pose can be anything between two keys, two clips blend into each other, and the same clips play on any set of parts made for the same bones: swap the parts and a wanderer runs as a gardener. Since 6.2.0 (`canvas/puppet`), first used by Spielwerk step 38, Puppenspieler.

- **`PuppetRig`**: everything a puppet is, made from plain data: bones, slots (the drawing order), skins (sets of parts in one picture), anchors and clips.
- **`Puppet`**: one puppet on stage: its own `Skeleton`, the skin it wears and a `PuppetPlayer`. Many puppets share a rig.
- **`PuppetPlayer`**: plays the rig's clips for one puppet: `play` with a fade, `queue`, `then`, `speed`, `paused`, `seek`, and named moments as events.
- **`Skeleton`**: the bones in flat arrays: the pose (`rotation`, `x`, `y` per bone, on the rest pose) and the world matrices `update()` makes from it.
- **`PuppetClip`**: one clip: keys per bone, sampled at any time.

The format is our own, close to Spine's and DragonBones' ideas (bones, slots, skins, keyed tracks) but much smaller; no Spine runtime or file is involved.

## A puppet in four lines

```ts
const rig = PuppetRig.from_data(rig_data, atlas_image);
const hero = rig.puppet("idle");          // one Puppet per character; many share a rig

// every frame:
hero.update(delta_seconds);
hero.draw(context, hero_x, floor_y, { flip_x: facing_left, scale: 0.6 });
```

- **`draw(context, x, y, { scale, flip_x, debug, debug_color, highlight })`** draws the parts in slot order, each on its bone, with the puppet's feet (the root bone) at `x`, `y`; `flip_x` mirrors it around its feet. `debug` draws the bones and joints on top, `highlight` one bone thicker (an editor's pick). It answers false while the data or the picture isn't there. The context's transform is the same afterwards: draw a puppet inside a camera's transform as anything else.
- **`play(name, { fade, restart })`** and **`queue(name)`** go to the player (below).
- **`set_skin(skin)`** puts on another set of parts (below).
- **`skeleton`**: change the pose after `update()` and call `skeleton.update()` to turn a head towards the mouse, or let an editor pose it.

## The rig as plain data

A rig is a JSON object, the shape a catalogue entry's `rig` has (dll-tce-assets 0.5.0), so an entry feeds `PuppetRig.from_data()` as it is. Units are the atlas's pixels, y points down, angles are degrees turning clockwise on the screen (from +x towards +y), and the root bone sits where the puppet stands.

```json
{
    "skeleton": "biped-side",
    "facing": "right",
    "bones": [
        { "name": "root", "length": 42 },
        { "name": "hip", "parent": "root", "y": -168, "rotation": -90, "length": 16.8 },
        { "name": "torso", "parent": "hip", "length": 105 },
        { "name": "thigh_r", "parent": "hip", "x": -12.6, "rotation": 180, "length": 65.1 }
    ],
    "slots": [
        { "name": "torso", "bone": "torso" },
        { "name": "thigh_r", "bone": "thigh_r" }
    ],
    "skins": {
        "wanderer": {
            "attachments": {
                "torso": { "rect": [154, 4, 89, 141], "pivot": [45.7, 121.5], "rotation": 90 },
                "thigh_r": { "rect": [297, 4, 46, 108], "pivot": [22.7, 23.1], "rotation": -90 }
            }
        }
    },
    "anchors": { "heel_r": { "bone": "foot_r", "x": -12.6, "y": 27.3 } },
    "clips": {
        "walk": {
            "length": 1, "loop": true, "travel": 177.68,
            "events": { "0": "step", "0.5": "step" },
            "tracks": { "thigh_r": [{ "t": 0, "rotation": -24 }, { "t": 0.125, "rotation": -14 }] }
        }
    },
    "default_clip": "idle"
}
```

(Cut down from the wanderer: the whole rig has 16 bones, 15 slots, two anchors per foot and five clips.)

- **`bones`**: parents before their children. A bone's `x`, `y` is where its joint sits in its parent's frame (along the parent is +x), `rotation` its angle on the parent's at rest, `length` from the joint to its tip (for drawing and picking the bones). All default to 0.
- **`slots`**: places for parts, in drawing order: the first is drawn first, behind the others. A slot sits on a bone. The far arm comes before the torso, the near arm after it.
- **`skins`**: sets of parts by name, all in the rig's one picture. A part (`attachments[slot]`) is a `rect` `[x, y, width, height]` of the atlas, its `pivot` (the point of the part, from the rectangle's top left, that sits on the bone's joint) and its `rotation` on the bone (a part drawn upright on a bone that points down is `-90`). `resolution` says how many atlas pixels make one unit, for a sharper atlas of the same puppet. A slot a skin has no part for draws nothing. `default_skin` is the one a new puppet wears (default: the first).
- **`anchors`**: named points on bones, in the bone's frame: the soles' heel and toe, where a hat or a sword goes. `rig.anchors.get(name)` and `skeleton.world_point(anchor.bone, anchor.x, anchor.y)` say where they are now.
- **`clips`** (below), **`default_clip`** (default: the first), `facing` (the way the pictures face), `bounds` (the rest pose's box around the root, `[x, y, width, height]`).

`from_data()` checks it and throws with a clear message: a bone before its parent, two bones of one name, a slot on an unknown bone, a part for an unknown slot, a clip on an unknown bone, keys out of order, an event past a clip's end. `new PuppetRig()` is a rig still on its way; `set_data(data)` fills it later and `image = picture` brings the picture; `has_data` and `is_ready` say how far it is, and `version` counts the changes (puppets made before follow by themselves).

## Clips as plain data

```json
"jump": {
    "length": 1.1,
    "then": "idle",
    "events": { "0.3": "jump", "0.8": "land" },
    "tracks": {
        "hip": [{ "t": 0, "y": 0 }, { "t": 0.3, "y": -6, "ease": "smooth" }, { "t": 0.55, "y": -150 }, { "t": 0.8, "y": 0 }],
        "thigh_r": [{ "t": 0, "rotation": 0 }, { "t": 0.25, "rotation": -40, "ease": "step" }]
    }
}
```

- **Keys are offsets on the rest pose**: `rotation` in degrees added to the bone's rest angle, `x` and `y` added to its rest position in the parent's frame (the hip's bob in a walk, a jump's height). A key may leave a channel out; it is then taken from the keys around it that have it. A bone without a track stays at rest.
- **`ease`** goes from this key to the next: `linear` (default), `smooth` (in and out) or `step` (hold until the next key).
- **`loop`** wraps from the last key to the first; without it the clip stops at its end and holds its last pose, or goes on with **`then`**.
- **`events`** name moments by time, in seconds as written (`{ "0.5": "step" }`).
- **`travel`**: how fast a standing foot slides back, in units per second. Move the puppet this fast (times its draw scale) and its feet don't skate. Leave it out for clips on the spot.

`rig.clip(name)` gives the `PuppetClip`; `clip.sample(time, skeleton)` poses a skeleton at any moment, `clip.moments` lists the events, `clip.to_data()` turns it back into data. `rig.add_clip(name, data)` adds or replaces a clip at run time (an editor's clip, below).

## The player

```ts
hero.play("run");                       // at once, the bones blend over default_fade (0.15 s)
hero.play("idle", { fade: 0.4 });       // a slower blend
hero.play("wave", { restart: true });   // from the start, also when it's playing
hero.queue("jump");                     // after the current clip's round
hero.player.speed = 1.5;
hero.player.events.attach(PuppetMomentEvent, (event) => {
    if (event.name === "step") {
        audio.play_sound("step");
    }
});
```

- **`play` fades** from the pose before into the new clip: every bone's angle blends the short way round (from 170° to -170° is 20°, not 340°), positions linearly. `fade: 0` cuts.
- **Time carries over**: what is left of an update at a clip's end goes into the next clip, so a walk that loops at 1 s and an update of 0.1 s at 0.95 s lands at 0.05 s.
- **Moments are sent once each**, also when one update passes several, at any `speed`: `PuppetMomentEvent` (`name`, `clip`, `time`) on `events`, and `PuppetEndEvent` (`clip`, `next`) when a clip played once ends. `sends_events = false` keeps a puppet quiet (a crowd in the back). More than `MAX_ROUNDS_PER_UPDATE` rounds in one update drop the rest: a tab that slept for an hour doesn't replay the hour.
- **`paused`** stops the time; **`seek(time)`** jumps within the clip without sending moments (an editor's scrubbing).
- `clip`, `clip_name`, `time`, `finished`, `queued`, `fading` say where it is.

## Reskinning

Two rigs with the same `skeleton` name have the same bones and slots: one's skin fits the other's puppet, and both play the same clips.

```ts
const wanderer = rig_of_wanderer.puppet("run");
wanderer.set_skin(rig_of_gardener);     // the gardener's default skin: same bones, same run
wanderer.set_skin("wanderer");          // one of its own skins by name
```

`set_skin` takes a skin name of the puppet's rig, a `PuppetSkin`, another `PuppetRig` (its default skin; one still loading is worn when it comes, the puppet's own until then) or another `Puppet`. It answers false, and nothing changes, for a skin of another skeleton or a name the rig doesn't have. The bones, the clip and its time stay; only the parts change.

A rig may also hold several skins itself (`skins` in the data): a red and a blue team in one atlas.

## In the game shell

A picture of `settings.catalogue_images` whose catalogue entry has a `rig` brings its puppet along: the host's `load_catalogue_url()` answers with `rig` in the `CatalogueFile`, and the shell puts it into `references.puppet(name)`. `logic.load_puppet(name, clip?)` is then a puppet in one line:

```ts
class TheatreSettings extends CanvasGameSettings {
    public override readonly catalogue_images = {
        wanderer: "rendered/puppet/wanderer",
        gardener: "rendered/puppet/gardener",
    };
}

// in the logic:
protected create_game(): Game {
    const hero = this.load_puppet("wanderer");
    hero.set_skin(this.references.puppet("gardener"));   // optional: the other's parts
    return new Game({ hero });
}
```

The puppet exists at once and waits while the data is on its way: it draws nothing and plays nothing; it starts the clip it was told (or the rig's default clip) as soon as the rig has it, and draws once the picture has come. `references.puppet(name).set_data(data)` also takes a game's own rig for a picture of `settings.images`. `@tce-v3/game-boot` fills the hook from `dll-tce-assets` (0.5.0 and later: `rendered/puppet/wanderer` and `rendered/puppet/gardener`).

## Picking a bone

For an editor or a game where a player grabs a limb:

```ts
const local = hero.to_local(pointer_x, pointer_y, hero_x, floor_y, { scale: 0.6, flip_x });
const bone = hero.pick_bone(local.x, local.y, 12);    // -1 for none
```

- **`to_local(px, py, x, y, options)`** turns a point of the context (where `draw()` drew the puppet with these options) into the puppet's own space.
- **`pick_bone(x, y, within)`**: of the parts under the point, the one whose bone line passes nearest. Where bone lines lie on each other (an arm hanging over the torso) the part drawn on top wins; where a forearm's rounded end reaches over the elbow, the upper arm's line is nearer. Off the parts, the bone line nearest within `within`.
- **`slot_at(x, y)`**: the slot whose part is drawn on top at the point (rectangles, not pixels); `rig.slots[slot].bone` is its bone.
- **`skeleton.nearest_bone(x, y, within)`** and **`distance_to_bone(index, x, y)`** go by the bone lines alone.

To turn a picked bone towards the pointer, set its pose so its world angle points there: `skeleton.rotation[bone] += target_angle - skeleton.world_rotation(bone)` (in degrees, the short way round), then `skeleton.update()`. Step 38's `ClipEditor` holds the clip still (`paused`, `seek`), lets a bone be dragged, and "Key setzen" writes every changed bone as a key into its own clip with `rig.add_clip()`, which plays back at once.

## Without a picture

The rig, the skeleton and the clips need no picture: `PuppetRig.from_data(data)` without an image plays its clips and poses its skeleton, so tests check poses, feet on the ground (`skeleton.world_point` of the sole anchors) and events in Node. `draw()` answers false until a picture comes; `debug: true` draws the bones even then.

## What it costs

Measured in Spielwerk step 38 (Intel i7-11700F; the wanderer, 16 bones and 15 parts, running, drawn at 0.3 so about 120 pixels tall):

| | Node 22 | Chromium, software canvas (headless) | Chrome on an RTX 4070 (window, ANGLE OpenGL) |
| --- | --- | --- | --- |
| Update 1 / 100 / 1 000 puppets | 0.003 / 0.10 / 0.57 ms | 0.001 / 0.12 / 1.2 ms | 0.002 / 0.12 / 1.2 ms |
| Draw 1 / 100 puppets (the script's time) | 0.003 / 0.017 ms (no canvas) | 0.013 / 1.4 ms | 0.013 / 1.4 ms |
| Most running puppets at 57 FPS or more, 960 × 640 | | 120 | 400 |

Updating is never the limit: a thousand puppets pose in about a millisecond. Drawing is the bill, one `setTransform` and one `drawImage` per part (about 1 µs of script per part, and the pixels after it): a few dozen puppets on any machine, a few hundred on a graphics card. For crowds of thousands, a sprite sheet rendered from the puppet ([animation.md](animation.md#crowds)) is the cheaper way.
