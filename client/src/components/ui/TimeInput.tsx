import React, { useRef, useState, useEffect } from "react";
import { cn } from "@/lib/utils";

interface TimeInputProps {
  value: string; // "HH:MM" 24-hour format, or ""
  onChange: (value: string) => void;
  className?: string;
  id?: string;
}

function to12h(h24: number): { hour: number; period: "AM" | "PM" } {
  if (h24 === 0) return { hour: 12, period: "AM" };
  if (h24 < 12) return { hour: h24, period: "AM" };
  if (h24 === 12) return { hour: 12, period: "PM" };
  return { hour: h24 - 12, period: "PM" };
}

function to24h(hour12: number, period: "AM" | "PM"): number {
  if (period === "AM") return hour12 === 12 ? 0 : hour12;
  return hour12 === 12 ? 12 : hour12 + 12;
}

function parseTimeValue(v: string) {
  if (!v || !/^\d{2}:\d{2}$/.test(v)) return null;
  const h24 = parseInt(v.slice(0, 2), 10);
  const mins = parseInt(v.slice(3), 10);
  if (isNaN(h24) || isNaN(mins) || h24 > 23 || mins > 59) return null;
  return { ...to12h(h24), mins };
}

export function TimeInput({ value, onChange, className, id }: TimeInputProps) {
  const hourRef = useRef<HTMLInputElement>(null);
  const minuteRef = useRef<HTMLInputElement>(null);
  const periodRef = useRef<HTMLButtonElement>(null);
  const lastEmitted = useRef<string>("");

  const initial = parseTimeValue(value);
  const [hourStr, setHourStr] = useState(() => (initial ? String(initial.hour) : ""));
  const [minuteStr, setMinuteStr] = useState(() => (initial ? String(initial.mins).padStart(2, "0") : ""));
  const [period, setPeriod] = useState<"AM" | "PM">(() => initial?.period ?? "AM");

  // Sync when parent changes value externally (e.g. from URL params or reset)
  useEffect(() => {
    if (!value || value === lastEmitted.current) return;
    const parsed = parseTimeValue(value);
    if (!parsed) return;
    setHourStr(String(parsed.hour));
    setMinuteStr(String(parsed.mins).padStart(2, "0"));
    setPeriod(parsed.period);
  }, [value]);

  function emit(h: string, m: string, p: "AM" | "PM") {
    const hNum = parseInt(h, 10);
    const mNum = parseInt(m, 10);
    if (!h || !m || isNaN(hNum) || isNaN(mNum)) return;
    if (hNum < 1 || hNum > 12 || mNum < 0 || mNum > 59) return;
    const h24 = to24h(hNum, p);
    const out = `${String(h24).padStart(2, "0")}:${String(mNum).padStart(2, "0")}`;
    lastEmitted.current = out;
    onChange(out);
  }

  function handleHourChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value.replace(/\D/g, "").slice(0, 2);
    const num = parseInt(raw, 10);
    // Block values above 12
    if (raw !== "" && num > 12) return;
    setHourStr(raw);
    emit(raw, minuteStr, period);
    // Auto-advance: single digit ≥ 2 can't be extended to a valid 12h hour (only 10,11,12 start with 1)
    if (raw.length === 2 || (raw.length === 1 && num >= 2)) {
      minuteRef.current?.focus();
      minuteRef.current?.select();
    }
  }

  function handleMinuteChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value.replace(/\D/g, "").slice(0, 2);
    const num = parseInt(raw, 10);
    // Block values above 59
    if (raw !== "" && num > 59) return;
    setMinuteStr(raw);
    emit(hourStr, raw, period);
    // Auto-advance to AM/PM after 2 digits
    if (raw.length === 2) {
      periodRef.current?.focus();
    }
  }

  function handleMinuteBlur(e: React.FocusEvent<HTMLInputElement>) {
    // Use the DOM's actual value — React state may be stale when blur fires during
    // auto-advance (e.g. typing "59" auto-advances focus before state updates).
    const actual = e.target.value.replace(/\D/g, "").slice(0, 2);
    if (actual.length === 1) {
      const padded = actual.padStart(2, "0");
      setMinuteStr(padded);
      emit(hourStr, padded, period);
    }
  }

  function handleHourKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    // Colon or right-arrow at end → jump to minutes
    if (
      e.key === ":" ||
      (e.key === "ArrowRight" && (e.currentTarget.selectionStart ?? 0) >= hourStr.length)
    ) {
      e.preventDefault();
      minuteRef.current?.focus();
      minuteRef.current?.select();
    }
  }

  function handleMinuteKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    // Backspace on empty minutes → back to hours
    if (e.key === "Backspace" && minuteStr === "") {
      hourRef.current?.focus();
      hourRef.current?.select();
    }
    // Left arrow at start → back to hours
    if (e.key === "ArrowLeft" && (e.currentTarget.selectionStart ?? 0) === 0) {
      e.preventDefault();
      hourRef.current?.focus();
      hourRef.current?.select();
    }
    // Right arrow at end → to AM/PM
    if (e.key === "ArrowRight" && (e.currentTarget.selectionStart ?? 0) >= minuteStr.length) {
      e.preventDefault();
      periodRef.current?.focus();
    }
  }

  function togglePeriod() {
    const next: "AM" | "PM" = period === "AM" ? "PM" : "AM";
    setPeriod(next);
    emit(hourStr, minuteStr, next);
  }

  function handlePeriodKeyDown(e: React.KeyboardEvent<HTMLButtonElement>) {
    if (e.key === "a" || e.key === "A") {
      e.preventDefault();
      setPeriod("AM");
      emit(hourStr, minuteStr, "AM");
    }
    if (e.key === "p" || e.key === "P") {
      e.preventDefault();
      setPeriod("PM");
      emit(hourStr, minuteStr, "PM");
    }
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      togglePeriod();
    }
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      minuteRef.current?.focus();
      minuteRef.current?.select();
    }
  }

  return (
    <div
      className={cn(
        "flex items-center rounded-md border border-input bg-background px-3 h-9 gap-0.5 cursor-text focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2",
        className
      )}
      onClick={() => hourRef.current?.focus()}
    >
      <input
        ref={hourRef}
        id={id}
        type="text"
        inputMode="numeric"
        value={hourStr}
        onChange={handleHourChange}
        onKeyDown={handleHourKeyDown}
        onFocus={(e) => e.target.select()}
        placeholder="hh"
        maxLength={2}
        className="w-7 bg-transparent text-center text-sm outline-none tabular-nums placeholder:text-muted-foreground"
        aria-label="Hours"
      />
      <span className="text-sm text-muted-foreground select-none">:</span>
      <input
        ref={minuteRef}
        type="text"
        inputMode="numeric"
        value={minuteStr}
        onChange={handleMinuteChange}
        onKeyDown={handleMinuteKeyDown}
        onBlur={(e) => handleMinuteBlur(e)}
        onFocus={(e) => e.target.select()}
        placeholder="mm"
        maxLength={2}
        className="w-7 bg-transparent text-center text-sm outline-none tabular-nums placeholder:text-muted-foreground"
        aria-label="Minutes"
      />
      <button
        ref={periodRef}
        type="button"
        onClick={(e) => { e.stopPropagation(); togglePeriod(); }}
        onKeyDown={handlePeriodKeyDown}
        className="ml-1 rounded px-1.5 py-0.5 text-xs font-semibold bg-muted hover:bg-muted/80 select-none focus:outline-none focus:ring-1 focus:ring-ring"
        aria-label="Toggle AM/PM"
        tabIndex={0}
      >
        {period}
      </button>
    </div>
  );
}
