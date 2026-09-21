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
    <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
      {/* Platform header */}
      <div className="flex items-center gap-2 border-border border-b bg-muted px-3 py-2">
        <img
          alt="Favicon"
          className="size-4"
          src={`https://api.openpanel.dev/misc/favicon?url=${encodeURIComponent(url)}`}
        />
        <span className="font-semibold text-foreground text-xs">{domain}</span>
      </div>

      {/* Image */}
      {hasImage ? (
        <div className="relative aspect-[1.91/1] w-full bg-muted">
          <img
            alt=""
            className="h-full w-full object-cover"
            onError={(e) => {
              const target = e.target as HTMLImageElement;
              target.style.display = 'none';
              const parent = target.parentElement;
              if (parent) {
                parent.innerHTML =
                  '<div class="w-full h-full flex items-center justify-center text-muted-foreground text-sm">Image failed to load</div>';
              }
            }}
            src={image}
          />
        </div>
      ) : (
        <div className="flex aspect-[1.91/1] w-full items-center justify-center bg-muted">
          <span className="text-muted-foreground text-sm">No image</span>
        </div>
      )}

      {/* Content */}
      <div className="space-y-1 p-3">
        <div className="text-muted-foreground text-xs uppercase tracking-wide">
          {domain}
        </div>
        <div className="line-clamp-2 font-semibold text-base text-foreground">
          {displayTitle}
        </div>
        <div className="line-clamp-2 text-muted-foreground text-sm">
          {displayDescription}
        </div>
        <div className="flex items-center gap-1 pt-1 text-muted-foreground text-xs">
          <ExternalLink className="size-3" />
          <span className="truncate">{url}</span>
        </div>
      </div>
    </div>
  );
}
