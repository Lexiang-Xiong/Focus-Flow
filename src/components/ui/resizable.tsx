import * as React from "react"
import { GripVerticalIcon } from "lucide-react"
import * as ResizablePrimitive from "react-resizable-panels"

function ResizablePanelGroup({
  children,
  className,
  direction = "horizontal",
  ...props
}: React.ComponentProps<typeof ResizablePrimitive.Group> & {
  direction?: "horizontal" | "vertical";
}) {
  return (
    <ResizablePrimitive.Group
      data-panel-group-direction={direction}
      className={`flex h-full w-full ${direction === "vertical" ? "flex-col" : ""} ${className || ""}`}
      {...props}
    >
      {children}
    </ResizablePrimitive.Group>
  )
}

function ResizablePanel({
  children,
  className,
  ...props
}: React.ComponentProps<typeof ResizablePrimitive.Panel>) {
  return (
    <ResizablePrimitive.Panel
      className={`overflow-hidden ${className || ""}`}
      {...props}
    >
      {children}
    </ResizablePrimitive.Panel>
  )
}

function ResizableHandle({
  className,
  withHandle,
  ...props
}: React.ComponentProps<typeof ResizablePrimitive.Separator> & {
  withHandle?: boolean;
}) {
  return (
    <ResizablePrimitive.Separator
      className={className}
      {...props}
    >
      {withHandle && (
        <div className="flex h-4 w-3 items-center justify-center rounded border bg-border">
          <GripVerticalIcon className="size-2.5" />
        </div>
      )}
    </ResizablePrimitive.Separator>
  )
}

export { ResizablePanelGroup, ResizablePanel, ResizableHandle }
