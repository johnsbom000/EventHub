import { useEffect, useState } from "react";
import { ChevronLeft } from "lucide-react";

const DEFAULT_HEIGHT_CLASS = "h-[60vh] min-h-[320px] max-h-[520px]";

type PhotoCollageProps = {
  photos: string[];
  title: string;
  heightClass?: string;
};

export default function PhotoCollage({ photos, title, heightClass = DEFAULT_HEIGHT_CLASS }: PhotoCollageProps) {
  const [galleryOpen, setGalleryOpen] = useState(false);

  useEffect(() => {
    if (!galleryOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [galleryOpen]);

  if (photos.length === 0) return null;

  const previewPhotos = photos.slice(0, 5);
  const splitGalleryPhotos = photos.slice(1, Math.min(photos.length, 4));
  const marketplaceGridPhotos = previewPhotos.slice(1, 5);

  return (
    <>
      <div className="relative">
        <div className={`relative overflow-hidden rounded-2xl ${heightClass}`}>
          {/* Mobile: stable hero-first preview */}
          <div className="md:hidden h-full">
            <button
              className="relative block h-full w-full overflow-hidden bg-transparent"
              onClick={() => setGalleryOpen(true)}
              title="Show all photos"
            >
              <img
                src={photos[0]}
                alt={title}
                className="absolute inset-0 h-full w-full object-cover"
              />
            </button>
          </div>

          {/* Desktop/tablet: adaptive layouts by photo count */}
          <div className="hidden h-full md:block">
            {/* 1 photo: full-width hero */}
            {photos.length === 1 && (
              <button
                className="relative block h-full w-full overflow-hidden bg-transparent"
                onClick={() => setGalleryOpen(true)}
                title="Show all photos"
              >
                <img
                  src={photos[0]}
                  alt={title}
                  className="absolute inset-0 h-full w-full object-cover"
                />
              </button>
            )}

            {/* 2-4 photos: split hero + right stack */}
            {photos.length >= 2 && photos.length <= 4 && (
              <div className="grid h-full grid-cols-[2fr_1fr] gap-2">
                <button
                  className="relative block h-full w-full overflow-hidden bg-transparent"
                  onClick={() => setGalleryOpen(true)}
                  title="Show all photos"
                >
                  <img
                    src={photos[0]}
                    alt={title}
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                </button>

                <div
                  className={`grid h-full gap-2 ${
                    photos.length === 2
                      ? "grid-rows-1"
                      : photos.length === 3
                        ? "grid-rows-2"
                        : "grid-rows-3"
                  }`}
                >
                  {splitGalleryPhotos.map((src: string, i: number) => (
                    <button
                      key={`${src}-${i}`}
                      className="relative block h-full w-full overflow-hidden bg-transparent"
                      onClick={() => setGalleryOpen(true)}
                      title="Show all photos"
                    >
                      <img
                        src={src}
                        alt={`${title} photo ${i + 2}`}
                        className="absolute inset-0 h-full w-full object-cover"
                      />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* 5+ photos: marketplace grid */}
            {photos.length >= 5 && (
              <div className="grid h-full grid-cols-4 grid-rows-2 gap-2">
                <button
                  className="relative col-span-2 row-span-2 block h-full w-full overflow-hidden bg-transparent"
                  onClick={() => setGalleryOpen(true)}
                  title="Show all photos"
                >
                  <img
                    src={photos[0]}
                    alt={title}
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                </button>

                {marketplaceGridPhotos.map((src: string, i: number) => (
                  <button
                    key={`${src}-${i}`}
                    className="relative block h-full w-full overflow-hidden bg-transparent"
                    onClick={() => setGalleryOpen(true)}
                    title="Show all photos"
                  >
                    <img
                      src={src}
                      alt={`${title} photo ${i + 2}`}
                      className="absolute inset-0 h-full w-full object-cover"
                    />
                    {i === marketplaceGridPhotos.length - 1 && photos.length > 5 && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-white text-sm font-medium">
                        +{photos.length - 5} more
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Show all photos button */}
          <div className="absolute bottom-4 right-4">
            <button
              onClick={() => setGalleryOpen(true)}
              className="bg-white/95 hover:bg-white text-foreground border border-border rounded-lg px-3 py-2 text-sm font-medium shadow-sm"
            >
              Show all photos
            </button>
          </div>
        </div>
      </div>

      {/* Full-screen gallery */}
      {galleryOpen && (
        <div className="fixed inset-0 z-50 bg-background">
          <header className="sticky top-0 z-10 bg-background/95 backdrop-blur">
            <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-3">
              <button
                onClick={() => setGalleryOpen(false)}
                className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium hover:bg-muted"
              >
                <ChevronLeft className="w-4 h-4" />
                Back
              </button>
              <div className="text-sm text-muted-foreground">
                {photos.length} photo{photos.length === 1 ? "" : "s"}
              </div>
              <div className="w-10" aria-hidden="true" />
            </div>
          </header>

          <div className="h-[calc(100vh-73px)] overflow-y-auto">
            <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
              <div className="columns-1 sm:columns-2 lg:columns-3 gap-3 [column-fill:_balance]">
                {photos.map((src: string, i: number) => (
                  <figure
                    key={`${src}-${i}`}
                    className="mb-3 break-inside-avoid overflow-hidden rounded-xl bg-background"
                  >
                    <img
                      src={src}
                      alt={`${title} photo ${i + 1}`}
                      className="block w-full h-auto object-contain"
                      loading="lazy"
                    />
                  </figure>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
