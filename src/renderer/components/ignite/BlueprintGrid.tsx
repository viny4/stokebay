// The lab's blueprint grid behind the Ignite screen. On open it "powers up": the fine grid
// fades in, the coarse lines draw out from the centre and a scan line sweeps down once.
// With `animate` false it renders the finished grid at once (reduced motion, or the user
// skipped the intro by typing).
import { motion } from 'framer-motion';
import { memo } from 'react';

const COLUMNS = 12;
const ROWS = 8;
const LINE = 'rgb(56 189 248 / 0.22)';

export const BlueprintGrid = memo(function BlueprintGrid({ animate }: { animate: boolean }) {
  const columns = Array.from({ length: COLUMNS - 1 }, (_, i) => ((i + 1) / COLUMNS) * 100);
  const rows = Array.from({ length: ROWS - 1 }, (_, i) => ((i + 1) / ROWS) * 100);
  const centre = (COLUMNS - 2) / 2;

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <motion.div
        className="absolute inset-0"
        style={{
          backgroundImage: `linear-gradient(rgb(56 189 248 / 0.06) 1px, transparent 1px), linear-gradient(90deg, rgb(56 189 248 / 0.06) 1px, transparent 1px)`,
          backgroundSize: '24px 24px',
        }}
        initial={animate ? { opacity: 0 } : false}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.45, ease: 'easeOut' }}
      />

      {columns.map((left, i) => (
        <motion.div
          key={`c${i}`}
          className="absolute top-0 bottom-0 w-px origin-center"
          style={{ left: `${left}%`, background: LINE }}
          initial={animate ? { scaleY: 0, opacity: 0 } : false}
          animate={{ scaleY: 1, opacity: 1 }}
          // Lines nearest the centre draw first, so the grid spreads outwards.
          transition={{ duration: 0.4, delay: 0.08 + Math.abs(i - centre) * 0.03, ease: 'easeOut' }}
        />
      ))}
      {rows.map((top, i) => (
        <motion.div
          key={`r${i}`}
          className="absolute right-0 left-0 h-px origin-center"
          style={{ top: `${top}%`, background: LINE }}
          initial={animate ? { scaleX: 0, opacity: 0 } : false}
          animate={{ scaleX: 1, opacity: 1 }}
          transition={{ duration: 0.45, delay: 0.12 + i * 0.03, ease: 'easeOut' }}
        />
      ))}

      {/* Glow from the top and darker edges, like the HUD backdrop but brighter. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 60% 40% at 50% 0%, rgb(56 189 248 / 0.18), transparent 70%), radial-gradient(ellipse 110% 85% at 50% 50%, transparent 50%, rgb(0 0 0 / 0.6))',
        }}
      />

      {animate ? (
        <motion.div
          className="absolute top-0 right-0 left-0 h-[10vh]"
          style={{
            background:
              'linear-gradient(180deg, transparent, rgb(56 214 255 / 0.12) 85%, rgb(56 214 255 / 0.9) 99%, transparent)',
          }}
          initial={{ y: '-10vh', opacity: 0 }}
          animate={{ y: '100vh', opacity: [0, 1, 1, 0] }}
          transition={{ duration: 0.7, delay: 0.15, ease: 'easeInOut' }}
        />
      ) : null}
    </div>
  );
});
