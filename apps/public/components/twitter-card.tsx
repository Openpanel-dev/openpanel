import {
  BadgeIcon,
  CheckCheckIcon,
  CheckIcon,
  HeartIcon,
  MessageCircleIcon,
  RefreshCwIcon,
} from 'lucide-react';
import Image from 'next/image';

interface TwitterCardProps {
  avatarUrl?: string;
  name: string;
  handle: string;
  content: React.ReactNode;
  replies?: number;
  retweets?: number;
  likes?: number;
  verified?: boolean;
}

export function TwitterCard({
  avatarUrl,
  name,
  handle,
  content,
  replies = 0,
  retweets = 0,
  likes = 0,
  verified = false,
}: TwitterCardProps) {
  const renderContent = () => {
    if (typeof content === 'string') {
      return <p className="text-muted-foreground">{content}</p>;
    }

    if (Array.isArray(content) && typeof content[0] === 'string') {
      return content.map((line) => <p key={line}>{line}</p>);
    }

    return content;
  };

  return (
    <div className="border rounded-lg p-8 col gap-4 bg-background-light">
      <div className="row gap-4">
        <div className="size-12 rounded-full bg-muted overflow-hidden shrink-0">
          {avatarUrl && (
            <Image src={avatarUrl} alt={name} width={48} height={48} />
          )}
        </div>
        <div className="col gap-1">
          <div className="col">
            <div className="">
              <span className="font-medium">{name}</span>
              {verified && (
                <div className="relative inline-block top-0.5 ml-1">
                  <BadgeIcon className="size-4 fill-[#1D9BF0] text-[#1D9BF0]" />
                  <div className="absolute inset-0 center-center">
                    <CheckIcon className="size-2 text-white" strokeWidth={3} />
                  </div>
                </div>
              )}
            </div>
            <span className="text-muted-foreground text-sm leading-0">
              @{handle}
            </span>
          </div>
          {renderContent()}
          <div className="row gap-4 text-muted-foreground text-sm mt-4">
            <div className="row gap-2">
              <MessageCircleIcon className="transition-all size-4 fill-background hover:fill-blue-500 hover:text-blue-500" />
              {/* <span>{replies}</span> */}
            </div>
            <div className="row gap-2">
              <RefreshCwIcon className="transition-all size-4 fill-background hover:text-emerald-500" />
              {/* <span>{retweets}</span> */}
            </div>
            <div className="row gap-2">
              <HeartIcon className="transition-all size-4 fill-background hover:fill-rose-500 hover:text-rose-500" />
              {/* <span>{likes}</span> */}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
