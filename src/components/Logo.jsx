import React from "react";

// Brand mark: the user's enso logo image, shown in full and centered on a
// white square with white framing it (no cropping or shifting).
const LOGO_URL =
  "https://media.base44.com/images/public/6a91be5ced6058323eb21f7d/767c033d8_3E798DE5-95A7-49F9-879D-C8303E1BB25C.png";

export default function Logo({ size = 36, className = "" }) {
  return (
    <div
      style={{ width: size, height: size, backgroundColor: "#ffffff" }}
      className={`rounded-[30%] overflow-hidden shrink-0 flex items-center justify-center ${className}`}
    >
      <img
        src={LOGO_URL}
        alt="ArtFlow"
        draggable={false}
        style={{ width: "86%", height: "86%", objectFit: "contain" }}
      />
    </div>
  );
}