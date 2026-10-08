"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RegistrationCsvExportDialog } from "@/components/admin/registration-csv-export-dialog";
import type { RegistrationCsvSource } from "@/lib/registration-csv";
import type { RegistrationFormField, RegistrationFormSection } from "@/lib/registration-forms/types";

export function RegistrationCsvExportButton({
  eventTitle,
  registrations,
  formFields,
  formSections,
  disabled,
  variant = "default",
  size = "default",
  className,
}: {
  eventTitle: string;
  registrations: RegistrationCsvSource[];
  formFields?: RegistrationFormField[];
  formSections?: RegistrationFormSection[];
  disabled?: boolean;
  variant?: "default" | "outline" | "secondary";
  size?: "default" | "sm";
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        variant={variant}
        size={size}
        className={className}
        disabled={disabled || registrations.length === 0}
        onClick={() => setOpen(true)}
      >
        <Download className="mr-2 h-4 w-4" />
        Export CSV
      </Button>
      <RegistrationCsvExportDialog
        open={open}
        onOpenChange={setOpen}
        eventTitle={eventTitle}
        registrations={registrations}
        formFields={formFields}
        formSections={formSections}
      />
    </>
  );
}
