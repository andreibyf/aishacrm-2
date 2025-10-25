/**
 * NOTES - CommandPaletteWidget (Wrapper)
 * Formerly a wrapper around CommandPalette; now wraps the persistent ChatWindow
 * so any legacy usage still brings up the new chat experience.
 */
import ChatWindow from "./ChatWindow";

export default function CommandPaletteWidget() {
  return <ChatWindow />;
}