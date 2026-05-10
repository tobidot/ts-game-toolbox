# Assets

Tools to help with loading, storing, and retrieving various types of assets.

## AssetManager

The `AssetManager` is responsible for loading images and audio files. It tracks progress and stores the loaded elements for easy access.

### Usage

```typescript
import { AssetManager, Progress } from 'ts-game-toolbox';

const manager = new AssetManager();
const progress = new Progress();

progress.listen((percent) => {
    console.log(`Loading: ${Math.round(percent * 100)}%`);
});

await manager.load({
    images: {
        'hero': '/assets/images/hero.png',
        'background': '/assets/images/bg.jpg'
    },
    audio: {
        'jump': '/assets/audio/jump.mp3',
        'music': '/assets/audio/theme.mp3'
    }
}, progress);

// Accessing assets
const heroImage = manager.images.get('hero').element;
const jumpSound = manager.audio.get('jump').element;
```

### Methods

- `load(assets: { images?, audio? }, progress: Progress): Promise<void>`: Loads both images and audio.
- `load_images(assets: Record<string, string>, progress: Progress): Promise<void>`: Loads images specifically.
- `load_audio(assets: Record<string, string>, progress: Progress): Promise<void>`: Loads audio specifically.
- `list_pending(): string[]`: Returns a list of paths for assets that are still loading.
