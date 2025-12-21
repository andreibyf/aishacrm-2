# Help Video System Guide

This guide explains how to add context-aware help videos to the Aisha CRM application.

## Overview

We have implemented a `ComponentHelp` component that allows you to place "Play" buttons next to any UI element. When clicked, these buttons open a dialog containing an embedded video (YouTube, Loom, Vimeo, etc.).

## How to Add a Help Video

### 1. Import the Component

In any React page or component:

```jsx
import { ComponentHelp } from "../components/shared/ComponentHelp";
```

### 2. Place the Component

Add the `<ComponentHelp />` tag next to the element you want to explain (e.g., a header, a complex form, or a specific section).

```jsx
<h1>
  Accounts
  <ComponentHelp 
    title="Accounts Overview" 
    description="Learn how to filter and manage accounts."
    videoUrl="https://www.youtube.com/embed/YOUR_VIDEO_ID" 
  />
</h1>
```

### Props

| Prop | Type | Description |
|------|------|-------------|
| `title` | string | The title shown in the dialog header. |
| `description` | string | (Optional) Subtitle or description text. |
| `videoUrl` | string | The **embed URL** of the video. |
| `triggerType` | 'play' \| 'help' | Icon style. Default is 'play' (Play Circle). 'help' shows a Question Mark. |

## Creating the Videos

To achieve the "arrow pointing to where to navigate" effect you requested:

1. **Record your screen** using a tool that highlights mouse clicks and allows drawing.
   - **Loom:** Great for quick walkthroughs.
   - **Screen Studio:** Excellent for high-quality demos with automatic zooming and cursor smoothing.
   - **Camtasia/OBS:** For more edited, professional tutorials.

2. **Edit the video** to add arrows/highlights if your recording tool doesn't do it automatically.

3. **Upload** the video to a hosting provider (YouTube, Vimeo, Loom).

4. **Get the Embed URL**:
   - **YouTube:** `https://www.youtube.com/embed/VIDEO_ID`
   - **Loom:** `https://www.loom.com/embed/VIDEO_ID`

5. **Paste the URL** into the `videoUrl` prop of the `ComponentHelp` component.

## Automated Video Generation (Advanced)

You can also use **Playwright** to automatically generate these help videos. This ensures your videos are always up-to-date with the latest UI changes.

We have included a script: `scripts/generate-help-videos.js`.

### How it works
1. It launches a browser controlled by Playwright.
2. It injects a custom "Arrow" overlay to point at elements programmatically.
3. It records the session to `public/help-videos/`.

### Usage

1. Ensure your local server is running (`npm run dev` or Docker).
2. Run the generator:

```bash
node scripts/generate-help-videos.js
```

3. The video will be saved as `public/help-videos/accounts-demo.webm`.
4. You can then host this file or serve it directly from your public folder (e.g., `/help-videos/accounts-demo.webm`).

### Customizing the Script

Edit `scripts/generate-help-videos.js` to add new scenarios:

```javascript
async function scenarioMyFeature(page) {
  await page.goto(BASE_URL + '/MyFeature');
  await showArrow(page, '#my-button', 'Click Me');
  await page.click('#my-button');
}

// Add to main execution
await recordVideo('my-feature', scenarioMyFeature);
```

## Example Strategy

To build a comprehensive "Help Mode":

1. **Page Level:** Add a general overview video next to the main Page Title.
2. **Section Level:** Add specific videos for complex features (e.g., "Bulk Import", "Advanced Filters").
3. **Form Level:** Add a 'help' style trigger inside complex forms.

```jsx
<label>
  Lead Score Configuration
  <ComponentHelp 
    triggerType="help"
    title="Configuring Lead Scores"
    videoUrl="..."
  />
</label>
```
