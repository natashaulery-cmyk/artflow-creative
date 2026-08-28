import React, { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useEntity } from "@/lib/useBusinessData";
import PullToRefresh from "@/components/PullToRefresh";
import ScheduleEventForm from "@/components/ScheduleEventForm";
import PageHeader from "@/components/PageHeader";

const DOW = ["S", "M", "T", "W", "T", "F", "S"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function ymd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function longDate(key) {
  if (!key) return "";
  return new Date(key + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function monthShort(key) {
  return new Date(key + "T00:00:00").toLocaleDateString("en-US", { month: "short" });
}

function dayNum(key) {
  return new Date(key + "T00:00:00").getDate();
}

export default function Calendar() {
  const { records, loading, reload } = useEntity("ScheduleEvent", "date");
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [view, setView] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d;
  });
  const [selected, setSelected] = useState(ymd(today));
  const [formOpen, setFormOpen] = useState(false);
  const [editEvent, setEditEvent] = useState(null);

  const byDate = useMemo(() => {
    const m = {};
    records.forEach((r) => {
      const k = (r.date || "").slice(0, 10);
      if (!k) return;
      (m[k] = m[k] || []).push(r);
    });
    return m;
  }, [records]);

  const grid = useMemo(() => {
    const first = new Date(view.getFullYear(), view.getMonth(), 1);
    const startDay = first.getDay();
    const daysInMonth = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < startDay; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push(new Date(view.getFullYear(), view.getMonth(), d));
    }
    return cells;
  }, [view]);

  const selectedEvents = (byDate[selected] || []).slice().sort((a, b) =>
    (a.time || "").localeCompare(b.time || "")
  );

  const upcoming = useMemo(() => {
    const t = ymd(today);
    return records
      .filter((r) => (r.date || "").slice(0, 10) >= t)
      .sort((a, b) => (a.date + (a.time || "")).localeCompare(b.date + (b.time || "")))
      .slice(0, 8);
  }, [records, today]);

  const openAdd = (date) => {
    setEditEvent(null);
    setSelected(date);
    setFormOpen(true);
  };
  const openEdit = (ev) => {
    setEditEvent(ev);
    setFormOpen(true);
  };

  return (
    <div className="space-y-5">
      <PullToRefresh onRefresh={reload} />
      <PageHeader
        title="Calendar"
        subtitle="Dates & schedule"
        right={
          <button
            onClick={() => openAdd(ymd(today))}
            className="h-11 px-4 rounded-2xl bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] flex items-center gap-2 text-sm font-semibold active:scale-[0.98] transition-transform"
          >
            <Plus className="w-4 h-4" /> Add
          </button>
        }
      />

      <section className="bg-card rounded-3xl p-4 border border-[hsl(var(--border))]">
        <div className="flex items-center justify-between mb-3">
          <button
            onClick={() => setView(new Date(view.getFullYear(), view.getMonth() - 1, 1))}
            className="w-11 h-11 rounded-full bg-muted flex items-center justify-center"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h2 className="font-heading text-lg">
            {MONTHS[view.getMonth()]} {view.getFullYear()}
          </h2>
          <button
            onClick={() => setView(new Date(view.getFullYear(), view.getMonth() + 1, 1))}
            className="w-11 h-11 rounded-full bg-muted flex items-center justify-center"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
        <div className="grid grid-cols-7 mb-1">
          {DOW.map((d, i) => (
            <div key={i} className="text-center text-[10px] font-semibold text-muted-foreground">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {grid.map((d, i) => {
            if (!d) return <div key={i} />;
            const k = ymd(d);
            const isToday = k === ymd(today);
            const isSelected = k === selected;
            const evs = byDate[k] || [];
            return (
              <button
                key={i}
                onClick={() => setSelected(k)}
                className={`aspect-square rounded-2xl flex flex-col items-center justify-center gap-1 border ${
                  isSelected
                    ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] border-transparent"
                    : isToday
                    ? "border-[hsl(var(--primary))] bg-muted"
                    : "border-transparent"
                }`}
              >
                <span className={`text-sm font-medium ${isSelected ? "" : "text-foreground"}`}>
                  {d.getDate()}
                </span>
                {evs.length > 0 && (
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      isSelected ? "bg-white" : "bg-[hsl(var(--primary))]"
                    }`}
                  />
                )}
              </button>
            );
          })}
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-heading text-lg">{longDate(selected)}</h2>
          <button
            onClick={() => openAdd(selected)}
            className="text-sm font-semibold text-[hsl(var(--primary))]"
          >
            + Add
          </button>
        </div>
        {selectedEvents.length === 0 ? (
          <div className="bg-card rounded-2xl p-5 border border-dashed border-[hsl(var(--border))] text-center text-sm text-muted-foreground">
            No events this day
          </div>
        ) : (
          <div className="space-y-2">
            {selectedEvents.map((ev) => (
              <button
                key={ev.id}
                onClick={() => openEdit(ev)}
                className="w-full text-left bg-card rounded-2xl p-4 border border-[hsl(var(--border))]"
              >
                <div className="flex items-center justify-between">
                  <p className="font-medium truncate">{ev.title}</p>
                  {ev.time && (
                    <span className="text-xs text-muted-foreground ml-2 shrink-0">{ev.time}</span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase bg-muted text-muted-foreground">
                    {ev.type || "Other"}
                  </span>
                  {ev.notes && (
                    <span className="text-xs text-muted-foreground truncate">{ev.notes}</span>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="font-heading text-lg mb-2">Upcoming</h2>
        {upcoming.length === 0 ? (
          <div className="bg-card rounded-2xl p-5 border border-dashed border-[hsl(var(--border))] text-center text-sm text-muted-foreground">
            Nothing scheduled
          </div>
        ) : (
          <div className="space-y-2">
            {upcoming.map((ev) => {
              const k = (ev.date || "").slice(0, 10);
              return (
                <button
                  key={ev.id}
                  onClick={() => {
                    if (k) {
                      setView(new Date(k + "T00:00:00"));
                      setSelected(k);
                    }
                  }}
                  className="w-full text-left bg-card rounded-2xl p-4 border border-[hsl(var(--border))] flex items-center gap-3"
                >
                  <div className="w-11 h-11 rounded-2xl bg-muted flex flex-col items-center justify-center shrink-0">
                    <span className="text-[9px] uppercase font-semibold text-muted-foreground leading-none">
                      {monthShort(k)}
                    </span>
                    <span className="font-heading text-lg leading-none text-foreground mt-0.5">
                      {dayNum(k)}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium truncate">{ev.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {ev.time ? ev.time : ev.type || "Event"}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>

      <ScheduleEventForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        date={selected}
        event={editEvent}
      />
    </div>
  );
}