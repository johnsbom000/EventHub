import { useEffect, useState } from "react";
import { ChevronLeft, LayoutGrid } from "lucide-react";

type PhotoCollageProps = {
  photos: string[];
  title: string;
  heightClass?: string; // retained for API compatibility, unused
};

export default function PhotoCollage({ photos, title }: PhotoCollageProps) {
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

  const heroPhoto = photos[0];
  const gridPhotos = photos.slice(1, 5);

  const tileClass =
    "relative block overflow-hidden bg-muted transition hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

  return (
    <>
      {/* Airbnb-style collage: one large hero on the left + a 2x2 grid on the
          right, bounded to a fixed banner height. */}
      <div className="relative">
        <div className="flex h-[300px] gap-2 overflow-hidden rounded-2xl sm:h-[360px] lg:h-[460px]">
          <button
            type="button"
            onClick={() => setGalleryOpen(true)}
            title="Show all photos"
            className={`${tileClass} flex-1`}
          >
            <img
              src={heroPhoto}
              alt={`${title} photo 1`}
              className="h-full w-full object-cover"
            />
          </button>

          {gridPhotos.length > 0 && (
            <div className="hidden flex-1 grid-cols-2 grid-rows-2 gap-2 sm:grid">
              {gridPhotos.map((src, index) => (
                <button
                  key={`${src}-${index}`}
                  type="button"
                  onClick={() => setGalleryOpen(true)}
                  title="Show all photos"
                  className={tileClass}
                >
                  <img
                    src={src}
                    alt={`${title} photo ${index + 2}`}
                    className="h-full w-full object-cover"
                  />
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => setGalleryOpen(true)}
          className="absolute bottom-4 right-4 inline-flex items-center gap-2 rounded-lg border border-border bg-white/95 px-3 py-2 text-sm font-medium text-foreground shadow-sm hover:bg-white"
        >
          <LayoutGrid className="h-4 w-4" />
          Show all photos
        </button>
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
              <div className="flex gap-3">
                {[0, 1].map((col) => (
                  <div key={col} className="flex flex-1 flex-col gap-3">
                    {photos.filter((_, i) => i % 2 === col).map((src, i) => (
                      <figure
                        key={`${src}-${i}`}
                        className="overflow-hidden rounded-xl"
                      >
                        <img
                          src={src}
                          alt={`${title} photo ${i * 2 + col + 1}`}
                          className="block w-full h-auto"
                          loading="lazy"
                        />
                      </figure>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
