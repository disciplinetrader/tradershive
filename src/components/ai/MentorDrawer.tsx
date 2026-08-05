import { useState, useEffect, useMemo } from "react";
import { useLocation, useParams } from "@tanstack/react-router";
import { motion, AnimatePresence } from "framer-motion";
import { X, Sparkles, Send, Maximize2, Minimize2, MessageSquare, LineChart, Brain } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CoachChat } from "./CoachChat";
import { AiAvatar } from "./AiAvatar";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export function MentorDrawer() {
  const location = useLocation();
  const params = useParams({ strict: false });
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [hasNewMessage, setHasNewMessage] = useState(false);

  // Derive context from route and params
  const context = useMemo(() => {
    const ctx: Record<string, any> = {
      path: location.pathname,
    };

    if (location.pathname.includes("/trading")) {
      ctx.page = "Trading Workspace";
      if (params.symbol) ctx.symbol = params.symbol;
    } else if (location.pathname.includes("/replay")) {
      ctx.page = "Replay Studio";
      if (params.sessionId) ctx.sessionId = params.sessionId;
    } else if (location.pathname.includes("/journal")) {
      ctx.page = "Journal X";
      if (params.tradeId) ctx.tradeId = params.tradeId;
    } else if (location.pathname.includes("/analytics")) {
      ctx.page = "Analytics";
    } else if (location.pathname.includes("/battle")) {
      ctx.page = "Battle Arena";
      if (params.battleId) ctx.battleId = params.battleId;
    } else if (location.pathname.includes("/championship")) {
      ctx.page = "Championship";
      if (params.id) ctx.championshipId = params.id;
    }

    return ctx;
  }, [location.pathname, params]);

  // Auto-suggest message after 30s of inactivity or on specific pages
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!isOpen) {
        setHasNewMessage(true);
      }
    }, 60000);
    return () => clearTimeout(timer);
  }, [isOpen]);

  return (
    <div className="fixed bottom-6 right-6 z-[100] flex flex-col items-end gap-4 pointer-events-none">
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ 
              opacity: 1, 
              scale: 1, 
              y: 0,
              width: isExpanded ? "800px" : "400px",
              height: isExpanded ? "80vh" : "600px"
            }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className={cn(
              "pointer-events-auto overflow-hidden rounded-2xl border border-border/60 bg-background/95 shadow-2xl backdrop-blur-xl flex flex-col transition-all duration-300",
              isExpanded && "max-w-[calc(100vw-48px)]"
            )}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border/60 px-4 py-3 bg-muted/20">
              <div className="flex items-center gap-3">
                <AiAvatar size={32} active />
                <div>
                  <h3 className="text-sm font-bold">AI Trading Mentor</h3>
                  <div className="flex items-center gap-1.5">
                    <span className="relative flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                    </span>
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Active</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-8 w-8 rounded-lg"
                  onClick={() => setIsExpanded(!isExpanded)}
                >
                  {isExpanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                </Button>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-8 w-8 rounded-lg"
                  onClick={() => setIsOpen(false)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Context Badge */}
            <div className="bg-primary/5 px-4 py-1.5 border-b border-border/40 flex items-center justify-between">
              <span className="text-[10px] font-medium text-primary uppercase tracking-wider flex items-center gap-1.5">
                <Brain className="h-3 w-3" />
                Context: {context.page || "Global"}
              </span>
              {context.page && (
                <span className="text-[10px] text-muted-foreground italic">
                  AI is page-aware
                </span>
              )}
            </div>

            {/* Chat Area */}
            <div className="flex-1 overflow-hidden">
              <CoachChat metadata={context} />
            </div>

            {/* Quick Tools / Stats */}
            {!isExpanded && (
              <div className="border-t border-border/60 bg-muted/10 p-2 flex gap-2 overflow-x-auto no-scrollbar">
                <TooltipProvider>
                  <QuickTool icon={Brain} label="Analyze Psychology" />
                  <QuickTool icon={LineChart} label="Review Last Trade" />
                  <QuickTool icon={MessageSquare} label="Journal Help" />
                </TooltipProvider>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating Action Button */}
      <div className="pointer-events-auto">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => {
                  setIsOpen(!isOpen);
                  setHasNewMessage(false);
                }}
                className={cn(
                  "group relative flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:scale-105 active:scale-95",
                  isOpen && "bg-muted text-muted-foreground shadow-none"
                )}
              >
                {isOpen ? (
                  <X className="h-6 w-6" />
                ) : (
                  <>
                    <Sparkles className="h-6 w-6" />
                    {hasNewMessage && (
                      <span className="absolute -right-1 -top-1 flex h-4 w-4">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                        <span className="relative inline-flex h-4 w-4 rounded-full bg-emerald-500 border-2 border-background" />
                      </span>
                    )}
                  </>
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent side="left" sideOffset={16}>
              {isOpen ? "Close Mentor" : "Talk to Mentor"}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </div>
  );
}

function QuickTool({ icon: Icon, label }: { icon: any, label: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 rounded-full text-[10px] px-3 gap-1.5 whitespace-nowrap border-border/40 hover:bg-primary/5 hover:border-primary/20">
          <Icon className="h-3 w-3" />
          {label}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}
