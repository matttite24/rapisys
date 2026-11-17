"use client";

import { useState } from "react";
import { Calendar03Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { es } from "react-day-picker/locale";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

// El valor viaja como texto "AAAA-MM-DD" (lo que guarda la base). Se arma con la
// fecha local, sin pasar por UTC, para que ningún huso horario corra el día.
const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseIsoDate(value: string): Date | undefined {
  const m = ISO.exec(value);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : undefined;
}

export function toIsoDate(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

const display = (d: Date) =>
  d.toLocaleDateString("es-EC", { day: "2-digit", month: "short", year: "numeric" });

type Props = {
  className?: string;
  id?: string;
  name: string;
  value: string;
  onChange: (iso: string) => void;
  placeholder?: string;
  "aria-invalid"?: boolean | "true" | "false";
  "aria-describedby"?: string;
};

// Selector de fecha: calendario en español dentro de un popover. Envía el valor con
// un campo oculto, así que funciona dentro de cualquier formulario.
export function DatePicker({
  className,
  name,
  value,
  onChange,
  placeholder = "Elige una fecha",
  ...a11y
}: Props) {
  const [open, setOpen] = useState(false);
  const date = parseIsoDate(value);

  return (
    <>
      <input type="hidden" name={name} value={value} />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              type="button"
              variant="outline"
              {...a11y}
              className={cn(
                "h-9! w-full justify-start gap-2 border-input px-2.5 normal-case tracking-normal",
                !date && "text-muted-foreground",
                className,
              )}
            />
          }
        >
          <HugeiconsIcon icon={Calendar03Icon} className="size-4 shrink-0" />
          <span className="num">{date ? display(date) : placeholder}</span>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto p-0">
          <Calendar
            mode="single"
            locale={es}
            selected={date}
            defaultMonth={date}
            captionLayout="dropdown"
            startMonth={new Date(2020, 0)}
            endMonth={new Date(2045, 11)}
            onSelect={(d) => {
              if (!d) return;
              onChange(toIsoDate(d));
              setOpen(false);
            }}
          />
        </PopoverContent>
      </Popover>
    </>
  );
}
