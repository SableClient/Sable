---
default: minor
---

Change Image Viewer to feel more natural to use.

# Changes to Image viewer

- Fixed zoom gestures generally not working on mobile.
- Changed the % number in the top right to reflect the zoom of the original image as opposed to the change from it fitting the container.
- Made the zoom pill allow entering custom values.
- Added a button that zooms you to the original size of the image, and a button to return to the size that fills the container.
- Added a pixelated image scaling setting: choose Both, Chat, Image viewer (default), or Neither for crisp nearest-neighbor rendering.
- Transitions are now disabled for manual panning to improve responsiveness.
