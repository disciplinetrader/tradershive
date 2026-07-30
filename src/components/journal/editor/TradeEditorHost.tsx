/**
 * TradeEditorHost — mounted once in the journal layout.
 *
 * Listens to the global editor store and renders exactly one editor for the
 * requested trade. Because every surface calls `openTradeEditor()`, there is
 * only ever one editing implementation on screen.
 */
import { TradeEditorProvider } from "./TradeEditorProvider";
import { TradeEditorShell } from "./TradeEditorShell";
import { useTradeEditorRequest } from "./store";

export function TradeEditorHost() {
  const req = useTradeEditorRequest();
  if (!req) return null;
  return (
    <TradeEditorProvider key={req.entryId} entryId={req.entryId} initialSection={req.section}>
      <TradeEditorShell mode={req.mode} />
    </TradeEditorProvider>
  );
}
