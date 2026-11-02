"use client";

import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";

// Campo con etiqueta, error junto al campo y vínculo accesible entre ambos.
export function FormField({
  name,
  label,
  error,
  hint,
  children,
}: {
  name: string;
  label: string;
  error?: string;
  hint?: React.ReactNode;
  children: (a11y: Record<string, string | boolean | undefined>) => React.ReactNode;
}) {
  const describedBy = [error && `${name}-error`, hint && `${name}-hint`]
    .filter(Boolean)
    .join(" ");
  return (
    <Field data-invalid={error ? true : undefined}>
      <FieldLabel htmlFor={name}>{label}</FieldLabel>
      {children({
        id: name,
        name,
        "aria-invalid": error ? true : undefined,
        "aria-describedby": describedBy || undefined,
      })}
      {hint && (
        <FieldDescription id={`${name}-hint`} className="font-mono text-xs">
          {hint}
        </FieldDescription>
      )}
      {error && <FieldError id={`${name}-error`}>{error}</FieldError>}
    </Field>
  );
}
