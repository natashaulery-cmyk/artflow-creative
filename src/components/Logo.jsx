import React from "react";

// Brand mark: periwinkle rounded square with a navy-indigo enso (brush ring).
// Matches the user's logo palette — bg #B6B8D1, symbol #3D4067.
export default function Logo({ size = 36, className = "" }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      className={className}
      role="img"
      aria-label="ArtFlow"
    >
      <rect width="48" height="48" rx="14" fill="#B6B8D1" />
      <path
        d="M29.47 8.96 A16 16 0 1 1 37.86 16"
        stroke="#3D4067"
        strokeWidth="6"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}