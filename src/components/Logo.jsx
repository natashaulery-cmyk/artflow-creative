import React from "react";

// Brand mark: the user's enso logo image. The enso brushstroke sits off-center
// to the right inside the source image, so we zoom in slightly and shift left
// to center it within the box (cropping only the empty padding).
const LOGO_URL =
  "https://media.base44.com/images/public/6a91be5ced6058323eb21f7d/767c033d8_3E798DE5-95A7-49F9-879D-C8303E1BB25C.png";

// Horizontal center of the enso within the source image (0–1), nudged right.
const ENSO_CENTER_X = 0.6;
// Zoom factor: large enough that shifting the enso to center never reveals a
// gap on the opposite edge (1.25 is the minimum for ENSO_CENTER_X = 0.6).
const SCALE = 1.25;

export default function Logo({ size = 36, className = "" }) {
  const shiftX = -(ENSO_CENTER_X * SCALE - 0.5) * size;
  const shiftY = -((SCALE - 1) / 2) * size;
  return (
    <div
      style={{ width: size, height: size }}
      className={`rounded-[30%] overflow-hidden shrink-0 ${className}`}
    >
      <img
        src={LOGO_URL}
        alt="ArtFlow"
        draggable={false}
        style={{
          width: size * SCALE,
          height: size * SCALE,
          marginLeft: shiftX,
          marginTop: shiftY,
          objectFit: "cover",
        }}
      />
    </div>
  );
}