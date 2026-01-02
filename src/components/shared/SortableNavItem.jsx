import React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Link } from "react-router-dom";
import { GripVertical } from "lucide-react";
import { useLoadingToast } from "@/hooks/useLoadingToast";

/**
 * SortableNavItem - A draggable navigation item using @dnd-kit
 * 
 * @param {Object} props
 * @param {Object} props.item - Navigation item with href, icon, label
 * @param {boolean} props.isActive - Whether this item is currently active
 * @param {Function} props.createPageUrl - Function to create the URL for the page
 * @param {Function} props.onNavClick - Callback when nav item is clicked
 * @param {boolean} props.isDragMode - Whether drag mode is enabled (shows grip handles)
 */
export function SortableNavItem({
  item,
  isActive,
  createPageUrl,
  onNavClick,
  isDragMode = false,
}) {
  const loadingToast = useLoadingToast();

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.href });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 1000 : 1,
  };

  const Icon = item.icon;

  // Handle navigation click - show loading toast for Dashboard
  const handleClick = (e) => {
    if (item.href === 'Dashboard') {
      loadingToast.showLoading();
    }
    if (onNavClick) {
      onNavClick(e);
    }
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`${isDragging ? "bg-slate-700 rounded-lg shadow-lg" : ""}`}
    >
      <div className="flex items-center">
        {/* Drag handle - only visible in drag mode */}
        {isDragMode && (
          <button
            type="button"
            className="p-1 mr-1 text-slate-500 hover:text-slate-300 cursor-grab active:cursor-grabbing focus:outline-none"
            {...attributes}
            {...listeners}
            aria-label={`Drag to reorder ${item.label}`}
          >
            <GripVertical className="w-4 h-4" />
          </button>
        )}

        <Link
          to={createPageUrl(item.href)}
          data-testid={`nav-${item.href.toLowerCase()}`}
          className={`flex-1 flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-base font-medium ${
            isActive
              ? "shadow-lg nav-active"
              : "text-slate-400 hover:bg-slate-800 hover:text-slate-300"
          }`}
          onClick={handleClick}
          style={
            isActive
              ? {
                  backgroundColor: "var(--primary-color)",
                  color: "var(--on-primary-text)",
                }
              : {}
          }
        >
          <Icon
            className={`w-5 h-5 ${isActive ? "" : "text-slate-400"}`}
            style={
              isActive
                ? {
                    color: "var(--on-primary-text)",
                  }
                : {}
            }
          />
          <span className="text-lg">{item.label}</span>
        </Link>
      </div>
    </li>
  );
}

export default SortableNavItem;
