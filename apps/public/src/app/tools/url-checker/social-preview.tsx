import { ExternalLink } from 'lucide-react';

interface SocialPreviewProps {
  title: string | null;
  description: string | null;
  image: string | null;
  url: string;
  domain: string;
}

export function SocialPreview({
  title,
  description,
  image,
  url,
  domain,
}: SocialPreviewProps) {
  const displayTitle = title || 'No title set';
  const displayDescription = description || 'No description set';
  const hasImage = !!image;

  return (
    <div className="border border-border rounded-lg overflow-hidden bg-card shadow-sm">
      {/* Platform header */}
      <div className="px-3 py-2 bg-muted border-b border-border flex items-center gap-2">
        <img
          src={`https://api.openpanel.dev/misc/favicon?url=${encodeURIComponent(url)}`}
          alt="Favicon"
          className="size-4"
        />
        <span className="text-xs font-semibold text-foreground">{domain}</span>
      </div>

      {/* Image */}
      {hasImage ? (
        <div className="relative w-full aspect-[1.91/1] bg-muted">
          <img
            src={image}
            alt=""
            className="w-full h-full object-cover"
            onError={(e) => {
              const target = e.target as HTMLImageElement;
              target.style.display = 'none';
              const parent = target.parentElement;
              if (parent) {
                parent.innerHTML =
                  '<div class="w-full h-full flex items-center justify-center text-muted-foreground text-sm">Image failed to load</div>';
              }
            }}
          />
        </div>
      ) : (
        <div className="w-full aspect-[1.91/1] bg-muted flex items-center justify-center">
          <span className="text-muted-foreground text-sm">No image</span>
        </div>
      )}

      {/* Content */}
      <div className="p-3 space-y-1">
        <div className="text-xs text-muted-foreground uppercase tracking-wide">
          {domain}
        </div>
        <div className="text-base font-semibold text-foreground line-clamp-2">
          {displayTitle}
        </div>
        <div className="text-sm text-muted-foreground line-clamp-2">
          {displayDescription}
        </div>
        <div className="flex items-center gap-1 text-xs text-muted-foreground pt-1">
          <ExternalLink className="size-3" />
          <span className="truncate">{url}</span>
        </div>
      </div>
    </div>
  );
}
