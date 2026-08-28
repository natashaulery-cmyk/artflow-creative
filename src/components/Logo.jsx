import React from "react";
import { Image } from "@/components/ui/image";

// Brand mark: the user's enso logo image, fixed in the top-left corner.
const LOGO_URL =
  "https://media.base44.com/images/public/6a91be5ced6058323eb21f7d/767c033d8_3E798DE5-95A7-49F9-879D-C8303E1BB25C.png";

export default function Logo({ size = 36, className = "" }) {
  return (
    <div
      style={{ width: size, height: size }}
      className={`rounded-[30%] overflow-hidden ${className}`}
    >
      <Image
        src={LOGO_URL}
        alt="ArtFlow"
        fittingType="fit"
        className="w-full h-full"
      />
    </div>
  );
}