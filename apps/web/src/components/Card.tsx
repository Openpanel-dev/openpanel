import { type HtmlProps } from "@/types";

export function Card({children}: HtmlProps<HTMLDivElement>) {
  return (
    <div className="border border-border rounded">
      {children}
    </div>
  )
}