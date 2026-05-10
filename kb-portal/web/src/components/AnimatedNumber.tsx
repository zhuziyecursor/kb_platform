'use client';

import { useEffect, useState, useRef } from 'react';

interface AnimatedNumberProps {
  value: number;
  duration?: number;
  className?: string;
  suffix?: string;
}

export default function AnimatedNumber({ value, duration = 1200, className, suffix }: AnimatedNumberProps) {
  const [display, setDisplay] = useState(0);
  const startTime = useRef<number | null>(null);
  const startValue = useRef(0);
  const prevValue = useRef(value);

  useEffect(() => {
    // If value hasn't actually changed (e.g. re-render), don't re-animate
    if (prevValue.current === value && display === value) return;

    startTime.current = null;
    startValue.current = display;
    prevValue.current = value;
    let raf: number;

    const animate = (timestamp: number) => {
      if (!startTime.current) startTime.current = timestamp;
      const progress = Math.min((timestamp - startTime.current) / duration, 1);
      // easeOutCubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.floor(startValue.current + (value - startValue.current) * eased);
      setDisplay(current);
      if (progress < 1) {
        raf = requestAnimationFrame(animate);
      }
    };

    raf = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);

  return (
    <span className={className}>
      {display.toLocaleString()}
      {suffix}
    </span>
  );
}
