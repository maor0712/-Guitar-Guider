/** Dots for each beat of the bar; the current one lights up, beat 1 is accented. */
export function BeatCounter({ meter, beat, active }: { meter: number; beat: number; active: boolean }) {
  return (
    <div className="flex items-center justify-center gap-3" dir="ltr">
      {Array.from({ length: meter }, (_, i) => {
        const on = active && beat === i + 1
        return (
          <div key={i}
            className={`flex size-10 items-center justify-center rounded-full text-lg font-bold transition-all duration-75 ${
              on ? (i === 0 ? 'scale-110 bg-accent text-bg' : 'scale-105 bg-ink text-bg') : 'bg-surface-2 text-muted'
            }`}>
            {i + 1}
          </div>
        )
      })}
    </div>
  )
}
