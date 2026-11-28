import { DASHBOARD_REFRESH_MINUTES, type DashboardRefreshMinutes } from "@pg_select1/shared";
import { TimerIcon } from "lucide-react";
import { type KeyboardEvent, type PointerEvent, useEffect, useRef, useState } from "react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type Minutes = DashboardRefreshMinutes | null;

// The dial's notches, clockwise from the top: off, then each interval in turn.
const STEPS: readonly Minutes[] = [null, ...DASHBOARD_REFRESH_MINUTES];
// How far round the last notch is, leaving a gap before the first.
const SWEEP = 300;
const SIZE = 36;
const CENTER = SIZE / 2;
// The ring is the dial's border, as thin as the other buttons' and on their edge.
const STROKE = 1.5;
const RADIUS = CENTER - STROKE / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
// How far the pointer moves before pressing becomes turning rather than a click.
const DRAG_PX = 4;
// How long the dial rests on a notch before it's picked, so turning it past others saves once.
const SETTLE_MS = 600;

function angleOf(step: number): number {
  return (step / (STEPS.length - 1)) * SWEEP;
}

// A point on the dial `angle` degrees clockwise from the top, `r` from its centre.
function pointAt(angle: number, r: number): { x: number; y: number } {
  const radians = ((angle - 90) * Math.PI) / 180;
  return { x: CENTER + r * Math.cos(radians), y: CENTER + r * Math.sin(radians) };
}

// The notch nearest where the pointer is, by its angle round the dial's centre.
function stepAt(event: PointerEvent, box: DOMRect): number {
  const x = event.clientX - (box.left + box.width / 2);
  const y = event.clientY - (box.top + box.height / 2);
  const angle = ((Math.atan2(y, x) * 180) / Math.PI + 90 + 360) % 360;
  // In the gap past the last notch, the nearer end of it wins.
  if (angle > SWEEP) return angle - SWEEP < (360 - SWEEP) / 2 ? STEPS.length - 1 : 0;
  return Math.round((angle / SWEEP) * (STEPS.length - 1));
}

// How a refresh interval reads, `null` for refreshing only when asked.
function refreshLabel(minutes: Minutes): string {
  if (minutes === null) return "Doesn't refresh by itself";
  if (minutes === 60) return "Refreshes every hour";
  return `Refreshes every ${minutes} minutes`;
}

/**
 * A round dial for how often a dashboard runs its queries again: off, or every 3, 5, 10, 15 or
 * 30 minutes or every hour, its border filling clockwise as it's turned up, to a dot in the
 * highlight where it points. Clicking it
 * turns it to the next notch, round to off after the hour; dragging round it turns it to the
 * notch nearest the pointer; and the arrow keys, Home and End turn it from the keyboard, as a
 * slider, with Enter and Space as a click. It shows where it's turned at once, and hands the notch to `onChange` once it rests
 * there, so turning it past several saves only the last.
 */
export function RefreshDial({
  minutes,
  onChange,
}: {
  minutes: number | null;
  onChange: (minutes: Minutes) => void;
}) {
  // Where it's turned to but not yet handed on, while it's being turned.
  const [turned, setTurned] = useState<number | undefined>(undefined);
  const drag = useRef<{ x: number; y: number; moved: boolean } | undefined>(undefined);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // `onChange` as it is when the dial comes to rest, not as it was when it was turned.
  const latest = useRef(onChange);
  useEffect(() => {
    latest.current = onChange;
  });

  useEffect(
    () => () => {
      clearTimeout(timer.current);
    },
    [],
  );

  const saved = Math.max(
    0,
    STEPS.findIndex((m) => m === minutes),
  );
  const step = turned ?? saved;
  const value = STEPS[step] ?? null;

  // Shows `next` now, and hands it on once the dial has rested there a moment.
  const turnTo = (next: number, settle = SETTLE_MS) => {
    setTurned(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setTurned(undefined);
      if (next !== saved) latest.current(STEPS[next] ?? null);
    }, settle);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    const last = STEPS.length - 1;
    const next = {
      ArrowRight: Math.min(step + 1, last),
      ArrowUp: Math.min(step + 1, last),
      ArrowLeft: Math.max(step - 1, 0),
      ArrowDown: Math.max(step - 1, 0),
      Home: 0,
      End: last,
      // As a click: the next notch, round to off after the last.
      Enter: (step + 1) % STEPS.length,
      " ": (step + 1) % STEPS.length,
    }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    turnTo(next);
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, y: event.clientY, moved: false };
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const pressed = drag.current;
    if (!pressed) return;
    if (!pressed.moved) {
      const far = Math.hypot(event.clientX - pressed.x, event.clientY - pressed.y) >= DRAG_PX;
      if (!far) return;
      pressed.moved = true;
    }
    const next = stepAt(event, event.currentTarget.getBoundingClientRect());
    // Nothing's handed on until it's let go.
    clearTimeout(timer.current);
    setTurned(next);
  };

  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const pressed = drag.current;
    drag.current = undefined;
    if (!pressed) return;
    if (pressed.moved) turnTo(stepAt(event, event.currentTarget.getBoundingClientRect()), 0);
    else turnTo((step + 1) % STEPS.length);
  };

  const on = value !== null;
  const angle = angleOf(step);
  const knob = pointAt(angle, RADIUS);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- a range input can't be drawn as a dial
          role="slider"
          tabIndex={0}
          aria-label="How often to run the queries again"
          aria-valuemin={0}
          aria-valuemax={STEPS.length - 1}
          aria-valuenow={step}
          aria-valuetext={refreshLabel(value)}
          className="relative size-9 shrink-0 cursor-pointer touch-none rounded-full bg-background text-muted-foreground shadow-xs transition-colors outline-none select-none hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 data-[on=true]:text-foreground dark:bg-input/30 dark:hover:bg-input/50"
          data-on={on}
          onKeyDown={onKeyDown}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => {
            drag.current = undefined;
            setTurned(undefined);
          }}
        >
          <svg
            aria-hidden="true"
            viewBox={`0 0 ${SIZE} ${SIZE}`}
            className="absolute inset-0 size-full overflow-visible"
          >
            <circle
              cx={CENTER}
              cy={CENTER}
              r={RADIUS}
              fill="none"
              strokeWidth={STROKE}
              className="stroke-border dark:stroke-input"
            />
            {on && (
              <>
                <circle
                  cx={CENTER}
                  cy={CENTER}
                  r={RADIUS}
                  fill="none"
                  strokeWidth={STROKE}
                  strokeLinecap="round"
                  strokeDasharray={`${(angle / 360) * CIRCUMFERENCE} ${CIRCUMFERENCE}`}
                  transform={`rotate(-90 ${CENTER} ${CENTER})`}
                  className="stroke-foreground"
                />
                <circle
                  cx={knob.x}
                  cy={knob.y}
                  r={2.5}
                  strokeWidth={1}
                  className="fill-highlight stroke-foreground"
                />
              </>
            )}
          </svg>
          <TimerIcon strokeWidth={1.75} className="absolute inset-0 m-auto size-4" />
        </div>
      </TooltipTrigger>
      <TooltipContent>{refreshLabel(value)}</TooltipContent>
    </Tooltip>
  );
}
