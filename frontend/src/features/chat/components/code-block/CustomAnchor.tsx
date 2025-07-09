import { Tooltip } from "@heroui/tooltip";
import { GlobeIcon } from "lucide-react";
import Image from "next/image";
import { ReactNode, useState } from "react";

import Spinner from "@/components/ui/shadcn/spinner";
import {
  usePrefetchUrlMetadata,
  useUrlMetadata,
} from "@/features/chat/hooks/useUrlMetadata";

const CustomAnchor = ({
  href,
  children,
}: {
  href: string | undefined;
  children: ReactNode | string | null;
}) => {
  // Use React Query hook for optimized data fetching
  const { data: metadata, isLoading, error } = useUrlMetadata(href);
  const prefetchUrlMetadata = usePrefetchUrlMetadata();

  const [validFavicon, setValidFavicon] = useState(true);
  const [validImage, setValidImage] = useState(true);
  const [tooltipOpen, setTooltipOpen] = useState(false);

  // Handle prefetching on hover for better UX
  const handleMouseEnter = () => {
    if (href && !metadata) {
      prefetchUrlMetadata(href);
    }
  };

  if (!href) return null;

  return (
    <Tooltip
      showArrow
      className="relative max-w-[280px] border border-zinc-700 bg-zinc-900 p-3 text-white shadow-lg"
      content={
        isLoading ? (
          <div className="flex justify-center p-5">
            <Spinner />
          </div>
        ) : error ? (
          <div className="flex items-center gap-2 p-3 text-red-400">
            <GlobeIcon className="h-4 w-4" />
            <span className="text-sm">Failed to load preview</span>
          </div>
        ) : metadata ? (
          <div className="flex w-full flex-col gap-2">
            {/* Website Image */}
            {metadata.website_image && validImage && (
              <div className="relative aspect-video w-full overflow-hidden rounded-lg">
                <Image
                  src={metadata.website_image}
                  alt="Website Image"
                  layout="responsive"
                  width={280}
                  height={157}
                  objectFit="cover"
                  className="rounded-lg"
                  onError={() => setValidImage(false)}
                />
              </div>
            )}

            {/* Website Name & Favicon */}
            {(metadata.website_name || (metadata.favicon && validFavicon)) && (
              <div className="flex items-center gap-2">
                {metadata.favicon && validFavicon ? (
                  <Image
                    width={20}
                    height={20}
                    alt="Fav Icon"
                    className="h-5 w-5 rounded-full"
                    src={metadata.favicon}
                    onError={() => setValidFavicon(false)}
                  />
                ) : (
                  <GlobeIcon className="h-5 w-5 text-gray-400" />
                )}
                {metadata.website_name && (
                  <div className="truncate text-sm font-semibold">
                    {metadata.website_name}
                  </div>
                )}
              </div>
            )}

            {/* Title */}
            {metadata.title && (
              <div className="truncate text-sm font-medium text-white">
                {metadata.title}
              </div>
            )}

            {/* Description */}
            {metadata.description && (
              <div className="line-clamp-3 text-xs text-gray-400">
                {metadata.description}
              </div>
            )}

            {/* URL Link */}
            <a
              className="truncate text-xs text-primary hover:underline"
              href={href}
              rel="noopener noreferrer"
              target="_blank"
            >
              {href.replace("https://", "").replace("http://", "")}
            </a>
          </div>
        ) : (
          <div className="flex items-center gap-2 p-3">
            <GlobeIcon className="h-4 w-4 text-gray-400" />
            <span className="text-sm text-gray-400">No preview available</span>
          </div>
        )
      }
      isOpen={tooltipOpen}
      onOpenChange={setTooltipOpen}
    >
      <a
        href={href}
        className="cursor-pointer rounded-sm bg-primary/20 px-1 text-sm font-medium text-primary transition-all hover:text-white hover:underline"
        rel="noopener noreferrer"
        target="_blank"
        onMouseEnter={handleMouseEnter}
      >
        {children}
      </a>
    </Tooltip>
  );
};

export default CustomAnchor;
