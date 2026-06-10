import { useEffect, useState } from "react";
import { ChevronLeft } from "lucide-react";

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

  const previewPhotos = photos.slice(0, 4);
  const remaining = photos.length - previewPhotos.length;

  return (
    <>
      <div className="space-y-3">
        <div className="grid grid-cols-2 grid-rows-2 gap-2 h-72">
          {previewPhotos.map((src, i) => {
            const isLast = i === previewPhotos.length - 1 && remaining > 0;
            return (
              <button
                key={`${src}-${i}`}
                type="button"
                className="relative overflow-hidden rounded-lg bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => setGalleryOpen(true)}
                title="Show all photos"
              >
                <img
                  src={src}
                  alt={`${title} photo ${i + 1}`}
                  className="absolute inset-0 h-full w-full object-cover"
                />
                {isLast && (
                  <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/50 text-sm font-medium text-white">
                    +{remaining} more
                  </div>
                )}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => setGalleryOpen(true)}
          className="rounded-lg border border-border bg-white/95 px-3 py-2 text-sm font-medium text-foreground shadow-sm hover:bg-white"
        >
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
