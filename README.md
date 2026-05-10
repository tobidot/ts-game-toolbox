# Ts Game Toolbox

A collection of reusable functions and classes for Games or Programs developed in Javascript/Typescript.

> **Warning**
> This package is far from stable. It is a privately managed package, feel free to use it at your own risk. Major
> changes may be introduced at any time.

## Documentation

For detailed information and usage examples, please refer to the documentation in the `docs` folder:

- [AI-Optimized Documentation](docs/ai.md) - **Recommended for AI Agents (LLMs)**.
- [Handover Guide](docs/handover.md) - How to share this library with other agents.
- [Assets](docs/assets.md) - Loading and managing images and audio.
- [Geometries](docs/geometries.md) - Vector2, Rect, Polygon, Line, and Ray.
- [Trees](docs/trees.md) - QuadTree and Collection.
- [Signals](docs/signals.md) - Event and Signal sockets, Observable properties.
- [Flow](docs/flow.md) - Progress tracking, Sleep, Throttling, and Asserts.
- [UI](docs/ui.md) - Canvas-based UI system with widgets.
- [Physics](docs/physics.md) - Collision detection (Work in Progress).
- [Miscellaneous](docs/misc.md) - Colors, RgbColor, Math helpers, and Testing tools.

## Recommendation

These tools and helpers aim to be helpful for development with the 'tce-common' package.

## Coordinate System

The Geometric functions and classes assume a 2D-coordinate system. While standard screen coordinates (y-down) are used
in most places, be aware of the specific implementation in each class.

|..|-y|..|  
|-x|..|+x|  
|..|+y|..|

The angle of a vector is expected in radians (from 0 to 2π). Angle 0 points to the right.

## Quick Version Log

- 5.0.0
    - Removed MVC and "Abstract" module to concentrate on general helpers
- 4.0.0
    - Major restructuring of the mvc part
- 3.0.0
    - Cut the Dependencies to react and p5
- 2.0.0
    - Introduce the abstract MVC-Components
- 1.0.0
    - Initial version
