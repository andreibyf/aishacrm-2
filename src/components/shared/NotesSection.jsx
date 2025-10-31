import { useCallback, useEffect, useState } from "react";
import { Note } from "@/api/entities";
import { User } from "@/api/entities";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Loader2,
  Plus,
  StickyNote,
  Trash2,
  User as UserIcon,
} from "lucide-react";
import { motion } from "framer-motion";
import { format } from "date-fns";

const noteTypes = [
  { value: "general", label: "General", color: "text-slate-400" },
  { value: "call_log", label: "Call Log", color: "text-blue-400" },
  { value: "meeting", label: "Meeting", color: "text-emerald-400" },
  { value: "email", label: "Email", color: "text-purple-400" },
  { value: "follow_up", label: "Follow-up", color: "text-yellow-400" },
  { value: "important", label: "Important", color: "text-red-400" },
];

const getTypeColor = (type) => {
  return noteTypes.find((t) => t.value === type)?.color || "text-slate-400";
};

export default function NotesSection({ relatedTo, relatedId, className = "" }) {
  const [notes, setNotes] = useState([]);
  const [loadingNotes, setLoadingNotes] = useState(true);
  const [currentUser, setCurrentUser] = useState(null);
  const [userLoading, setUserLoading] = useState(true);

  const [newNote, setNewNote] = useState({
    title: "",
    content: "",
    type: "general",
  });
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [loading, setLoading] = useState(false); // For the add note button

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    setUserLoading(true);
    try {
      const user = await User.me();
      setCurrentUser(user);

      if (!user.tenant_id) {
        console.warn(
          "User does not have a tenant_id assigned. Please contact your administrator.",
        );
      }
    } catch (error) {
      console.error("Error loading user:", error);
      setError("Failed to load user information.");
    } finally {
      setUserLoading(false);
    }
  };

  const loadNotes = useCallback(async () => {
    if (!currentUser?.tenant_id) return;
    setLoadingNotes(true);
    setError(null);
    try {
      const notesList = await Note.filter(
        { related_to: relatedTo, related_id: relatedId },
        "-created_date",
      );
      setNotes(notesList);
    } catch (error) {
      console.error("Error loading notes:", error);
      setError("Failed to load notes. Please try again.");
    } finally {
      setLoadingNotes(false);
    }
  }, [relatedTo, relatedId, currentUser?.tenant_id]);

  useEffect(() => {
    if (currentUser && currentUser.tenant_id) {
      loadNotes();
    }
  }, [relatedId, currentUser, loadNotes]);

  const handleAddNote = async () => {
    setError(null);
    setSuccess(null);

    if (!currentUser?.tenant_id) {
      setError(
        "Error: User information not loaded or tenant not assigned. Please contact your administrator.",
      );
      return;
    }

    if (!newNote.title.trim()) {
      setError("Please enter a title for the note.");
      return;
    }

    if (!newNote.content.trim()) {
      setError("Please enter content for the note.");
      return;
    }

    setLoading(true);
    try {
      const notePayload = {
        ...newNote,
        title: newNote.title.trim(),
        content: newNote.content.trim(),
        tenant_id: currentUser.tenant_id,
        related_to: relatedTo,
        related_id: relatedId,
        is_private: false, // Default value as the form doesn't support it
        tags: [], // Default value as the form doesn't support it
      };

      await Note.create(notePayload);
      setNewNote({ title: "", content: "", type: "general" });
      setSuccess("Note added successfully!");
      await loadNotes();
    } catch (error) {
      console.error("Error adding note:", error);
      setError(
        `Error adding note: ${
          error.message || "Please try again or contact support."
        }`,
      );
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteNote = async (noteId) => {
    if (confirm("Are you sure you want to delete this note?")) {
      setError(null);
      setSuccess(null);
      try {
        await Note.delete(noteId);
        setSuccess("Note deleted successfully!");
        await loadNotes();
      } catch (error) {
        console.error("Error deleting note:", error);
        setError("Error deleting note. Please try again.");
      }
    }
  };

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Add Note Form */}
      <div className="bg-slate-700/30 p-4 rounded-lg border border-slate-600">
        <div className="space-y-3">
          <Input
            placeholder="Note title..."
            value={newNote.title}
            onChange={(e) =>
              setNewNote((prev) => ({ ...prev, title: e.target.value }))}
            className="bg-slate-700 border-slate-600 text-slate-200 placeholder:text-slate-400 focus:border-slate-500"
          />
          <Textarea
            placeholder="Write your note here..."
            value={newNote.content}
            onChange={(e) =>
              setNewNote((prev) => ({ ...prev, content: e.target.value }))}
            rows={3}
            className="bg-slate-700 border-slate-600 text-slate-200 placeholder:text-slate-400 focus:border-slate-500"
          />
          <div className="flex justify-between items-center">
            <Select
              value={newNote.type}
              onValueChange={(value) =>
                setNewNote((prev) => ({ ...prev, type: value }))}
            >
              <SelectTrigger className="w-40 bg-slate-700 border-slate-600 text-slate-200">
                <SelectValue placeholder="Note type" />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-700">
                {noteTypes.map((type) => (
                  <SelectItem
                    key={type.value}
                    value={type.value}
                    className="text-slate-200 hover:bg-slate-700"
                  >
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              onClick={handleAddNote}
              disabled={!newNote.title.trim() || !newNote.content.trim() ||
                loading || !currentUser?.tenant_id}
              size="sm"
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {loading
                ? <Loader2 className="w-4 h-4 animate-spin mr-2" />
                : <Plus className="w-4 h-4 mr-2" />}
              Add Note
            </Button>
          </div>
        </div>
      </div>

      {/* Notes List */}
      {loadingNotes
        ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div
                key={i}
                className="bg-slate-700/30 rounded-lg p-4 border border-slate-600"
              >
                <div className="animate-pulse">
                  <div className="h-4 bg-slate-600 rounded w-1/3 mb-2"></div>
                  <div className="h-3 bg-slate-600 rounded w-full mb-1"></div>
                  <div className="h-3 bg-slate-600 rounded w-2/3"></div>
                </div>
              </div>
            ))}
          </div>
        )
        : notes.length > 0
        ? (
          <div className="space-y-3">
            {notes.map((note) => (
              <motion.div
                key={note.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-slate-700/30 rounded-lg p-4 border border-slate-600 hover:bg-slate-700/50 transition-colors"
              >
                <div className="flex justify-between items-start mb-2">
                  <h4 className="font-medium text-slate-200">{note.title}</h4>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant="outline"
                      className={`text-xs ${
                        getTypeColor(note.type)
                      } border-slate-600`}
                    >
                      {noteTypes.find((t) => t.value === note.type)?.label ||
                        note.type}
                    </Badge>
                    {!note.is_private && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteNote(note.id)}
                        className="h-6 w-6 p-0 text-slate-400 hover:text-red-400 hover:bg-red-900/20"
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    )}
                  </div>
                </div>
                <p className="text-sm text-slate-300 mb-2 whitespace-pre-wrap">
                  {note.content}
                </p>
                <div className="flex justify-between items-center text-xs text-slate-500">
                  <div className="flex items-center gap-1">
                    <UserIcon className="w-3 h-3" />
                    <span>
                      {note.created_by === currentUser?.email
                        ? "You"
                        : note.created_by}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    <span>
                      {format(
                        new Date(note.created_date),
                        "MMM d, yyyy h:mm a",
                      )}
                    </span>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )
        : (
          <div className="text-center py-8 bg-slate-700/30 rounded-lg border border-slate-600">
            <StickyNote className="w-8 h-8 mx-auto mb-2 text-slate-500" />
            <p className="text-slate-400">No notes yet</p>
            <p className="text-sm text-slate-500">Add your first note above</p>
          </div>
        )}

      {error && (
        <Alert
          variant="destructive"
          className="bg-red-900/20 border-red-700/50 text-red-300"
        >
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {success && (
        <Alert className="bg-green-900/20 border-green-700/50 text-green-300">
          <CheckCircle2 className="h-4 w-4" />
          <AlertDescription>{success}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
