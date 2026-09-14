# Splash loading images

Drop portrait PNGs/WebPs here. Each cold start picks one at random when **Experimental → Splash loading screen** is enabled.

Recommended:
- Portrait orientation (~1080×1920 or similar)
- Transparent or dark background
- Character roughly centered

Update `manifest.json` with filenames so the loader can find them:

```json
{ "images": ["akari-1.png", "akari-2.webp"] }
```
