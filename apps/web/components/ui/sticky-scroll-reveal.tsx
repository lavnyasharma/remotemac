"use client";
import React, { useEffect, useRef, useState } from "react";
import { useMotionValueEvent, useScroll } from "motion/react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";

export const StickyScroll = ({
  content,
  contentClassName,
  backgroundColors,
  gradientColors,
  bordered = false,
}: {
  content: {
    title: string;
    description: string;
    content?: React.ReactNode | any;
  }[];
  contentClassName?: string;
  backgroundColors?: string[];
  gradientColors?: string[];
  // Renders both the outer stage and the preview card with a hairline border and a
  // transparent fill instead of the default solid/gradient demo colors.
  bordered?: boolean;
}) => {
  const [activeCard, setActiveCard] = React.useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const { scrollYProgress } = useScroll({
    // uncomment line 22 and comment line 23 if you DONT want the overflow container and want to have it change on the entire page scroll
    // target: ref
    container: ref,
    offset: ["start start", "end start"],
  });

  useMotionValueEvent(scrollYProgress, "change", () => {
    const container = ref.current;
    if (!container) return;
    // Breakpoints come from each item's actual offset in the scrollable content, not an even
    // 1/n split — the items have different heights (titles/descriptions vary in length), so an
    // even split drifts out of sync with which title is actually centered on screen.
    const scrollableHeight = container.scrollHeight - container.clientHeight;
    if (scrollableHeight <= 0) return;
    const centerScrollTop = container.scrollTop + container.clientHeight / 2;
    const distances = itemRefs.current.map((el) =>
      el ? Math.abs(centerScrollTop - (el.offsetTop + el.offsetHeight / 2)) : Infinity,
    );
    const closestIndex = distances.reduce(
      (closest, distance, index) => (distance < distances[closest]! ? index : closest),
      0,
    );
    setActiveCard(closestIndex);
  });

  const cardBackgroundColors = backgroundColors ?? [
    "#0f172a", // slate-900
    "#000000", // black
    "#171717", // neutral-900
  ];
  const linearGradients = gradientColors ?? [
    "linear-gradient(to bottom right, #06b6d4, #10b981)", // cyan-500 to emerald-500
    "linear-gradient(to bottom right, #ec4899, #6366f1)", // pink-500 to indigo-500
    "linear-gradient(to bottom right, #f97316, #eab308)", // orange-500 to yellow-500
  ];

  const [backgroundGradient, setBackgroundGradient] = useState(
    linearGradients[0],
  );

  useEffect(() => {
    setBackgroundGradient(linearGradients[activeCard % linearGradients.length]);
  }, [activeCard]);

  return (
    <motion.div
      animate={
        bordered
          ? undefined
          : { backgroundColor: cardBackgroundColors[activeCard % cardBackgroundColors.length] }
      }
      className={cn(
        "relative flex h-[30rem] justify-center space-x-16 overflow-y-auto overflow-x-hidden rounded-md p-10 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        bordered && "bg-transparent",
      )}
      ref={ref}
    >
      <div className="div relative flex items-start px-4">
        <div className="max-w-2xl">
          {content.map((item, index) => (
            <div
              key={item.title + index}
              ref={(el) => {
                itemRefs.current[index] = el;
              }}
              className="my-20"
            >
              <motion.h2
                initial={{
                  opacity: 0,
                }}
                animate={{
                  // 0.6, not the dimmer 0.3 a purely visual read would use — text-slate-100/300
                  // over black at opacity needs to still clear WCAG AA contrast even at rest.
                  opacity: activeCard === index ? 1 : 0.6,
                }}
                className="text-2xl font-bold text-slate-100"
              >
                {item.title}
              </motion.h2>
              <motion.p
                initial={{
                  opacity: 0,
                }}
                animate={{
                  opacity: activeCard === index ? 1 : 0.6,
                }}
                className="text-kg mt-10 max-w-sm text-slate-300"
              >
                {item.description}
              </motion.p>
            </div>
          ))}
          <div className="h-40" />
        </div>
      </div>
      <div
        style={bordered ? undefined : { background: backgroundGradient }}
        className={cn(
          "sticky top-10 hidden h-60 w-80 overflow-hidden rounded-md bg-white lg:block",
          bordered && "bg-transparent",
          contentClassName,
        )}
      >
        {content[activeCard]?.content ?? null}
      </div>
    </motion.div>
  );
};
