"use client";

import { useState } from "react";
import { useLocale } from "@/components/site-language";
import "./pickup-calendar.css";

export function PickupTimePicker({ slots }: { slots: { id: string; date: string; label: string; remaining: number }[] }) {
  const { locale } = useLocale();
  const [date, setDate] = useState(slots[0]?.date ?? "");
  const [selected, setSelected] = useState("");
  const dates = [...new Set(slots.map(slot => slot.date))];
  const fr = locale === "fr";
  return <fieldset className="pickup-calendar"><legend>{fr ? "Date et heure de collecte" : "Pickup date & time"}</legend>
    <p>{fr ? "Heure de Montréal. Seuls les créneaux ouverts sont proposés." : "Montréal time. Only open pickup times are offered."}</p>
    {!dates.length ? <p role="status">{fr ? "Aucun créneau ouvert actuellement. Veuillez revenir plus tard ou contacter le soutien." : "No pickup times are open right now. Please check back or contact support."}</p> : <>
      <div className="pickup-date-grid" role="group" aria-label={fr ? "Dates disponibles" : "Available dates"}>{dates.map(day => <button type="button" key={day} aria-pressed={date === day} onClick={() => { setDate(day); setSelected(""); }}>{new Intl.DateTimeFormat(fr ? "fr-CA" : "en-CA", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${day}T12:00:00Z`))}</button>)}</div>
      <div className="pickup-time-grid">{slots.filter(slot => slot.date === date).map(slot => <label key={slot.id} className={selected === slot.id ? "is-selected" : ""}><input type="radio" name="pickup_slot_id" value={slot.id} checked={selected === slot.id} onChange={() => setSelected(slot.id)} required /> <span>{slot.label}<small>{slot.remaining} {fr ? "places restantes" : "spots left"}</small></span></label>)}</div>
    </>}
  </fieldset>;
}
