"use client";

import { useState } from "react";

type ProductGalleryProps = {
  images: string[];
  productName: string;
};

export function ProductGallery({ images, productName }: ProductGalleryProps) {
  // State to track which image is currently selected. Defaults to the first image.
  const [mainImage, setMainImage] = useState(images[0]);

  return (
    <div className="flex flex-col gap-4">
      {/* Main Image View */}
      <div className="aspect-4/5 overflow-hidden rounded-sm bg-zinc-100 dark:bg-zinc-900">
        <img
          src={mainImage}
          alt={productName}
          className="h-full w-full object-cover object-center transition-all duration-300"
        />
      </div>

      {/* Thumbnails Row */}
      {images.length > 1 && (
        <div className="grid grid-cols-4 gap-4">
          {images.map((img, index) => (
            <button
              key={index}
              onClick={() => setMainImage(img)}
              className={`aspect-4/5 overflow-hidden rounded-sm bg-zinc-100 dark:bg-zinc-900 border-2 transition-all ${
                mainImage === img
                  ? "border-zinc-900 dark:border-zinc-100" // Active state border
                  : "border-transparent hover:border-zinc-300 dark:hover:border-zinc-700" // Inactive state
              }`}
            >
              <img
                src={img}
                alt={`${productName} thumbnail ${index + 1}`}
                className="h-full w-full object-cover object-center"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}