"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";

export function ApiKeyForm(props: {
  label: string;
  initialValue?: string;
  placeholder?: string;
  onSave: (value: string) => void | Promise<void>;
}) {
  const [value, setValue] = useState(props.initialValue ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(Boolean(props.initialValue));

  return (
    <Card>
      <CardBody>
        <form
          className="flex flex-col gap-3 sm:flex-row sm:items-end"
          onSubmit={async (event) => {
            event.preventDefault();
            const trimmed = value.trim();
            if (!trimmed) {
              toast.error("API key required", {
                description: "Paste your key before saving.",
              });
              return;
            }

            setSaving(true);
            try {
              await props.onSave(trimmed);
              setSaved(true);
              toast.success("API key saved", {
                description: "Session ready for this browser tab.",
              });
            } catch (error) {
              toast.error("Could not save key", {
                description:
                  error instanceof Error ? error.message : "Please try again.",
              });
            } finally {
              setSaving(false);
            }
          }}
        >
          <div className="flex-1 space-y-1.5">
            <label className="text-sm text-neutral-600">{props.label}</label>
            <input
              className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm placeholder:text-neutral-400 focus:border-neutral-400 focus:outline-none"
              type="password"
              value={value}
              onChange={(event) => {
                setValue(event.target.value);
                setSaved(false);
              }}
              placeholder={props.placeholder ?? "Paste your API key"}
              autoComplete="off"
            />
          </div>
          <Button type="submit" loading={saving} className="shrink-0">
            {saved ? "Update key" : "Save key"}
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}
