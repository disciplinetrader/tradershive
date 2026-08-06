import { useState, useEffect, useRef } from "react";
import { 
  Play, 
  Pause, 
  SkipBack, 
  SkipForward, 
  Volume2, 
  VolumeX, 
  Maximize2, 
  Minimize2,
  Music,
  Headphones,
  Zap,
  Leaf,
  Target,
  ChevronUp,
  ChevronDown
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

type Mood = "Focus" | "Calm" | "Momentum" | "Deep Work";

interface Track {
  id: string;
  title: string;
  artist: string;
  url: string;
  mood: Mood;
}

const TRACKS: Track[] = [
  {
    id: "focus-1",
    title: "Focus Pulse",
    artist: "TradersHIVE Original",
    url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
    mood: "Focus"
  },
  {
    id: "calm-1",
    title: "Midnight Market",
    artist: "TradersHIVE Original",
    url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3",
    mood: "Calm"
  },
  {
    id: "momentum-1",
    title: "Bull Run",
    artist: "TradersHIVE Original",
    url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3",
    mood: "Momentum"
  },
  {
    id: "deep-work-1",
    title: "The Zone",
    artist: "TradersHIVE Original",
    url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-10.mp3",
    mood: "Deep Work"
  }


];

const STORAGE_KEY = "th_music_settings";

export function MusicPlayer({ embedded = false }: { embedded?: boolean }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTrackIndex, setCurrentTrackIndex] = useState(0);
  const [volume, setVolume] = useState(50);
  const [isMuted, setIsMuted] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(true);
  const [progress, setProgress] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const currentTrack = TRACKS[currentTrackIndex];

  // Load preferences
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const { volume: v, isMuted: m } = JSON.parse(saved);
        setVolume(v);
        setIsMuted(m);
      } catch (e) {
        console.error("Failed to load music preferences", e);
      }
    }
  }, []);

  // Save preferences
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ volume, isMuted }));
  }, [volume, isMuted]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume / 100;
    }
  }, [volume, isMuted]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => {
      if (audio.duration) {
        setProgress((audio.currentTime / audio.duration) * 100);
      }
    };

    const handleEnded = () => {
      handleNext();
    };

    const handleLoadStart = () => setIsLoading(true);
    const handleCanPlay = () => setIsLoading(false);
    const handleError = () => {
      setIsLoading(false);
      setHasError(true);
      setIsPlaying(false);
    };

    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("loadstart", handleLoadStart);
    audio.addEventListener("canplay", handleCanPlay);
    audio.addEventListener("error", handleError);

    return () => {
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("loadstart", handleLoadStart);
      audio.removeEventListener("canplay", handleCanPlay);
      audio.removeEventListener("error", handleError);
    };
  }, [currentTrackIndex]);

  const togglePlay = () => {
    if (hasError) return;
    if (isPlaying) {
      audioRef.current?.pause();
    } else {
      audioRef.current?.play().catch((e) => {
        console.warn("Autoplay blocked or audio error:", e);
        setHasError(true);
      });
    }
    setIsPlaying(!isPlaying);
  };

  const handleNext = () => {
    setCurrentTrackIndex((prev) => (prev + 1) % TRACKS.length);
    setIsPlaying(true);
    setHasError(false);
  };

  const handlePrev = () => {
    setCurrentTrackIndex((prev) => (prev - 1 + TRACKS.length) % TRACKS.length);
    setIsPlaying(true);
    setHasError(false);
  };

  const handleMoodSelect = (mood: Mood) => {
    const index = TRACKS.findIndex((t) => t.mood === mood);
    if (index !== -1) {
      setCurrentTrackIndex(index);
      setIsPlaying(true);
      setHasError(false);
    }
  };

  const moodIcons: Record<Mood, any> = {
    Focus: Target,
    Calm: Leaf,
    Momentum: Zap,
    "Deep Work": Headphones
  };

  return (
    <div className={cn(
      embedded ? "w-full" : "relative z-[100] transition-all duration-300",
      !embedded && (isCollapsed ? "w-full flex justify-center" : "w-full bg-background/95 border border-border/60 rounded-2xl shadow-2xl backdrop-blur-xl p-4")
    )}>
      <audio
        ref={audioRef}
        src={currentTrack.url}
        preload="auto"
      />

      {isCollapsed && !embedded ? (
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsCollapsed(false)}
          className="w-10 h-10 rounded-xl text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-all"
          aria-label="Expand music player"
        >
          {isPlaying ? (
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 4, ease: "linear" }}
            >
              <Music className="h-5 w-5 text-primary" />
            </motion.div>
          ) : (
            <Music className="h-5 w-5 text-muted-foreground" />
          )}
        </Button>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="bg-primary/10 p-2 rounded-lg">
                <Music className="h-4 w-4 text-primary" />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-bold truncate leading-tight">
                  {currentTrack.title}
                </span>
                <span className="text-[10px] text-muted-foreground truncate">
                  {currentTrack.artist}
                </span>
              </div>
            </div>
            {!embedded && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 rounded-md hover:bg-muted"
                onClick={() => setIsCollapsed(true)}
                aria-label="Collapse music player"
              >
                <ChevronDown className="h-4 w-4" />
              </Button>
            )}
          </div>

          <div className="space-y-1">
            <div className="h-1 bg-muted rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-primary"
                initial={false}
                animate={{ width: `${progress}%` }}
              />
            </div>
            {hasError && (
              <span className="text-[9px] text-danger font-medium">
                Audio load failed. Try another track.
              </span>
            )}
          </div>

          <div className="flex items-center justify-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-full"
              onClick={handlePrev}
              aria-label="Previous track"
            >
              <SkipBack className="h-4 w-4" />
            </Button>
            <Button
              variant="default"
              size="icon"
              className="h-10 w-10 rounded-full shadow-lg"
              onClick={togglePlay}
              disabled={isLoading}
              aria-label={isPlaying ? "Pause" : "Play"}
            >
              {isLoading ? (
                <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : isPlaying ? (
                <Pause className="h-5 w-5" />
              ) : (
                <Play className="h-5 w-5 ml-0.5" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-full"
              onClick={handleNext}
              aria-label="Next track"
            >
              <SkipForward className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex items-center gap-3 px-1">
            <button
              onClick={() => setIsMuted(!isMuted)}
              className="text-muted-foreground hover:text-foreground transition-colors"
              aria-label={isMuted ? "Unmute" : "Mute"}
            >
              {isMuted || volume === 0 ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </button>
            <Slider
              value={[isMuted ? 0 : volume]}
              max={100}
              step={1}
              onValueChange={(vals) => {
                setVolume(vals[0]);
                if (vals[0] > 0) setIsMuted(false);
              }}
              className="flex-1"
            />
          </div>

          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border/40">
            {(["Focus", "Calm", "Momentum", "Deep Work"] as Mood[]).map((mood) => {
              const Icon = moodIcons[mood];
              const isActive = currentTrack.mood === mood;
              return (
                <button
                  key={mood}
                  onClick={() => handleMoodSelect(mood)}
                  className={cn(
                    "flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[10px] font-semibold transition-all",
                    isActive 
                      ? "bg-primary/15 text-primary border border-primary/20" 
                      : "bg-muted/30 text-muted-foreground hover:bg-muted/50 hover:text-foreground border border-transparent"
                  )}
                >
                  <Icon className={cn("h-3 w-3", isActive ? "text-primary" : "text-muted-foreground")} />
                  {mood}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
