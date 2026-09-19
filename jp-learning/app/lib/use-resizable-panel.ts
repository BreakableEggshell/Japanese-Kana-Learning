import { useCallback, useEffect, useRef, useState } from "react";

type Side = "left" | "right";

// A panel anchored to the left edge of the screen has its drag handle on its
// right edge (dragging right grows it); one anchored to the right edge has
// its handle on its left edge (dragging left grows it).
export function useResizablePanel(defaultWidth: number, min = 320, max = 820) {
  const [width, setWidth] = useState(defaultWidth);
  const dragRef = useRef<{ startX: number; startWidth: number; side: Side } | null>(null);

  const startDrag = useCallback(
    (side: Side) => (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragRef.current = { startX: e.clientX, startWidth: width, side };
    },
    [width]
  );

  useEffect(() => {
    function handleMove(e: MouseEvent) {
      const drag = dragRef.current;
      if (!drag) return;
      const delta = e.clientX - drag.startX;
      const signedDelta = drag.side === "left" ? delta : -delta;
      setWidth(Math.min(max, Math.max(min, drag.startWidth + signedDelta)));
    }
    function handleUp() {
      dragRef.current = null;
    }
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [min, max]);

  return { width, startDrag };
}
