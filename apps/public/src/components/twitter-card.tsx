import {
  BadgeIcon,
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
      return <p className="text-sm">{content}</p>;
    }

    if (Array.isArray(content) && typeof content[0] === 'string') {
      return content.map((line) => (
        <p className="text-sm" key={line}>
          {line}
        </p>
      ));
    }

    return <div className="text-sm">{content}</div>;
  };

  return (
    <div className="col gap-4 rounded-3xl border bg-background-light p-8">
      <div className="row gap-4">
        <div className="size-12 shrink-0 overflow-hidden rounded-full bg-muted">
          {avatarUrl && (
            <Image alt={name} height={48} src={avatarUrl} width={48} />
          )}
        </div>
        <div className="col gap-4">
          <div className="col gap-2">
            <div className="">
              <span className="font-medium">{name}</span>
              {verified && (
                <div className="relative top-0.5 ml-1 inline-block">
                  <BadgeIcon className="size-4 fill-[#1D9BF0] text-[#1D9BF0]" />
                  <div className="center-center absolute inset-0">
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
          <div className="row gap-4 text-muted-foreground text-sm">
            <div className="row gap-2">
              <MessageCircleIcon className="size-4 fill-background transition-all hover:fill-blue-500 hover:text-blue-500" />
              {/* <span>{replies}</span> */}
            </div>
            <div className="row gap-2">
              <RefreshCwIcon className="size-4 fill-background transition-all hover:text-blue-500" />
              {/* <span>{retweets}</span> */}
            </div>
            <div className="row gap-2">
              <HeartIcon className="size-4 fill-background transition-all hover:fill-rose-500 hover:text-rose-500" />
              {/* <span>{likes}</span> */}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
