# Crop tool (Image + Upload nodes)

## Where it exists
- **Upload node** (`mediaInput`, image mode): toolbar button **Crop**
- **Generate Image node** (`generateImage`): toolbar button **Crop**

## Behavior
- Clicking **Crop** toggles an in-node crop overlay.
- While crop is active:
  - Node interaction is disabled (**not draggable/selectable**).
  - Node `zIndex` is raised (to keep crop overlay on top).
  - User can drag a rectangle to choose the crop.
  - Crop can be constrained with a **Ratio** selector (Free / 1:1 / 16:9 / etc.).
  - **Enter** applies crop, **Esc** cancels.
- Applying crop replaces the node image with the cropped PNG data URL.
- Applying crop creates a **new Upload node** with the cropped PNG and connects it to the source node, so both original + cropped remain.

## Implementation notes
- Crop overlay component: `src/components/nodes/shared/ImageCropOverlay.tsx`
- Crop state flag stored on node data: `cropMode?: boolean` (see `src/types/nodes.ts`)

