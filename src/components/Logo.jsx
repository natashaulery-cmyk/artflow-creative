import React from "react";
import { Image } from "@/components/ui/image";

// Brand mark: the user's enso logo image, fixed in the top-left corner.
const LOGO_URL =
  "https://media.base44.com/images/public/6a91be5ced6058323eb21f7d/c5405678d_IMG_7694.jpeg";

export default function Logo({ size = 36, className = "" }) {
  return (
    <div
      style={{ width: size, height: size }}
      className={`rounded-[30%] overflow-hidden ${className}`}
    >
      <Image
        src={LOGO_URL}
        alt="ArtFlow"
        fittingType="fill"
        className="w-full h-full"
      />
    </div>
  );
}