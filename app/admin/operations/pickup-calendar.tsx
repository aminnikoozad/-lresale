"use client";

import { useState } from "react";
import { useLocale } from "@/components/site-language";
import { savePickupCalendarDay } from "./actions";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import "@/components/pickup-calendar.css";

type Slot = { id: string; window_start: string; window_end: string; capacity: number; booked_count: number; active: boolean };
const dayOf = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
const timeOf = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));

export function PickupCalendar({ slots, today }: { slots: Slot[]; today: string }) {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const [month, setMonth] = useState(today.slice(0, 7));
  const [selected, setSelected] = useState(today);
  const [year, mon] = month.split("-").map(Number);
  const first = new Date(Date.UTC(year, mon - 1, 1));
  const count = new Date(Date.UTC(year, mon, 0)).getUTCDate();
  const selectedSlots = slots.filter(slot => dayOf(slot.window_start) === selected);
  const open = selectedSlots.some(slot => slot.active);
  const changeMonth = (delta: number) => setMonth(new Date(Date.UTC(year, mon - 1 + delta, 1)).toISOString().slice(0, 7));
  return <section className="ops-card" id="pickup-calendar">
    <h2>{fr ? "Calendrier des collectes" : "Pickup calendar"}</h2>
    <p>{fr ? "Choisissez une date, ouvrez ou fermez la journée et réglez les heures ici. Heure de Montréal." : "Click a date to open or close the day and set its pickup hours here. Montréal time."}</p>
    <div className="pickup-calendar-nav"><button type="button" onClick={() => changeMonth(-1)} aria-label={fr ? "Mois précédent" : "Previous month"}>←</button><strong>{new Intl.DateTimeFormat(fr ? "fr-CA" : "en-CA", { month: "long", year: "numeric", timeZone: "UTC" }).format(first)}</strong><button type="button" onClick={() => changeMonth(1)} aria-label={fr ? "Mois suivant" : "Next month"}>→</button></div>
    <div className="admin-calendar-grid">
      {(fr ? ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"] : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]).map(day => <b key={day} style={{textAlign:"center",fontSize:12}}>{day}</b>)}
      {Array.from({ length: first.getUTCDay() }, (_, i) => <span key={`pad-${i}`} />)}
      {Array.from({ length: count }, (_, i) => {
        const date = `${month}-${String(i + 1).padStart(2, "0")}`;
        const daySlots = slots.filter(slot => dayOf(slot.window_start) === date);
        const active = daySlots.some(slot => slot.active);
        const booked = daySlots.reduce((sum, slot) => sum + slot.booked_count, 0);
        return <button type="button" key={date} disabled={date < today} aria-pressed={selected === date} className={active ? "is-open" : ""} onClick={() => setSelected(date)}>{i + 1}<small>{active ? (fr ? "Ouvert" : "Open") : (fr ? "Fermé" : "Closed")}{booked ? ` · ${booked}` : ""}</small></button>;
      })}
    </div>
    <div className="pickup-day-editor" key={selected}>
      <strong>{selected} · {open ? (fr ? "Ouvert" : "Open") : (fr ? "Fermé" : "Closed")}</strong>
      <form action={savePickupCalendarDay}><input type="hidden" name="date" value={selected} /><input type="hidden" name="mode" value={open ? "close" : "open"} /><PendingSubmitButton pendingLabel={fr ? "Enregistrement…" : "Saving…"}>{open ? (fr ? "Fermer cette journée" : "Turn day OFF") : (fr ? "Ouvrir cette journée" : "Turn day ON")}</PendingSubmitButton></form>
      <p>{fr ? "Fermer bloque les nouvelles réservations. Les rendez-vous déjà réservés sont conservés." : "Closing blocks new bookings. Existing appointments are kept."}</p>
      {selectedSlots.map(slot => <form action={savePickupCalendarDay} key={slot.id}>
        <input type="hidden" name="date" value={selected} /><input type="hidden" name="slot_id" value={slot.id} /><input type="hidden" name="mode" value="save" />
        <label>{fr ? "Début" : "Start"}<input type="time" name="start" required defaultValue={timeOf(slot.window_start)} disabled={slot.booked_count > 0} /></label>
        <label>{fr ? "Fin" : "End"}<input type="time" name="end" required defaultValue={timeOf(slot.window_end)} disabled={slot.booked_count > 0} /></label>
        <label>{fr ? "Capacité" : "Capacity"}<input type="number" name="capacity" required min={Math.max(1,slot.booked_count)} max={100} defaultValue={slot.capacity} /></label>
        <label>{fr ? "Ouvert" : "Open"}<input type="checkbox" name="active" defaultChecked={slot.active} /></label>
        <PendingSubmitButton pendingLabel={fr ? "Enregistrement…" : "Saving…"}>{fr ? "Enregistrer" : "Save"}</PendingSubmitButton>
        {slot.booked_count > 0 ? <span className="danger-note">{slot.booked_count} {fr ? "réservations : heures verrouillées" : "booked: times locked"}</span> : null}
      </form>)}
      <form action={savePickupCalendarDay}><input type="hidden" name="date" value={selected} /><input type="hidden" name="mode" value="add" />
        <label>{fr ? "Début" : "Start"}<input type="time" name="start" required defaultValue="10:00" /></label><label>{fr ? "Fin" : "End"}<input type="time" name="end" required defaultValue="14:00" /></label><label>{fr ? "Capacité" : "Capacity"}<input type="number" name="capacity" min={1} max={100} required defaultValue={4} /></label>
        <PendingSubmitButton pendingLabel={fr ? "Enregistrement…" : "Saving…"}>{fr ? "Ajouter un créneau" : "Add time window"}</PendingSubmitButton>
      </form>
    </div>
  </section>;
}
