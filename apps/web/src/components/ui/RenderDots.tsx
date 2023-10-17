import { cn } from "@/utils/cn";
import { ChevronRight } from "lucide-react";

interface RenderDotsProps extends React.HTMLAttributes<HTMLDivElement> {
  children: string;
}

export function RenderDots({ children, className, ...props }: RenderDotsProps) {
  return (
    <div {...props} className={cn('flex gap-1', className)}>
      {children.split(".").map((str, index) => {
        return (
          <div className="flex items-center gap-1" key={str + index}>
            {index !== 0 && <ChevronRight className="flex-shrink-0 !w-3 !h-3 top-[0.5px] relative" />}
            <span>{str}</span>
          </div>
        );
      })}
    </div>
  );
}
