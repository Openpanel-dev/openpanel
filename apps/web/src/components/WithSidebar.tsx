import { type HtmlProps } from "@/types";

type WithSidebarProps = HtmlProps<HTMLDivElement>

export function WithSidebar({children}: WithSidebarProps) {
  return (
    <div className="grid grid-cols-[200px_minmax(0,1fr)] gap-8">
      {children}
    </div>
  )
}

type SidebarProps = HtmlProps<HTMLDivElement>

export function Sidebar({children}: SidebarProps) {
  return (
    <div className="flex flex-col gap-1">
      {children}
    </div>
  )
}