"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

type TooltipProps = {
  content: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
};

function Tooltip({ content, children, className, contentClassName }: TooltipProps) {
  const id = React.useId();
  const triggerRef = React.useRef<HTMLSpanElement | null>(null);
  const [open, setOpen] = React.useState(false);
  const [position, setPosition] = React.useState<{ left: number; top: number }>({ left: 0, top: 0 });
  const [placement, setPlacement] = React.useState<"top" | "bottom">("top");

  const updatePosition = React.useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) {
      return;
    }

    const rect = trigger.getBoundingClientRect();
    const estimatedWidth = Math.min(260, Math.max(180, rect.width + 120));
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const margin = 12;
    const left = Math.min(
      viewportWidth - estimatedWidth / 2 - margin,
      Math.max(estimatedWidth / 2 + margin, rect.left + rect.width / 2),
    );
    const showOnTop = rect.top > 72;

    setPlacement(showOnTop ? "top" : "bottom");
    setPosition({
      left,
      top: showOnTop ? rect.top - 10 : Math.min(viewportHeight - margin, rect.bottom + 10),
    });
  }, []);

  React.useEffect(() => {
    if (!open) {
      return;
    }

    updatePosition();
    const handleUpdate = () => updatePosition();
    window.addEventListener("resize", handleUpdate);
    window.addEventListener("scroll", handleUpdate, true);

    return () => {
      window.removeEventListener("resize", handleUpdate);
      window.removeEventListener("scroll", handleUpdate, true);
    };
  }, [open, updatePosition]);

  return (
    <>
      <span
        ref={triggerRef}
        className={cn("inline-flex", className)}
        aria-describedby={open ? id : undefined}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            setOpen(false);
          }
        }}
        onClick={() => {
          setOpen((prev) => !prev);
        }}
      >
        {children}
      </span>

      {open ? (
        <span
          id={id}
          role="tooltip"
          className={cn(
            "pointer-events-none fixed z-[80] max-w-[260px] -translate-x-1/2 rounded-2xl bg-stone-950 px-3 py-2 text-xs leading-5 text-white shadow-[0_16px_40px_-20px_rgba(0,0,0,0.45)]",
            placement === "top" ? "-translate-y-full" : "translate-y-0",
            contentClassName,
          )}
          style={{ left: position.left, top: position.top }}
        >
          {content}
        </span>
      ) : null}
    </>
  );
}

export { Tooltip };
