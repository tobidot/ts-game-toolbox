# Cut-out puppets

A puppet is a skeleton of bones with picture parts on them: a thigh, a shin and a boot, each cut out on its own, each turning on its joint. Clips turn the bones over time, and the parts follow. Unlike a sprite sheet ([animation.md](animation.md)) a pose can be anything between two keys, two clips blend into each other, and the same clips play on any set of parts made for the same bones: swap the parts and a wanderer runs as a gardener. Since 6.2.0 (`canvas/puppet`), first used by Spielwerk step 38, Puppenspieler.

- **`PuppetRig`**: everything a puppet is, made from plain data: bones, slots (the drawing order), skins (sets of parts in one picture), anchors and clips.
- **`Puppet`**: one puppet on stage: its own `Skeleton`, the skin it wears and a `PuppetPlayer`. Many puppets share a rig.
- **`PuppetPlayer`**: plays the rig's clips for one puppet: `play` with a fade, `queue`, `then`, `speed`, `paused`, `seek`, and named moments as events.
- **`Skeleton`**: the bones in flat arrays: the pose (`rotation`, `x`, `y` per bone, on the rest pose) and the world matrices `update()` makes from it.
- **`PuppetClip`**: one clip: keys per bone, sampled at any time.
- **`Wardrobe`**: clothes and accessories for every puppet of one skeleton, in one atlas: pieces (a hat, a coat with its sleeves and tails) on bones and anchors, worn by place (since step 39, Kleiderschrank; [below](#clothes-on-anchors)).
- **Body shape and skin**: shape values that scale bones and bend parts as meshes (`PartMesh`), tints that keep the shading, marks from a `MarkSheet` laid onto the skin, and the whole `character` as data (since step 40, Maskenbildner; [below](#body-shape-and-skin)).
- **Soft skins**: one whole picture under a fine grid whose points follow up to four bones (`SoftSkin`, `SoftMesh`), weights from a bone map; drawn by a `SoftLayer` with WebGL 2 or on the CPU; scale keys for stretch and squash, and bones that jiggle after the motion (`PuppetJiggle`) (since step 41, Gummihaut; [below](#soft-skins)).
- **Generated creatures**: a monster from a kind and a seed: its skeleton from a template with ranges, its body from a part kit painted into one soft skin (`compose_soft_skin`), gaits made from its measurements (two-bone IK for planted feet, a worm's wave, a flier's flap), and attacks with hit moments and hit areas; all of it plain data (since step 42, Bestiarium; [below](#generated-creatures)).
- **Drawn characters**: a picture drawn whole in a paint program, a skeleton template laid onto it by its joints (`rig_from_picture`), a soft skin and the template's clips at once; source folders that keep every rigged item editable (`build_rig_source`, `split_rig_atlas`), and a draw-over sheet (`template_sheet`) (since step 43, Knochenwerkstatt; [below](#drawn-characters)).

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
- **`anchors`**: named points on bones, in the bone's frame: the soles' heel and toe, where a hat or a sword goes. An anchor may have a `rotation` on its bone (default 0); clothes hang on it turned by that much, so a piece drawn upright hangs upright at rest (the catalogue's puppets have `head_top`, `hand_r`, `hand_l`, `belt`, `back`, `foot_r` and `foot_l`, each pointing the way the puppet faces at rest). `rig.anchors.get(name)` and `skeleton.world_point(anchor.bone, anchor.x, anchor.y)` say where they are now, `puppet.anchor_world(name)` with its angle.
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
- **`scale_x`** and **`scale_y`** (since step 41) stretch the bone along and across, above 0; one alone keeps the area. See [Soft skins](#soft-skins).
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

## Clothes on anchors

A **wardrobe** is a second atlas for every puppet of one skeleton: pieces of clothing and things to hold, each in a **place** (`hat`, `top`, `trousers`, `shoes`, `back`, `hand_r`, ...), one piece per place. A piece has one or more parts: a hat is one part on the `head_top` anchor, a coat is a torso part, four sleeve parts on the arm bones and two tails on the thighs. The parts follow their bones as the skin's do, through every clip and on every skin of the skeleton: a coat made once fits the wanderer and the gardener.

```ts
const clothes = Wardrobe.from_data(clothes_data, clothes_atlas);
const hero = rig.puppet("walk");
hero.use_wardrobe(clothes);                           // shared by every puppet that uses it
hero.wear("straw-hat");                               // in its place: what was there comes off
hero.set_outfit({ hat: "top-hat", top: "blue-coat" }); // the whole outfit, one change
hero.take_off("hat");                                 // a place, or a piece's id
save(hero.outfit);                                    // plain data: { top: "blue-coat" }
```

The data, the shape a catalogue entry's `rig` has for a wardrobe (dll-tce-assets 0.6.0, `rendered/puppet/clothes` and `rendered/puppet/accessories`):

```json
{
    "skeleton": "biped-side",
    "facing": "right",
    "places": { "trousers": 10, "shoes": 20, "top": 30, "hat": 60 },
    "pieces": {
        "straw-hat": {
            "place": "hat", "title": "Strohhut",
            "parts": [{ "name": "hat", "anchor": "head_top", "rect": [625, 480, 188, 56], "pivot": [96, 36.2] }]
        },
        "blue-coat": {
            "place": "top", "title": "Blauer Mantel",
            "parts": [
                { "name": "torso", "bone": "torso", "rect": [132, 4, 112, 151], "pivot": [49.7, 124.5], "rotation": 90 },
                { "name": "sleeve_upper_r", "bone": "upper_arm_r", "rect": [55, 292, 47, 97], "pivot": [23.7, 23.5], "rotation": -90 },
                { "name": "tail_l", "bone": "thigh_l", "rect": [196, 393, 77, 82], "pivot": [40.7, 18.1], "rotation": -90 }
            ]
        },
        "staff": {
            "place": "hand_r", "title": "Wanderstab",
            "parts": [{ "name": "staff", "anchor": "hand_r", "rect": [4, 4, 27, 273], "pivot": [8.9, 137], "behind": "hand_r" }]
        }
    }
}
```

- **`places`**: the places by name with their **layer**: of two parts at the same spot the lower layer lies nearer the body (trousers under boots under a coat). A piece in a place the wardrobe doesn't list is an error.
- **A part** sits on a `bone` or on an `anchor` (one of them), with `rect`, `pivot` and `rotation` as a skin's part. On an anchor, the pivot sits on the anchor's point and the part turns with the anchor's angle.
- **Where it is drawn** is data, never decided by a frame: by default in front of the first slot on its bone (a sleeve over the arm); `in_front_of: "slot"` in front of another slot; `behind: "slot"` behind one (a backpack behind the far thigh, a staff behind the hand that holds it); `slot: "slot"` instead of the skin's part there (a whole new foot). Among parts at one spot the place's layer orders them (`layer` on a part overrides it): in front, the inner layer first; behind, the outer layer furthest back. Ties go by piece id, then by the part's number.
- `title` is what a game shows; `resolution` as a skin's.

**The drawing order** is sorted once when the outfit changes (or the skin, the rig or a wardrobe's data), never per frame: `puppet.drawing_order` is the same array until then, the slots' names and `"piece:part"` for clothes (`"blue-coat:sleeve_upper_r"`), for tests and editors. Drawing a dressed puppet is one `setTransform` and one `drawImage` per part, as without clothes.

- **`use_wardrobe(wardrobe)`**: a puppet may use several (step 39: clothes and accessories); `find_piece(id)` looks in them in order. A wardrobe still loading is fine: an outfit naming its pieces waits for it and is worn when it comes (`set_outfit` answers true).
- **`wear(id)`**, **`take_off(place_or_id)`**, **`undress()`**, **`set_outfit(outfit)`**, **`outfit`** (`OutfitData`, a piece id per place: save it as it is), **`worn_pieces`**. `wear` answers false, and nothing changes, for a piece none of the wardrobes has or one that doesn't fit; `fit_problems(id)` says why (`no anchor "back"`, `is made for the skeleton "quadruped", not "biped-side"`). `set_outfit` leaves such pieces out and answers false.
- **`events`**: an `OutfitEvent` per change (`outfit`, `put_on`, `taken_off`), one for a whole `set_outfit`: a line on the stage ("Strohhut an"), a sound, an autosave.
- **`anchor_world(name, x?, y?, { scale, flip_x }?)`**: where an anchor is now, with its angle (`{ x, y, rotation }`), in the puppet's own space or, given where and how `draw()` draws it, in the context's (mirrored with `flip_x`, the angle too). For a game that spawns a spark at the sword's tip or a ball at the hand. After `update()`.
- **`bounds(of?)`**: the box around the parts as drawn now, of everything, the `"body"`, the `"clothes"` or one worn piece (its id). **`draw(..., { only_clothes: true })`** leaves the skin out: a piece on a hanger, framed with `bounds(id)`, as Kleiderschrank's drawers show them.
- **`wardrobe.problems_on(rig, id)`**, **`pieces_in(place)`**, **`piece(id)`**, `places`, `pieces`: for a game's drawers and its tests. `Wardrobe.from_data()` throws with a clear message on data that doesn't hold together (a piece in an unknown place, a part on both a bone and an anchor, two orders for one part); whether a piece fits a rig is a separate question, asked when it is worn.

The skin changes under the clothes: `set_skin(other_rig)` keeps the outfit, and the same parts sit on the same bones. A rig made for a later step may give its bones other shapes; clothes made for the skeleton still follow the bones.

## Body shape and skin

A puppet can be made taller, broader, rounder or thinner, its skin and hair coloured, and marks laid onto its skin: tattoos, scars, freckles, paint. All of it is plain data on the puppet (a **character**), and all of it moves with the bones through every clip, the clothes included (since step 40, Maskenbildner).

```ts
const hero = this.load_puppet("model");             // a rig with shapes and tint layers
hero.use_marks(this.load_marks("marks"));           // a mark sheet from the catalogue
hero.set_shape({ belly: 0.6, height: 0.3 });         // each kept within its min and max
hero.set_tint("skin", "#c29062");                    // the colour times the skin's shading
hero.add_mark("anchor", "upper_arm_r", { x: 26, y: -1, size: 1.2 });
save(hero.character);                                // { skin, shape, tints, marks, outfit }
other.set_character(loaded);                         // the same character on another puppet
```

**Shape values** are named in the rig (`shapes`), each a number from `min` (default -1) to `max` (default 1), 0 being the rig as drawn:

```json
"shapes": {
    "height": { "title": "Größe", "bones": { "torso": [0.12, 0], "thigh_r": [0.12, 0], "head": [0.05, 0.05] } },
    "shoulders": { "title": "Schultern", "bones": { "torso": [0, 0.2], "hip": [0, 0.12] } },
    "belly": {
        "title": "Bauch", "min": -0.4,
        "pushes": [{ "bone": "torso", "along": [-35, 5, 45, 75], "across": [4, 26], "push": [0, 22] }]
    },
    "arms": { "title": "Arme", "min": -0.7, "pushes": [{ "bone": "upper_arm_r", "along": [-30, 5, 42.5, 77.5], "swell": 0.42 }] }
},
"soles": ["heel_l", "toe_l", "heel_r", "toe_r"]
```

- **`bones`**: per bone `[length, width]`, the scale added per unit of the value: at `height: 1` the torso is 1.12 times as long. A longer bone carries its children further out, and its parts stretch with it; clothes on it stretch alike. Pieces on an **anchor** (a hat, a sword) move with the scale but keep their size. Values add up, and a scale never goes below 0.05.
- **`soles`**: the anchors that stand on the ground. With longer or shorter legs the whole puppet is lifted or lowered so its lowest sole is where it was at shape 0: the feet stay on the floor through every clip (`skeleton.lift` says by how much).
- **`pushes`**: where a plain scale looks wrong (a belly is not a longer torso), the parts on a bone are drawn as a **mesh**: a grid of points over the part (`puppet.mesh_cell`, default 16 pixels) whose points move. A point at `(x, y)` in the bone's frame (x along the bone from its joint, y across; for a bone that points up, +y is forward) moves at value 1 by `weight * [push[0], push[1] + swell * y]`. The weight is `along`'s trapezoid `[a, b, c, d]` (nothing before `a` and after `d`, full from `b` to `c`, smooth in between) times `across`'s ramp `[from, to]` (nothing at `from`, full at `to`). `swell` makes a limb fatter or thinner by its distance from the bone line. Points with no weight never move, so a mesh is cut only where it bends; give two bones that meet the same weight at their joint and the joint never opens.

`set_shape(values)` changes the named values (the rest stay), `reset_shape()` sets all back to 0, `shape` gives every value of the rig. `PartMesh.for_part()`, `moves_for()`, `deform()` and `draw()` are there for a game's own meshes.

**Tint layers.** A skin's part may carry grey **layers**, rectangles of the atlas the size of the part, rendered from the part's skin or hair alone: `"head": { "rect": [4, 4, 146, 163], ..., "layers": { "skin": [304, 4, 146, 163], "hair": [154, 4, 146, 163] } }`. `set_tint("skin", "#c29062")` multiplies the colour into the layer's grey and lays it over the part, so the shading and the outline stay; `set_tint("skin", null)` takes it off. `tints` gives them as data.

**Marks** come from a **mark sheet**, an atlas of small pictures whose catalogue `rig` holds `marks` and no bones (dll-tce-assets 0.7.0, `rendered/puppet/marks`):

```json
{
    "resolution": 2,
    "marks": {
        "dragon": { "rect": [4, 63, 90, 34], "pivot": [38, 20], "title": "Drache", "kind": "tattoo" },
        "scar": { "rect": [4, 101, 54, 20], "pivot": [27, 10], "title": "Narbe", "kind": "scar", "blend": "normal", "opacity": 0.85 }
    }
}
```

`blend` is `"multiply"` (the default: ink in the skin) or `"normal"` (laid on: a plaster, paint), `on` names the layer it is clipped to (default `"skin"`; a part without that layer clips to its own outline). `MarkSheet.from_data(data, image)`, `sheet.mark(id)` (a `MarkPicture`), `puppet.use_marks(sheet)` (several sheets; one still loading is fine).

- **`add_mark(id, slot, { x, y, angle, size, tint, blend, opacity, flip })`** puts a mark on a slot's part, at `x`, `y` in its bone's frame (rig units, as for anchors), turned by `angle` degrees on the bone (default: upright on the screen at rest), `size` times as large, an ink `tint`. It answers its number, or -1 for a slot or a mark the puppet doesn't have. The mark is clipped to the part (its skin layer), so nothing reaches past the outline; it moves, turns, stretches and bends with the part.
- **`move_mark(index, placement, slot?)`**, **`remove_mark(index)`**, **`clear_marks()`**, **`marks`** (plain data, in the order laid on), **`set_marks(marks)`**, **`find_mark(id)`**.
- For a game that drags marks on: **`slot_at(x, y)`** (the part under a point of `to_local()`), **`to_part(slot, x, y)`** (that point in the part's bone frame, through the mesh: where a mark dropped there goes), **`mark_at(x, y, within)`** (the mark under a point, to pick one up), **`mark_point(index, x, y, options)`** (where it is now), **`upright_angle(slot)`** (the angle that shows a mark upright in the pose now).

**A character** is `CharacterData`: `{ skin, shape, tints, marks, outfit }`, all plain. `puppet.character` gives it, `set_character(data)` becomes it (what is left out goes back to plain) and answers false when something didn't fit (an unknown shape, slot, mark or piece), taking the rest. It goes through `SaveSlots` as it is, and Maskenbildner exports it as a file another game reads.

**Drawing.** A part whose shape, tints or marks are not plain gets its **look** laid into a canvas once per change: the part, its tint layers, its marks clipped to it, the whole moved through its mesh. The looks of a puppet are packed side by side into one canvas, so drawing it stays one `setTransform` and one `drawImage` per part, from one picture, as at shape 0, and nothing is laid again until something changes. `puppet.make_canvas` makes the canvases (a page's canvas or an `OffscreenCanvas`; the ones a look is laid in are kept in memory, `willReadFrequently`, and only the packed one goes to the graphics card). Without a canvas (Node) meshes are drawn triangle by triangle, each through its own clip and transform, and tints and marks stay off; `draw(..., { direct_meshes: true })` forces that, for measuring.

## Soft skins

A cut-out puppet shows its joints: a bent knee is two pictures turning on one point, their round ends lying over each other. A **soft skin** is one whole picture of the creature in its rest pose instead, with a fine grid over it: each grid point follows up to four bones, weighted, so a knee bends the picture smoothly and a stretched bone stretches it. No joints, nothing overlapping (since step 41, Gummihaut).

```ts
const beast = this.load_puppet("beast");              // a rig whose skin is soft: nothing else changes
const layer = new SoftLayer();                         // WebGL 2 where there is one, else the CPU

// every frame, in drawing order:
beast.update(delta_seconds);                           // its clips, its stretch and its jiggle
beast.draw(context, x, floor_y, { layer, scale: 0.6 });
layer.draw(context);                                   // every soft puppet added since the last draw
```

A skin is soft when it has `soft` (and may then have no parts at all):

```json
"skins": { "beast": { "attachments": {}, "soft": {
    "pictures": [
        { "name": "far", "rect": [4, 4, 232, 240], "map": [240, 4, 232, 240], "origin": [112, 234.5] },
        { "name": "body", "rect": [4, 248, 548, 191], "map": [4, 443, 548, 191], "origin": [321, 324.5] }
    ],
    "colors": { "body": "#ff0000", "chest": "#0080ff", "upper_hl": "#ff8000" },
    "cell_size": 12, "cpu_cell_size": 32, "blur": 20
} } }
```

- **`pictures`**, drawn back to front: a creature whose limbs pass each other comes in a few layers (the far legs, the body, the near legs), each a whole picture at rest. `rect` is the picture in the atlas, `origin` the pixel where the root (the feet) sits at rest, `bones` optionally the only bones its points may follow.
- **`map`**: the picture's **bone map**, as large, beside it in the atlas: every pixel in the flat colour of the bone it belongs to (`colors`, bone to `#rrggbb`; colours closer than 60 apart are told apart badly). A map pixel names one bone; the weights are the map **blurred** (`blur`, in pixels, default 8: a Gaussian of half that width; step 41's art uses 20), sampled at each grid point, the four strongest kept and summed to 1. So a point of the left leg never follows the right leg lying next to it, and a joint gets a soft crossover as wide as the blur. A wider blur bends rounder (rubber); a narrow one keeps parts stiff and stretches only the cells at the joint. Paint the top of a limb in its parent's colour and the limb's root stretches with the body instead of turning. Without a map, a point follows the bones whose lines are nearest (by distance; `SoftMesh.from_picture` falls back to it).
- **The grid** has cells of `cell_size` pixels (default 12) where the picture has pixels (a cell is kept when any pixel lies in it or 1 pixel around it), two triangles a cell. The CPU draws a coarser one, `cpu_cell_size` (default 32). `rig.soft_skin` (the rig's first soft skin) is the `SoftSkin`: change `cell_size`, `cpu_cell_size` or `blur` at run time and the grid is made again for every puppet wearing it.
- **Two parts of one picture closer than a cell** (a hanging ear just over a leg) get joined by the grid's triangles, which then stretch between them when they move apart. Put such parts into pictures of their own.
- `set_skin` switches between soft and cut-out skins of one skeleton; the bones, clips, player, events and anchors stay as they are. `puppet.is_soft`, `puppet.soft_points(cell_size?)` (the grid points now, in the puppet's own space) and `bounds()` work on both.

**Stretch and squash.** A key may hold `scale_x` (along the bone) and `scale_y` (across), above 0: `{ "t": 0.3, "scale_x": 1.2 }` makes the body a fifth longer at the take-off. A key with only one of them keeps the area: the other is its inverse (longer is thinner). Children's joints move with the stretch, and a soft skin's picture stretches with it; cut-out parts stretch too. The player blends scales linearly like positions; `puppet.stretch = false` keeps every bone its length (the clip's turns stay).

**Jiggle.** The rig names bones that swing after the motion:

```json
"jiggle": {
    "ear_l": { "half_life": 0.3, "strength": 1, "max": 40 },
    "tail_4": { "half_life": 0.35, "strength": 0.9, "max": 30 }
}
```

Each is a damped spring on the bone's tip: when the bone's parent moves, the tip lags behind and swings back, `half_life` the seconds in which a swing halves, `strength` how much of the lag turns the bone, `max` the most degrees. The spring is stepped in fixed steps of 1/240 s, so it moves the same at 30 and at 144 frames a second. `puppet.jiggle` is the `PuppetJiggle`: `enabled`, `strength` (all of them), `offset(bone)` (degrees now), `reset()`, and `carry(dx, dy)` for a puppet the game moves across the stage (the spring feels it).

**`SoftLayer`** draws soft puppets on the graphics card with WebGL 2, or on the CPU, behind one API:

- **GPU**: every mesh and atlas goes up once (the bone maps cleared out of the picture); each frame only the bone matrices go up, one row per puppet in a float texture. The vertex shader does the skinning (four bones per point); a run of puppets sharing a skin is one instanced draw call. The layer draws into a WebGL canvas of its own and lays the part it drew onto the game's 2D canvas with one `drawImage`, as the particles do ([particles.md](particles.md)). Nothing is read back.
- **CPU**: the same points worked out in TypeScript (`skin_points`), the coarser grid drawn triangle by triangle on canvas 2D, each clipped (grown half a pixel, so no seams show) and mapped with one affine transform.
- `new SoftLayer({ prefer })`: `"gpu"` (default) or `"cpu"`; set `layer.prefer` at any time. `layer.mode` says which path draws, `fallback_reason` why not the GPU (no WebGL 2, a picture from another origin, a lost context). A lost context draws on the CPU until the browser gives it back. `stats` (`puppets`, `triangles`, `calls`, `mode`) says what the last `draw()` drew.
- `draw(context, x, y, { layer, grid, weights, alpha })`: `grid` draws the grid over the puppet, `weights` each point's bones in their colours (from the map), `alpha` fades it. Without `layer` a soft puppet draws at once through its context's own layer (`SoftLayer.for_context(context)`). Puppets in a layer are drawn in the order added, all of them over whatever the context had before `layer.draw()`: draw cut-out puppets before or after it.
- Both paths put every point in the same place: `skin_point_as_shader()` is the shader's skinning line by line in TypeScript, and the tests hold it against `skin_points()`. Step 41's browser check draws the beast both ways and finds about 1.3 % of its pixels differing by more than 48 of 255 (edges, where the two paths smooth differently).
- The atlas must be readable (the same origin, or CORS) for the grid and the weights: `SoftSkin` reads its pixels once. In Node, set `rig.soft_skin.pixels` yourself (`{ width, height, data }`).

## Generated creatures

A creature is made, not drawn: a kind and a seed give its skeleton, its body, its colours, its movement and its attacks, and the same seed always gives the same creature. Since step 42, Bestiarium.

```ts
const kit = this.load_kit("beasts");                  // catalogue_images: { beasts: "rendered/monster/quadruped-parts" }
// once kit.is_ready:
const monster = generate_creature("quadruped", 4711, kit);
monster.play("walk");                                  // idle, walk, run
monster.events.attach(CreatureHitEvent, (hit) => {     // at each `hit` moment of an attack
    const area = monster.area_now(hit.attack, x, floor_y, { scale: 0.5 });
    if (area !== null && in_area(area, dummy_x, dummy_y)) { dummy.hit(); }
});
monster.attack("bite");                                // plays once, then the movement again
// every frame:
monster.update(delta_seconds);
monster.draw(context, x, floor_y, { layer, scale: 0.5 });
layer.draw(context);
save(monster.data);                                    // plain data; creature_from_data(data, kit) makes it again
```

**Four kinds, each a template.** `CREATURE_TEMPLATES` (`quadruped`, `biped`, `worm`, `flyer`) are plain data (`CreatureTemplateData`): values a game may set (`params`: `size` and `legs`, `arms`, `segments`, `wings` or `tail`, each with a German `title`, `min`, `max`, `whole`), chains of bones with ranges for their count, length, angle and turns (`TemplateChainData`: a spine, a neck, a head with a jaw, legs on both sides, a tail, a worm's body, wings), and the pictures back to front (the far legs, the body, the near legs). `make_skeleton_from_template(template, seed, params)` picks the numbers, each value and each chain from a stream of its own (`seed_for(seed, name)`), so a longer tail leaves the legs as they were; it tilts the spine so all legs stand, lifts a worm onto the ground and hangs a flier in the air, and gives `CreatureSkeleton` (rig bones, anchors at every chain's tip, `"hind_r_sole"`, and the chains with their roles).

**A part kit** (`PartKitData`, the `rig` of a catalogue picture like `rendered/monster/quadruped-parts`): body parts in one atlas, each in grey shading with its outline and, beside it, a tint mask (red takes the main colour, green the second, blue the accent, black stays as drawn; its alpha is the part without the outline). Each part has a `role` (`head`, `jaw`, `torso`, `neck`, `tail`, `tail_tip`, `leg_upper`, `leg_lower`, `foot`, `arm_upper`, `arm_lower`, `hand`, `wing`, `eye`, `horn`, `ear`, `spike`, `segment`), a German `title`, a `pivot` and a `tip` (the line that goes onto a bone), named `points` (a head's `mouth`, `jaw`, `eye`, `horn`, `ear`), and for a head its `jaw`, for a foot or hand `claws`. `PartKit` (`parts_of(role, kind)`, `part(id)`, `pixels`, `is_ready`) reads the atlas's pixels once. Step 42's kits are rendered in Blender (`collection-spielwerk/42-bestiarium/kit__blender`), 19 to 31 parts a kind.

**One soft skin from the parts.** `compose_soft_skin(kit, placements, tints, { bones, pictures })` paints each placed part (`SoftPlacement`: the part, the picture, the bone or `bones` its pixels follow, `at` and `to` on the skeleton at rest, `girth`, `flip`, `shade`, `over`, `zone`) scaled and turned onto its bone, tinted, into its picture, and beside it the bone map step 41's `SoftMesh` reads. Parts of a picture are painted twice, whole and then without their outlines, so where a thigh meets the hip only the outline round both shows: no seams. A limb's root is painted in its parent's colour (`zone`), so it stretches with the body. Pure arithmetic on pixels: the same data paints the same bytes, in Node too. `build_creature(data, kit)` places the parts by the template (a torso over the spine, one part per leg bone, the eyes, horns and ears on the head's points, spikes along the back), composes the skin and writes a rig (`RigData` with the soft skin, the gaits and the attacks).

**Movement is made from the measurements.** `make_gaits(body)` gives `idle`, `walk` and `run`, ordinary clips:

- `make_walk(body, { run, period, stride, duty, phases })`: each standing leg's sole stays on the ground for `duty` of the cycle, sliding back at the clip's `travel`, then swings forward in an arc; `two_bone_ik(skeleton, upper, lower, end_x, end_y, target_x, target_y, bend)` finds the hip and knee for every key (`bend_of()` keeps a knee bending the way it was drawn). A lateral walk or a gallop for four legs, alternating for two; the body bobs, the spine flexes on a run, the tail and arms swing.
- `make_wave(body, { fast, waves, amplitude })`: humps travel from the head to the tail along a worm, the wavelength from its length.
- `make_flap(body, { glide, hover })`: a flier beats its wings and rises on the downstroke, glides with them held out, or hovers in its idle.
- `make_idle(body)`: breathing with `scale_y` keys, the feet where they stand.

**Attacks** (`CreatureAttackData`: a clip with `hit` moments, a `CreatureHitArea`, a `stream`): `make_bite` (the head draws back with the jaw open, lunges and snaps; one hit, a circle round the `mouth` anchor; null without a jaw), `make_fire` (rears back, opens the jaw; `start` and `end` moments for the stream, four hits, a cone of 18° from the mouth), `make_claw` (the near front limb, an arm or a flier's talons swipes; one hit at the end, a circle round its tip). `possible_attacks()` says what a body allows: a bite with a jaw, a claw with claws, fire always (chosen by chance, more often for worms and fliers).

**The creature.** `make_creature_data(kind, seed, kit, overrides)` picks the values, parts, colours (`CREATURE_COLORS`) and attacks, `overrides` kept as given (a slider). `CreatureData` is `{ kind, seed, params, parts, tints, attacks, name? }`, so it goes through `SaveSlots` as it is; `creature_from_data(data, kit, image?)` makes the same creature from it, and refuses clearly with a part the kit doesn't have. `Creature`: `rig`, `puppet`, `attacks`, `events`, `data`, `kind`, `pixels`, `play(name)`, `attack(name)`, `attacking`, `streaming` (fire pours now), `moving`, `update`, `area_now(name, x, y, options)` (the area as drawn), `draw`; `in_area(area, x, y, slack)`. `copy()` gives another of the same creature sharing its rig (picture, grid, and on the graphics card its mesh and texture), playing on its own (step 42's Wildnis).

## Drawn characters

A character drawn whole in a paint program becomes a puppet: a skeleton template laid onto the picture by its joints, the picture turned into step 41's soft skin, and the clips of the template on it at once. Nothing is animated by hand. Since step 43, Knochenwerkstatt (the rig editor that drags the joints).

```ts
const built = rig_from_picture({
    layers: [{ name: "back", pixels: back }, { name: "body", pixels: body }, { name: "front", pixels: front }],
    joints: { pelvis: [210, 250], neck: [330, 205], /* ... every joint of the template, picture pixels */ },
    template: "vierbeiner",                           // zweibeiner, vierbeiner, wurm, flieger
});
const rig = PuppetRig.from_data(built.rig);           // idle, walk, run, bite, fire, claw
rig.image = canvas_of_pixels(built.pixels);           // the atlas: each layer cut to its pixels, its bone map beside it
const monster = rig.puppet("walk");
```

**Skeleton templates** (`SkeletonTemplate`, plain data; `SKELETON_TEMPLATES`, `SKELETON_TEMPLATE_NAMES`, `skeleton_template(name)`): `zweibeiner`, `vierbeiner`, `wurm` and `flieger`, each with the joints a person drags (`joints`: a name, a German `title`, a place on a template drawing 1 unit = 1 pixel at `scale` 1), the bones between them (`bones`: `from` and `to` as joint names or points between two joints, `TemplatePoint`), the anchors (soles, mouth, hands), the chains with their roles (as step 42's creature templates, so its gaits and attacks run on them) and the suggested layers back to front (`layers`: a name, a German title and the bones a layer follows). A Zweibeiner suggests five (`far_arm`, `far_leg`, `near_leg`, `body`, `near_arm`): an arm and a leg on one picture would bind to each other and tear on a run. The Vierbeiner and the Flieger suggest `back`, `body`, `front`; a Wurm one picture. `template_joints(template, { origin, scale })` lays the template's joints at a place, `template_point(point, joints)` finds a bone's end among them, `fit_template(template, joints, ground)` makes the skeleton from placed joints (`FittedSkeleton`: bone lengths and angles, `lines`, `origin`), `joints_of_fit` goes back.

**`rig_from_picture(input)`** (`RigFromPicture`): `layers` back to front, all of one size (`PictureLayer`: `name`, `pixels`, the `bones` it may follow, an optional hand-painted bone `map` and `tint` mask), the `joints`, the `template`, the `ground` (default: the lowest drawn row). Without a map each pixel follows the nearest bone it may (`paint_bone_map`). It gives a `PictureRig`: `rig` (a `RigData` with the soft skin, the template's gaits from step 42, and bite, fire and claw where the body allows; `attacks: false` leaves them out), the atlas `pixels`, the `fitted` skeleton, the `attacks` and the `maps`. `keyed_clips` (a rig of the same bones, step 38's wanderer for a Zweibeiner) carries its keyed clips over: their angles as offsets on the fitted rest pose, the hip lifted so the soles stand where they stood (`carry_clips`). `tints` colour the tint mask's channels (`tint_pixels`). The rig keeps how it was drawn (`drawing`: template, joints, ground, size, layers), so `drawing_from_rig(rig, atlas)` opens a built character again in an editor.

**A source folder** (`canvas/puppet/RigSource.ts`) is how a library keeps any rigged item editable: one picture per character, per part or per piece, and a short `rig.json` (`kit.json` for a kit) with `format: "spielwerk-rig-source"`, `version: 1` and a `kind`:

| `kind` | What | Pictures |
| --- | --- | --- |
| `picture` with a `template` (`DrawnSourceData`) | a drawn character: `joints`, `ground`, the `layers`' bones, `clips_from` (a library id whose keyed clips carry over), `skin_of`, `tints` | `1-back.png`, `2-body.png`, ... (`drawn_layer_files`), each with an optional `.bones.png` and `.tint.png` |
| `picture` with a whole `rig` (`SoftSourceData`) | a soft skin written by a script (step 41's Blender puppets) | one per picture of the skin, its map beside it |
| `parts` | a cut-out puppet: the rig without rectangles | `parts/<slot>.png`, `parts/<slot>.<layer>.png` |
| `wardrobe`, `marks` | clothes (step 39), a mark sheet (step 40) | `pieces/<piece>/<part>.png`, `marks/<id>.png` |
| `kit` (`KitSourceData`) | a part kit for generated creatures: each part's `role`, `title`, `pivot`, `tip`, `points` | `parts/<id>.png`, `parts/<id>.tint.png` |

`build_rig_source(data, read, { files, rig_of, name })` builds the catalogue's `rig` and the packed atlas from it (`BuiltRigSource`; the packing is fixed: `pack_boxes`, shelves sorted by height and name, `PACK_GAP` 4 pixels, so the same folder gives the same bytes); `split_rig_atlas(rig, atlas)` takes a built atlas apart into such a folder, and both ways round give the same rig and the same pixels (`pixel_difference`). `kit_from_pictures(data, read)` makes a `PartKit` straight from a kit's pictures, `rig_source_kind(rig)` says what a rig is. The asset library's `library.mjs rig <id>` runs exactly this, and the Blender scripts of steps 38 to 42 write their art as such folders.

**The draw-over sheet.** `template_sheet(template, { picture, scale, title, bones })` gives a canvas to draw on: the template's bones and joints (the far side's hollow), a scale in pixels, the ground line, the words of the joints placed where they cover no other, the title wrapped to the sheet, and optionally a character faint under it (`SheetPicture`: `image`, `origin`, `joints`). The sheet has the skeleton's own shape: upright for a Zweibeiner (about 390 × 560 at scale 1) and a Flieger, wide for a Vierbeiner (about 550 × 400) and a Wurm, with a margin of 15 % of the figure all round (at least 40 pixels), and large enough for the whole character when one is given. `bones` makes the sheet of one layer: those bones and their joints strong and named, the rest faint (`template_bone_joints(template, bones)` names the joints). Sheets given the same `width` and `height` put the joints in the same places, so a layer drawn on each fits the others. `template_sheet_layout` (with `margin` and `top`, where the words end) and `draw_template_sheet(context, template, options)` for a canvas of one's own.

**What it costs.** Making the rig again after a joint moved (the step's Kobold, five layers, 340 × 450 pixels, its grid and clips) takes 16 ms in headless Chromium; a folder built in Node 22 with its PNGs decoded, 33 to 39 ms for a drawn character, 18 ms for a 27-part kit.

## In action

What a game needs to fight with puppets: legs that run while the arms aim, a gun that points at the mouse, bolts that hit the head and not the air beside it, and a body that falls over when it is beaten. Since step 44, Knopper Klopper (a side-scroller where every figure of steps 38 to 43 shoots and is shot).

```ts
hero.place(x, floor_y, { scale: 0.5, flip_x });                     // where the game draws it: targets and hits use this space
hero.layers.play("hold", "aim_idle", { mask: "upper_body" });          // the legs keep running
hero.constraints.aim("arm_r", mouse_x, mouse_y, { from: muzzle });     // the muzzle's line through the mouse
hero.layers.play("recoil", "recoil", { mode: "add" });                 // a kick on top, gone when it ends
const hit = monster.ray_hit(bolt_from, bolt_to);                       // { name: "head", x, y, normal, t } or null
monster.flinch(hit.bone, bolt_direction, 1);
const fallen = monster.ragdoll(world, { push: { bone: "torso", x: 600, y: -300 }, scatter: true });
monster.get_up("idle", { fade: 0.5, y: ground_at(fallen.joint_of("hip").x) });
```

**Placement.** `place(x, y, { scale, flip_x })` tells a puppet where the game draws it (its feet, as `draw()` takes them); `world_to_local` and `local_to_world` turn points between that space and the puppet's own. Targets, hits, piece points and ragdolls all work in it. `draw()` doesn't need it; call it when the puppet moves.

**Layers** (`PuppetLayers`, `puppet.layers`): clips over the puppet's own clip, each on the bones of a mask, applied in the order they were first played. `play(name, clip, { mask, weight, mode, fade, restart, speed, until_done })` starts a layer or switches its clip with a fade; `stop(name, fade)`, `set_weight(name, weight, fade)`, `clear()`, `layer(name)`. `"replace"` (the default) blends the layer's pose over the pose below by its weight; `"add"` adds its keys on top (offsets on the rest pose: a recoil keyed from 0 to -12 and back), and an added clip played once fades out and goes by itself. Masks (`PuppetMask`, a weight per bone) by name: `all`, `lower_body` (or `legs`: the roots, the hip and the legs), `upper_body` (the rest), `arm_r`, `arm_l`, `leg_r`, `leg_l`, `head`, and the rig's own `masks` (`RigData.masks`: bone names, each with its children); or a list of bone names, or a mask made with `mask_from(skeleton, bones, { weight, children })`. A layer plays its own `PuppetPlayer` without events. Each fades in over `LAYER_FADE` (0.15 s) unless told.

**Constraints** (`PuppetConstraints`, `puppet.constraints`): bones turned towards targets after the clips and layers, each with a weight that fades (`CONSTRAINT_FADE`, 0.15 s) and limits relative to the clip's pose. Three kinds (`ConstraintData`, plain data in `RigData.constraints`, or made from the bone names):
- **`aim(name, x, y, { from, fade })`** turns a chain (by default `arm_r`: the spine, the upper arm and the forearm, sharing the turn 0.2, 0.55, 0.25, the spine within ±35 degrees) until the line of an anchor goes through the target. `from` is a point in the anchor's frame the line starts from: a gun's muzzle (`part_point(part, "muzzle")`), off the hand's line. Iterative, within 0.01 degrees, mirrored puppets too.
- **`look_at(name, x, y)`** turns one bone (by default `head`, within ±40 degrees) so the way it faces points at the target.
- **`reach(name, x, y)`** puts the end of two bones on the target with step 42's `two_bone_ik` (by default `foot_r`, `hand_l` and the others by their names): a foot on a slope, a far hand on a grip.

`release(name, fade)` lets go, `set_enabled(name, false)` turns one off, `get(name)` and `set(name, data)`. The legs are left alone by an aim: the run underneath plays exactly as it would.

**Piece points.** A worn piece's part may name points (`PiecePartData.points`, picture pixels like the pivot: `muzzle`, `grip`). `part_point(part, name)` gives one in the anchor's frame, `puppet.piece_point(place_or_id, name)` where it is now in the placement's space, with the angle it points along: where a bolt leaves the gun.

**Hit capsules** (`puppet.hit_shapes`, `HitCapsule`): a capsule per bone, as wide as the bone's picture: from a soft skin's bone map (each pixel to its bone) or a cut-out part's opaque pixels (its rectangle without pixels), the capsule laid along the bone over what the bone carries, its radius covering 96 % of it. Made once per skin and shared by every puppet wearing it (step 44's figure: 16 capsules in 7 ms). On the drawn test figure they miss 6 % of the picture's pixels and are 4 % air. `hit_at(x, y)` (the capsule drawn on top), `ray_hit(from, to)` (the first capsule a bolt meets: `PuppetHit` with the bone, its `name`, the point, the `normal` and `t` along the ray) and `overlaps({ x, y, radius })` (a blast, a club's head) all take points in the placement's space; `PuppetHitTest` and `distance_to_segment` do the same for a game's own shapes.

**Flinch.** `flinch(bone, direction, strength)` kicks a bone round by the push across it (its parent half as much, the grandparent a quarter; never a root), and a damped spring turns it back (`PuppetFlinch`: half-life 0.09 s, at most 45 degrees, stepped in fixed steps of `FLINCH_STEP` = 1/240 s, so it looks the same at any frame rate). A push forward on the screen turns a mirrored puppet the same way.

**Ragdolls** (`PuppetRagdoll`): `puppet.ragdoll(world, { velocity, push, scatter, seed, layer, mask, iterations, damping })` lays a stick of two bodies of a `PhysicsWorld` along every bone (octagons as wide as its capsule, on `RAGDOLL_LAYER`, meeting the ground and crates but not each other), starting exactly where the pose has them and moving as the last update moved them, plus the puppet's own `velocity` and a `push` on one bone (both in the placement's space). In each world step, once the world moved the bodies (`world.steps`), the ragdoll holds every bone rigid with the joints of the bones on it (shape matching), keeps it within its angle limits (both sides of the joint turning by their weight; what a bend moved the whole by, and turned it round its middle by, is taken back, so a limit pressed on step after step never pushes a ragdoll along the ground or spins it up), and puts the bodies back with `world.place()`, which pushes them out of the walls; the walls they touched stay in its solving for the next step. The limits (`ragdoll_limits(rig)`) are how far the rig's clips turn each bone plus 25 degrees (±30 for a bone no clip turns), or the rig's own `limits` (`RigData.limits`: `[low, high]` per bone, as clip rotations). The puppet then shows the ragdoll's pose, the bones' angles from its sticks, so the drawing never stretches; keep drawing it at its placement. `scatter: true` lets a cut-out puppet's parts fly apart, away from its middle and spinning (`scatter_speed`, `seed`); a soft skin stays whole, its picture would tear. `ragdoll.is_settled` (every point slower than 20 units a second, in the rig's units, for 0.4 s, or resting), `resting` (it comes to rest for good once it moved slower than 160 units a second for a quarter of a second after its first second, or at 3 seconds in any case: its bodies leave the world, so it costs nothing more, and its pose stays; a many-legged one pressed on its limits would otherwise rock on for a long while), `push(bone, x, y)` for a second blow, `joint_of(bone)`, `bounds()`, `stretch()` (how far the bones are off rigid, for tests), `remove()`. `puppet.get_up(clip, { fade, y })` stands it up where its hip lies (on `y`, the ground there) and blends from the pose it lies in into the clip; `end_ragdoll()` just takes the bodies out. A hard landing bends a bone by a few units for a frame or two (the ground has the last word); at rest the bones are rigid to half a unit.

**What it costs** (Node 22, the same machine as below): 1 000 running wanderers update in 0.89 ms; with an upper-body layer 1.39 ms, with an aim 1.23 ms, with both 1.94 ms. `hit_at` 1.0 µs, `ray_hit` 1.9 µs, `overlaps` 0.9 µs on the drawn figure's 16 capsules. A falling soft figure as a ragdoll (23 bodies) costs 0.27 ms a frame with its world and drawing pose, 10 at once 0.72 ms, 40 at once 2.6 ms; all settle within 2 to 3 seconds.

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

A picture whose `rig` is a wardrobe (it has `pieces` and no `bones`) goes to `references.wardrobe(name)` instead, and `logic.load_wardrobe(name)` hands it out:

```ts
const hero = this.load_puppet("wanderer");
hero.use_wardrobe(this.load_wardrobe("clothes"));     // catalogue_images: { clothes: "rendered/puppet/clothes" }
hero.set_outfit(saved_outfit);                        // worn when the wardrobe has come
```

A picture whose `rig` is a mark sheet (it has `marks`, no `bones` and no `pieces`) goes to `references.mark_sheet(name)`, and `logic.load_marks(name)` hands it out:

```ts
const hero = this.load_puppet("model");                // catalogue_images: { model: "rendered/puppet/model", marks: "rendered/puppet/marks" }
hero.use_marks(this.load_marks("marks"));
hero.set_character(saved_character);                  // its marks are laid on when the sheet has come
```

A picture whose `rig` is a part kit (it has `parts`, no `bones`, `pieces` or `marks`) goes to `references.part_kit(name)`, and `logic.load_kit(name)` hands it out; `kit.is_ready` says when its data and pixels are there (see [Generated creatures](#generated-creatures)).

The puppet exists at once and waits while the data is on its way: it draws nothing and plays nothing; it starts the clip it was told (or the rig's default clip) as soon as the rig has it, and draws once the picture has come. `references.puppet(name).set_data(data)` also takes a game's own rig for a picture of `settings.images`. `@tce-v3/game-boot` fills the hook from `dll-tce-assets` (0.5.0 and later: `rendered/puppet/wanderer` and `rendered/puppet/gardener`; 0.6.0 and later also the wardrobes `rendered/puppet/clothes` and `rendered/puppet/accessories`; 0.7.0 and later the model `rendered/puppet/model` with shapes and tint layers and the mark sheet `rendered/puppet/marks`; 0.8.0 and later the soft skins `rendered/puppet/wanderer-soft`, step 38's wanderer whole on the same skeleton, and `rendered/puppet/beast`, a dog-like beast with jiggling ears and tail; 0.9.0 and later the part kits `rendered/monster/quadruped-parts`, `biped-parts`, `worm-parts` and `flyer-parts`).

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

Dressed (step 39, Node 22, the same machine): 1 000 running puppets, half of them in an outfit of six pieces (35 parts instead of 15), update in 0.63 ms and lay out their draw calls in 0.25 ms; changing an outfit, with its one sort of the drawing order and the first draw, takes about 18 µs. The clothes cost what their parts cost to draw, and nothing per frame besides.

Shaped (step 40, the same machine; the model, 16 bones and 15 parts, running, drawn at 0.4 on 960 × 640; "shaped" is every shape value at its end, skin and hair tinted and three marks, "meshes" the same shapes with `direct_meshes`):

| | Node 22 (calls only) | Chromium, software canvas (headless) | Chrome on an RTX 4070 |
| --- | --- | --- | --- |
| Most at 57 FPS or more: plain / shaped / meshes | | 90 / 50 / under 5 | 400 / 85 / 5 |
| Draw 100, the script's time: plain / shaped / meshes | | 1.5 / 18 / 404 ms | 1.5 / 2.1 / 249 ms |
| One shaped puppet drawn triangle by triangle | 389 `drawImage` instead of 15, 47 µs | 0.74 ms | 0.76 ms |
| A slider step: the looks laid again and the first draw | 46 µs (meshes only) | 1.4 ms | 1.4 ms |

So a mesh drawn triangle by triangle every frame is affordable for one character and nothing more; laid into a canvas once per change it costs one `drawImage` per part again. Before the looks were packed into one canvas per puppet (and with the work canvases on the graphics card too), the GPU managed 50 shaped puppets and spent 24 ms of script on 100.

Updating is never the limit: a thousand puppets pose in about a millisecond. Drawing is the bill, one `setTransform` and one `drawImage` per part (about 1 µs of script per part, and the pixels after it): a few dozen puppets on any machine, a few hundred on a graphics card. For crowds of thousands, a sprite sheet rendered from the puppet ([animation.md](animation.md#crowds)) is the cheaper way.

Soft (step 41, the same machine; the beast, 24 bones, 5 pictures, 1 142 points and 1 830 triangles on the 12 px grid, 263 points and 342 triangles on the CPU's 32 px grid, running, on 960 × 640):

| | Node 22 | Chromium headless (SwiftShader, software canvas) | Chrome on an RTX 4070 |
| --- | --- | --- | --- |
| Most at 57 FPS or more, drawn at 0.2 / 0.5: GPU | | 40 to 45 / 15 to 25 (each frame copies the WebGL canvas into the software canvas, about 3.6 ms) | 2 560 / 2 400 |
| The same on the CPU | | under 5 / under 5 | 10 / 10 |
| Update (clip and jiggle) per beast | 3.5 µs | | 4 to 5 µs |
| The script's share of drawing 100 on the GPU | 0.7 µs per beast for its matrices | | 0.29 ms |
| The CPU's points per beast (12 / 32 px grid) | 15 / 3.9 µs | | |

On the graphics card the bill is the script: at 2 500 beasts updating them takes about 12 ms of the frame, drawing them all is one call. On the CPU every triangle is a clip, a transform and a `drawImage`, about 6 µs each, so ten beasts are the most: the CPU path is a fallback for a few creatures, not for a herd.

Generated (step 42, the same machine; making a creature is its data, its skeleton, the parts painted into the soft skin, its clips and attacks; its grid is the soft mesh at 12 px, made at its first drawing; medians of about 30 seeds):

| | Node 22: body / grid | Chromium headless: body / grid | Chrome on an RTX 4070: body / grid |
| --- | --- | --- | --- |
| Vierbeiner | 45.6 / 33.4 ms | 52.5 / 16.9 ms | 51.9 / 17.4 ms |
| Zweibeiner | 26.8 / 19.5 ms | 29.4 / 9.9 ms | 29.3 / 10.1 ms |
| Wurm | 12.8 / 8.0 ms | 13.8 / 4.0 ms | 13.6 / 3.9 ms |
| Flieger | 41.0 / 26.6 ms | 46.7 / 14.7 ms | 46.1 / 14.8 ms |

So a game makes one creature a frame at most, or keeps them: step 42's Wildnis makes its dozen one a frame. Roaming, a dozen different creatures and copies of them (`copy()`, sharing the rig, so the mesh and texture go up once) through one `SoftLayer`: 1 440 to 1 536 at 57 FPS on the RTX 4070, 57 to 72 in headless Chromium. Sharing the rig saved uploads, not frame time (1 536 either way): as in step 41, the bill is updating the clips.
