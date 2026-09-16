"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ClipboardCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import styles from "./quality.module.css";

export function InspectionEditor({
  itemId,
  category,
  condition,
  notes,
  checks,
}: {
  itemId: string;
  category: string;
  condition: string | null;
  notes: string | null;
  checks: Record<string, boolean> | null;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [itemCondition, setItemCondition] = useState(condition || "Excellent");
  const [inspectionNotes, setInspectionNotes] = useState(notes || "");
  const [values, setValues] = useState<Record<string, boolean>>(checks || {});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const fields = category === "electronics"
    ? [
        ["physicalCondition", "Physical condition checked"],
        ["powersOn", "Power-on / basic function checked"],
        ["screenBody", "Screen and body checked"],
        ["ownership", "Ownership / serial or IMEI reviewed where applicable"],
        ["activationLock", "Passwords and activation lock removed"],
      ]
    : [
        ["clean", "Clean / presentation checked"],
        ["stains", "Stains checked"],
        ["tears", "Tears, holes and missing parts checked"],
        ["hardware", "Zippers, buttons and hardware checked where applicable"],
        ["conditionGrade", "Condition grade reviewed"],
      ];

  async function save() {
    setSaving(true);
    setMessage(null);
    const { error } = await supabase.rpc("admin_set_item_inspection", {
      target_item_id: itemId,
      target_condition: itemCondition,
      target_notes: inspectionNotes || null,
      target_checks: values,
    });
    setSaving(false);
    if (error) setMessage(error.message);
    else {
      setMessage("Inspection saved.");
      router.refresh();
    }
  }

  return (
    <div className={styles.editor}>
      <div className={styles.editorTitle}><ClipboardCheck/><b>REWEAR inspection report</b></div>
      <label>Condition grade
        <select value={itemCondition} onChange={(e) => setItemCondition(e.target.value)}>
          <option>New with tags</option><option>Like new</option><option>Excellent</option><option>Very good</option><option>Good</option><option>Tested</option>
        </select>
      </label>
      <div className={styles.checks}>
        {fields.map(([key, label]) => <label key={key}><input type="checkbox" checked={Boolean(values[key])} onChange={(e) => setValues((current) => ({ ...current, [key]: e.target.checked }))}/><span>{label}</span></label>)}
      </div>
      <label>Customer-facing inspection notes
        <textarea rows={3} maxLength={1000} value={inspectionNotes} onChange={(e) => setInspectionNotes(e.target.value)} placeholder="Example: Very light wear at cuff; no stains or holes."/>
      </label>
      <button type="button" onClick={() => void save()} disabled={saving}><CheckCircle2/>{saving ? "Saving…" : "Save inspection"}</button>
      {message ? <small>{message}</small> : null}
    </div>
  );
}
