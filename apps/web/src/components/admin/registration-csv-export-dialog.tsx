"use client";

import { useEffect, useMemo, useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { downloadCsv, slugForFilename } from "@/lib/csv";
import {
  buildRegistrationCsvRows,
  defaultSelectedCsvColumnKeys,
  discoverRegistrationCsvColumns,
  type RegistrationCsvSource,
} from "@/lib/registration-csv";
import type { RegistrationFormField, RegistrationFormSection } from "@/lib/registration-forms/types";

export function RegistrationCsvExportDialog({
  open,
  onOpenChange,
  eventTitle,
  registrations,
  formFields,
  formSections,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eventTitle: string;
  registrations: RegistrationCsvSource[];
  formFields?: RegistrationFormField[];
  formSections?: RegistrationFormSection[];
}) {
  const columns = useMemo(
    () =>
      discoverRegistrationCsvColumns({
        registrations,
        formFields,
        formSections,
      }),
    [registrations, formFields, formSections]
  );

  const [selected, setSelected] = useState<Set<string>>(() => defaultSelectedCsvColumnKeys(columns));
  const [includeArchived, setIncludeArchived] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSelected(defaultSelectedCsvColumnKeys(columns));
    setIncludeArchived(false);
  }, [open, columns]);

  const metaCols = columns.filter((c) => c.group === "meta");
  const formCols = columns.filter((c) => c.group === "form");
  const extraCols = columns.filter((c) => c.group === "extra");

  const toggle = (key: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(columns.map((c) => c.key)));
  const deselectAll = () => setSelected(new Set());

  const onDownload = () => {
    const keys = columns.map((c) => c.key).filter((k) => selected.has(k));
    if (keys.length === 0) return;
    const rows = buildRegistrationCsvRows({
      registrations,
      columns,
      selectedKeys: keys,
      includeArchived,
      formFields,
    });
    const filename = `${slugForFilename(eventTitle)}-registrations.csv`;
    downloadCsv(filename, rows);
    onOpenChange(false);
  };

  const renderGroup = (title: string, cols: typeof columns) => {
    if (cols.length === 0) return null;
    return (
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
        <div className="grid max-h-48 gap-2 overflow-y-auto sm:grid-cols-2">
          {cols.map((col) => (
            <label
              key={col.key}
              className="flex cursor-pointer items-start gap-2 rounded-md border border-transparent px-1 py-0.5 hover:bg-muted/50"
            >
              <Checkbox
                checked={selected.has(col.key)}
                onCheckedChange={(v) => toggle(col.key, v === true)}
                className="mt-0.5"
              />
              <span className="min-w-0">
                <span className="block text-sm text-foreground">{col.label}</span>
                <span className="block truncate text-[11px] text-muted-foreground">{col.key}</span>
              </span>
            </label>
          ))}
        </div>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-[#1a3556] dark:text-foreground">Export CSV</DialogTitle>
          <DialogDescription>
            Choose which fields to include for {eventTitle || "this event"}. Signature ink is never
            exported — selected signature columns show Signed or Missing.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={selectAll}>
            Select all
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={deselectAll}>
            Deselect all
          </Button>
        </div>

        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <Checkbox
            checked={includeArchived}
            onCheckedChange={(v) => setIncludeArchived(v === true)}
          />
          Include archived registrations
        </label>

        <div className="space-y-4">
          {renderGroup("Registration info", metaCols)}
          {renderGroup("Form fields", formCols)}
          {renderGroup("Additional fields in data", extraCols)}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            className="bg-[#1a3556] text-white dark:bg-[#ffd700] dark:text-[#122540]"
            disabled={selected.size === 0 || registrations.length === 0}
            onClick={onDownload}
          >
            <Download className="mr-2 h-4 w-4" />
            Download CSV
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
