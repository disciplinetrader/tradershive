import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";
import { Swords } from "lucide-react";

export function BattleStartIntro({ onComplete }: { onComplete: () => void }) {
  const [count, setCount] = useState(3);
  const [show, setShow] = useState(true);

  useEffect(() => {
    if (count > 0) {
      const t = setTimeout(() => setCount(count - 1), 1000);
      return () => clearTimeout(t);
    } else {
      const t = setTimeout(() => {
        setShow(false);
        setTimeout(onComplete, 500);
      }, 1000);
      return () => clearTimeout(t);
    }
  }, [count, onComplete]);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-background/95 backdrop-blur-xl"
          onClick={onComplete}
        >
          <div className="absolute inset-0 overflow-hidden opacity-20">
            <div className="absolute -top-1/2 left-1/2 h-[1000px] w-[1000px] -translate-x-1/2 rounded-full bg-primary/30 blur-[120px] animate-pulse" />
          </div>

          <div className="relative flex flex-col items-center gap-8">
            <motion.div
              initial={{ scale: 0.8, rotate: -10 }}
              animate={{ scale: 1, rotate: 0 }}
              className="flex h-24 w-24 items-center justify-center rounded-[32px] bg-primary/10 text-primary shadow-2xl shadow-primary/20 ring-1 ring-primary/20"
            >
              <Swords className="h-12 w-12" />
            </motion.div>

            <div className="text-center">
              <motion.h2
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-sm font-black uppercase tracking-[0.3em] text-muted-foreground"
              >
                Prepare to Trade
              </motion.h2>
              <div className="mt-2 h-24">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={count}
                    initial={{ scale: 0.5, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 1.5, opacity: 0 }}
                    transition={{ duration: 0.5 }}
                    className="text-8xl font-black italic tracking-tighter text-foreground"
                  >
                    {count > 0 ? count : "GO!"}
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>

            <p className="mt-12 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/40">
              Click to skip
            </p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
