import { type HtmlProps } from "@/types";
import { cn } from "@/utils/cn";

export function Container({className,...props}: HtmlProps<HTMLDivElement>) {
  return (
    <div className={cn("mx-auto w-full max-w-4xl", className)} {...props} />
  );
}
