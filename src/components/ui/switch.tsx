"use client"

import * as React from "react"
import * as SwitchPrimitive from "@radix-ui/react-switch"

import { cn } from "@/lib/utils"

function Switch({
  className,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    // Root 按钮部分
    <SwitchPrimitive.Root
      className={cn(
        "peer inline-flex h-[1.15rem] w-8 shrink-0 items-center rounded-full border border-transparent shadow-xs transition-all outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50",
        // 关闭时的底色：深灰色
        "data-[state=unchecked]:bg-slate-700",
        // 开启时的底色：蓝色（比白色更像“开启”）
        "data-[state=checked]:bg-blue-600", 
        className
      )}
      {...props}
    >
      {/* Thumb 滑块部分 */}
      <SwitchPrimitive.Thumb
        className={cn(
          "pointer-events-none block size-4 rounded-full ring-0 transition-transform",
          // 开启时：滑块是纯白
          "data-[state=checked]:bg-white data-[state=checked]:translate-x-[calc(100%-2px)]",
          // 关闭时：滑块是淡灰色，且回到原位
          "data-[state=unchecked]:bg-slate-400 data-[state=unchecked]:translate-x-0"
        )}
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
