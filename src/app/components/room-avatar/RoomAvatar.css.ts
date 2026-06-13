import { style, styleVariants } from "@vanilla-extract/css";
import { color, config } from "folds";

export const RoomAvatar = style({
  backgroundColor: color.Secondary.Container,
  color: color.Secondary.OnContainer,
  textTransform: "capitalize",

  selectors: {
    '&[data-image-loaded="true"]': {
      backgroundColor: "transparent",
    },
  },
});

export const RoomIconRoot = style({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: "100%",
  height: "100%",
  lineHeight: 0,
  overflow: "visible",
});

export const RoomIconComposite = style({
  position: "relative",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  lineHeight: 0,
  flexShrink: 0,
  overflow: "visible",
});

export const RoomIconBadge = style({
  position: "absolute",
  top: "-4%",
  right: "-4%",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  aspectRatio: "1",
  boxSizing: "border-box",
  backgroundColor: color.Background.Container,
  lineHeight: 0,
  zIndex: 1,
  overflow: "visible",
  pointerEvents: "none",
});

export const RoomIconBadgeShape = styleVariants({
  globe: {
    width: "62%",
    padding: 0,
    borderRadius: "50%",
  },
  lock: {
    width: "64%",
    padding: 0,
    borderTopLeftRadius: config.radii.R300,
    borderTopRightRadius: config.radii.R300,
    borderBottomLeftRadius: "20%",
    borderBottomRightRadius: "20%",
  },
});

export const RoomIconBadgeIcon = style({
  display: "flex",
  width: "100%",
  height: "100%",
  flexShrink: 0,
});
