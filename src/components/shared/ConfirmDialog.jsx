/* eslint-disable react-refresh/only-export-components */
import React from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { AlertTriangle } from 'lucide-react';

/**
 * Reusable confirmation dialog component
 * 
 * Usage:
 * const [confirmDialog, setConfirmDialog] = useState(null);
 * 
 * <ConfirmDialog
 *   open={confirmDialog !== null}
 *   onConfirm={() => { confirmDialog?.onConfirm(); setConfirmDialog(null); }}
 *   onCancel={() => setConfirmDialog(null)}
 *   title={confirmDialog?.title}
 *   description={confirmDialog?.description}
 *   variant={confirmDialog?.variant}
 * />
 * 
 * // To show dialog:
 * setConfirmDialog({
 *   title: "Delete Item?",
 *   description: "This action cannot be undone.",
 *   variant: "destructive",
 *   onConfirm: () => { // perform action }
 * });
 */
export default function ConfirmDialog({
  open,
  onConfirm,
  onCancel,
  title = "Are you sure?",
  description = "This action cannot be undone.",
  variant = "default", // "default" | "destructive"
  confirmText = "Confirm",
  cancelText = "Cancel"
}) {
  return (
    <AlertDialog open={open} onOpenChange={(isOpen) => !isOpen && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            {variant === "destructive" && (
              <AlertTriangle className="h-5 w-5 text-destructive" />
            )}
            {title}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {description}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>
            {cancelText}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className={variant === "destructive" ? "bg-destructive hover:bg-destructive/90" : ""}
          >
            {confirmText}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * Hook for easier confirmation dialog management
 * 
 * Usage:
 * const { ConfirmDialog, confirm } = useConfirmDialog();
 * 
 * const handleDelete = async () => {
 *   const confirmed = await confirm({
 *     title: "Delete Item?",
 *     description: "This action cannot be undone.",
 *     variant: "destructive"
 *   });
 *   
 *   if (confirmed) {
 *     // perform delete
 *   }
 * };
 * 
 * return (
 *   <>
 *     <ConfirmDialog />
 *     <Button onClick={handleDelete}>Delete</Button>
 *   </>
 * );
 */
export function useConfirmDialog() {
  const [dialogState, setDialogState] = React.useState(null);

  const confirm = React.useCallback((options) => {
    return new Promise((resolve) => {
      setDialogState({
        ...options,
        onConfirm: () => {
          setDialogState(null);
          resolve(true);
        },
        onCancel: () => {
          setDialogState(null);
          resolve(false);
        }
      });
    });
  }, []);

  const ConfirmDialogComponent = React.useCallback(() => {
    if (!dialogState) return null;

    return (
      <ConfirmDialog
        open={true}
        onConfirm={dialogState.onConfirm}
        onCancel={dialogState.onCancel}
        title={dialogState.title}
        description={dialogState.description}
        variant={dialogState.variant}
        confirmText={dialogState.confirmText}
        cancelText={dialogState.cancelText}
      />
    );
  }, [dialogState]);

  return { ConfirmDialog: ConfirmDialogComponent, confirm };
}
