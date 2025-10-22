import React, { useEffect } from "react";

export default function SimpleModal({
  open,
  onOpenChange,
  title,
  children,
  size = 'md',
  showCloseButton = true
}) {
  // Debug logging
  useEffect(() => {
    console.log('[SimpleModal] Props changed:', { open, title, size, hasChildren: !!children });
    if (open) {
      console.log('[SimpleModal] Modal SHOULD BE VISIBLE NOW');
      document.body.style.overflow = 'hidden';
    } else {
      console.log('[SimpleModal] Modal hidden');
      document.body.style.overflow = '';
    }
    
    return () => {
      document.body.style.overflow = '';
    };
  }, [open, title, size, children]);

  // ESC to close
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") {
        console.log('[SimpleModal] ESC pressed, closing modal');
        onOpenChange?.(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  // Don't render if not open
  if (!open) {
    console.log('[SimpleModal] Returning null - modal not open');
    return null;
  }

  const sizeClasses = {
    sm: 'max-w-md',
    md: 'max-w-2xl',
    lg: 'max-w-4xl',
    xl: 'max-w-6xl',
    full: 'max-w-[95vw]'
  };

  const sizeClass = Object.prototype.hasOwnProperty.call(sizeClasses, size) ? sizeClasses[size] : sizeClasses.md;

  console.log('[SimpleModal] RENDERING MODAL NOW:', { title, size, sizeClass });

  return (
    <div
      data-modal-overlay
      className="fixed inset-0 flex items-center justify-center p-4"
      style={{ 
        zIndex: 2147483000,
        backgroundColor: 'rgba(0, 0, 0, 0.5)'
      }}
    >
      {/* Background overlay that closes the modal on click */}
      <div
        data-modal-backdrop
        className="fixed inset-0"
        style={{ 
          backgroundColor: 'rgba(0, 0, 0, 0.3)',
          zIndex: 2147483000
        }}
        onClick={() => {
          console.log('[SimpleModal] Background clicked, closing modal');
          onOpenChange?.(false);
        }}
      />
      
      {/* Modal content container */}
      <div
        data-modal-content
        className={`relative bg-slate-800 border border-slate-700 text-slate-200 rounded-xl shadow-2xl w-full ${sizeClass} max-h-[80vh] overflow-y-auto`}
        style={{ zIndex: 2147483001 }}
        onClick={(e) => {
          console.log('[SimpleModal] Content clicked - stopping propagation');
          e.stopPropagation();
        }}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700 sticky top-0 bg-slate-800 z-10">
          <h2 className="text-lg font-semibold text-slate-100">{title}</h2>
          {showCloseButton && (
            <button
              aria-label="Close"
              className="text-slate-400 hover:text-slate-200 text-2xl leading-none"
              onClick={() => {
                console.log('[SimpleModal] Close button clicked');
                onOpenChange?.(false);
              }}
            >
              ×
            </button>
          )}
        </div>
        <div className="p-4">
          {console.log('[SimpleModal] Rendering children:', !!children)}
          {children}
        </div>
      </div>
    </div>
  );
}