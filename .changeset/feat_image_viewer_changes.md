---
default: minor
---

Change Image Viewer to feel more natural to use.

#Changes to Image viewer:

- Fixed Zoom Gestures generally not working on mobile.
- Changed the % number in the top right to reflect the zoom of the original image as opposed to the change from it fitting the container.
- Made Zoom Pill allow inputing custom values
- Added a button thta zooms you to the Original Size of the Image, and button to return to the Actual size of the image
- Made Images have the `pixelated` tag, and start zoomed in when smaller than container to enhance the experience of viewing pixelart, with the pixelated tag being applied to images in the chat aswell.
- Transitions are now disabled for manual panning to improve responsiveness
