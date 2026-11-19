# Changelog

One document per major version: what it added, changed and removed, and how to move code from the major before.

- [6.3.0 (unreleased)](v6.md#630-unreleased): soft skins on puppets (whole pictures on a grid weighted by a bone map, drawn with WebGL 2 or on the CPU), stretch and squash keys and jiggle (Spielwerk step 41).
- [6.2.0](v6.md#620): seeded noise and noise recipes as plain data, filled into a `Grid2D` (Spielwerk step 34); versioned save slots with migrations and autosave, a store hook in the game shell and a slot page (step 35); field of view by symmetric shadowcasting and a fog of war on a `Grid2D` (step 36); animated crowds: sheet frames in `SpriteBatch`, `CrowdAnimation` and `prescale` (step 37); cut-out puppets (2D skeletal animation): rigs as plain data, clips with fades, reskinning, bone picking, and `load_puppet` in the game shell (step 38); clothes on anchors with outfits as plain data (step 39); body shape, skin tints and marks on puppets, characters as plain data (step 40).
- [6.1.0](v6.md#610): input by name (`ActionMap`), grid pathfinding, sprite-sheet animation, GPU/CPU particles, catalogue media and sheets in the game shell, and a scroll bar for `ScrollGroup` (Spielwerk steps 30 to 33).
- [6.0.0](v6.md): the Spielwerk modules of steps 15 to 29 and the canvas game shell; `PhysicsWorld` replaces `SweepingSatWorld`.
- [5.x](v5.md): general helpers only (the MVC part is gone); from 5.4 on, the Spielwerk modules of steps 2 to 14.

Before 5, the notes are one line each:

- 4.0.0: a major restructuring of the MVC part.
- 3.0.0: the dependencies on React and p5 are cut.
- 2.0.0: the abstract MVC components.
- 1.0.0: the first version.
