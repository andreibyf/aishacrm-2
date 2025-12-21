import { useCallback, useEffect, useState } from "react";
import { Account } from "@/api/entities";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { formatIndustry } from "@/utils/industryUtils";
import {
  AlertTriangle,
  ArrowDownCircle,
  Building2,
  Eye,
  Loader2,
  Mail,
  Phone,
  Trash2,
} from "lucide-react";
import { useTenant } from "../components/shared/tenantContext";
import { findDuplicates } from "@/api/functions";
import { consolidateDuplicateAccounts } from "@/api/functions";
import AccountDetailPanel from "../components/accounts/AccountDetailPanel";
import OperationOverlay from "../components/shared/OperationOverlay";
import { useToast } from "@/components/ui/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useUser } from "../components/shared/useUser.js";

export default function DuplicateAccounts() {
  const [loading, setLoading] = useState(true);
  const [duplicateGroups, setDuplicateGroups] = useState([]);
  const { user: currentUser } = useUser();
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [selectedForDeletion, setSelectedForDeletion] = useState(new Set());
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [operationProgress, setOperationProgress] = useState({
    show: false,
    current: 0,
    total: 0,
  });
  const { selectedTenantId } = useTenant();
  const { toast } = useToast();

  const [consolidating, setConsolidating] = useState(false);
  const [, setConsolidateTarget] = useState(null);

  const loadDuplicates = useCallback(async () => {
    if (!currentUser) return;

    setLoading(true);
    try {
      const response = await findDuplicates({
        entity_type: "Account",
        tenant_id: selectedTenantId || currentUser?.tenant_id,
      });

      if (response?.data?.success) {
        const groups = Array.isArray(response.data.groups)
          ? response.data.groups
          : [];
        setDuplicateGroups(groups);
      } else {
        setDuplicateGroups([]);
      }
    } catch (error) {
      console.error("Failed to load duplicates:", error);
      toast({
        title: "Error",
        description: "Failed to load duplicate accounts",
        variant: "destructive",
      });
      setDuplicateGroups([]);
    } finally {
      setLoading(false);
    }
  }, [currentUser, selectedTenantId, toast]);

  useEffect(() => {
    if (currentUser) {
      loadDuplicates();
    }
  }, [currentUser, loadDuplicates]);

  const handleDelete = async (account) => {
    setDeleting(true);
    try {
      await Account.delete(account.id);
      toast({
        title: "Success",
        description: "Account deleted successfully",
      });
      setDeleteTarget(null);
      await loadDuplicates();
    } catch (error) {
      console.error("Failed to delete account:", error);
      toast({
        title: "Error",
        description: "Failed to delete account",
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
    }
  };

  const handleBulkDelete = async () => {
    setShowBulkDeleteConfirm(false);
    setDeleting(true);

    const accountIds = Array.from(selectedForDeletion);
    const totalCount = accountIds.length;

    setOperationProgress({
      show: true,
      current: 0,
      total: totalCount,
    });

    try {
      let successCount = 0;
      let failCount = 0;

      // Delete accounts one by one with progress tracking
      for (let i = 0; i < accountIds.length; i++) {
        try {
          await Account.delete(accountIds[i]);
          successCount++;
          setOperationProgress((prev) => ({ ...prev, current: i + 1 }));
        } catch (error) {
          console.error(`Failed to delete account ${accountIds[i]}:`, error);
          failCount++;
        }
      }

      if (successCount > 0) {
        toast({
          title: "Success",
          description: `Successfully deleted ${successCount} account(s)${failCount > 0 ? `, ${failCount} failed` : ''}`,
        });
      } else {
        toast({
          title: "Error",
          description: `Failed to delete accounts`,
          variant: "destructive",
        });
      }

      setSelectedForDeletion(new Set());
      await loadDuplicates();
    } catch (error) {
      console.error("Failed to delete accounts:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to delete some accounts",
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
      setOperationProgress({ show: false, current: 0, total: 0 });
    }
  };

  const handleConsolidateGroup = async (records, masterAccountId = null) => {
    if (!records || records.length < 2) {
      toast({
        title: "Error",
        description: "Need at least 2 accounts to consolidate",
        variant: "destructive",
      });
      return;
    }

    const accountIds = records.map((r) => r?.id).filter(Boolean);

    if (
      !confirm(
        `Consolidate ${accountIds.length} accounts into one master record?\n\nThis will:\n• Merge all data into the oldest account\n• Re-link all contacts, opportunities, and activities\n• Delete duplicate records\n\nThis cannot be undone.`,
      )
    ) {
      return;
    }

    setConsolidating(true);
    setOperationProgress({
      show: true,
      current: 0,
      total: accountIds.length,
    });

    try {
      const response = await consolidateDuplicateAccounts({
        accountIds,
        masterAccountId,
      });

      if (response.data?.success) {
        toast({
          title: "Success",
          description: response.data.message,
          duration: 5000,
        });

        // Clear any selections for deleted accounts
        const deletedIds = new Set(response.data.deleted_account_ids || []);
        setSelectedForDeletion((prev) => {
          const newSet = new Set(prev);
          deletedIds.forEach((id) => newSet.delete(id));
          return newSet;
        });

        await loadDuplicates();
      } else {
        throw new Error(response.data?.error || "Consolidation failed");
      }
    } catch (error) {
      console.error("Failed to consolidate accounts:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to consolidate accounts",
        variant: "destructive",
        duration: 5000,
      });
    } finally {
      setConsolidating(false);
      setOperationProgress({ show: false, current: 0, total: 0 });
      setConsolidateTarget(null);
    }
  };

  const toggleSelection = (accountId) => {
    if (!accountId) return; // Don't add invalid IDs

    const newSelection = new Set(selectedForDeletion);
    if (newSelection.has(accountId)) {
      newSelection.delete(accountId);
    } else {
      newSelection.add(accountId);
    }
    setSelectedForDeletion(newSelection);
  };

  const toggleGroupSelection = (records) => {
    // Filter out any invalid records/IDs
    const accountIds = records
      .map((r) => r?.id)
      .filter((id) => id && typeof id === "string"); // Only valid string IDs

    if (accountIds.length === 0) return;

    const newSelection = new Set(selectedForDeletion);

    // Check if all valid accounts in this group are selected
    const allSelected = accountIds.every((id) => newSelection.has(id));

    if (allSelected) {
      // Deselect all
      accountIds.forEach((id) => newSelection.delete(id));
    } else {
      // Select all
      accountIds.forEach((id) => newSelection.add(id));
    }

    setSelectedForDeletion(newSelection);
  };

  const getGroupSelectionState = (records) => {
    // Filter out any invalid records/IDs
    const accountIds = records
      .map((r) => r?.id)
      .filter((id) => id && typeof id === "string");

    if (accountIds.length === 0) return "none";

    const selectedCount =
      accountIds.filter((id) => selectedForDeletion.has(id)).length;

    if (selectedCount === 0) return "none";
    if (selectedCount === accountIds.length) return "all";
    return "some";
  };

  const handleView = async (account) => {
    if (!account?.id) {
      toast({
        title: "Error",
        description: "Invalid account selected",
        variant: "destructive",
      });
      return;
    }

    try {
      const fullAccount = await Account.get(account.id);
      setSelectedAccount(fullAccount);
    } catch (error) {
      console.error("Failed to fetch account details:", error);
      toast({
        title: "Error",
        description: "Failed to load account details: " +
          (error.message || "Unknown error"),
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-900">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-blue-400 mx-auto mb-4" />
          <p className="text-slate-400">Scanning for duplicate accounts...</p>
        </div>
      </div>
    );
  }

  const validGroups = Array.isArray(duplicateGroups) ? duplicateGroups : [];

  return (
    <div className="min-h-screen bg-slate-900 p-4 lg:p-8 space-y-4 lg:space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-slate-100 flex items-center gap-3">
            <Building2 className="w-8 h-8 text-green-400" />
            Review Duplicate Accounts
          </h1>
          <p className="text-slate-400 mt-2">
            Found {validGroups.length} potential duplicate group(s)
          </p>
        </div>
        <div className="flex gap-2">
          {selectedForDeletion.size > 0 && (
            <Button
              onClick={() => setShowBulkDeleteConfirm(true)}
              variant="destructive"
              className="bg-red-600 hover:bg-red-700"
              disabled={deleting || consolidating}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete Selected ({selectedForDeletion.size})
            </Button>
          )}
          <Button
            onClick={loadDuplicates}
            variant="outline"
            className="bg-slate-800 border-slate-700 text-slate-200"
            disabled={deleting || consolidating}
          >
            Refresh
          </Button>
        </div>
      </div>

      <Card className="bg-blue-900/30 border-blue-700/50">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-blue-400 mt-0.5" />
            <div className="text-sm text-blue-300">
              <p className="font-semibold mb-1">How duplicates are detected:</p>
              <ul className="list-disc list-inside space-y-1 text-blue-200">
                <li>Similar company names</li>
                <li>Matching addresses</li>
                <li>Same legacy ID from imported data</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      {validGroups.length === 0
        ? (
          <Card className="bg-slate-800 border-slate-700">
            <CardContent className="p-12 text-center">
              <Building2 className="w-16 h-16 text-slate-600 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-slate-300 mb-2">
                No Duplicates Found
              </h3>
              <p className="text-slate-400">Your account records look clean!</p>
            </CardContent>
          </Card>
        )
        : (
          <div className="space-y-6">
            {validGroups.map((group, groupIndex) => {
              let records = [];
              let reasons = [];

              if (Array.isArray(group?.records)) {
                records = group.records;
              } else if (Array.isArray(group?.items)) {
                records = group.items;
              } else if (Array.isArray(group?.accounts)) {
                records = group.accounts;
              } else if (group && typeof group === "object") {
                records = [group];
              }

              if (Array.isArray(group?.reasons)) {
                reasons = group.reasons;
              } else if (group?.reason) {
                reasons = [group.reason];
              } else if (group?.match_type) {
                reasons = [group.match_type];
              }

              const selectionState = getGroupSelectionState(records);

              return (
                <Card
                  key={groupIndex}
                  className="bg-slate-800 border-slate-700"
                >
                  <CardHeader className="border-b border-slate-700">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-slate-100 flex items-center gap-2">
                        <AlertTriangle className="w-5 h-5 text-yellow-400" />
                        Duplicate Group {groupIndex + 1}
                        <Badge
                          variant="outline"
                          className="ml-2 bg-yellow-900/30 text-yellow-300 border-yellow-700/50"
                        >
                          {records.length} records
                        </Badge>
                      </CardTitle>

                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleConsolidateGroup(records)}
                          disabled={consolidating || records.length < 2 ||
                            deleting}
                          className="bg-blue-600 hover:bg-blue-700 text-white border-blue-500"
                        >
                          <ArrowDownCircle className="w-4 h-4 mr-2" />
                          Consolidate Group
                        </Button>

                        <span className="text-sm text-slate-400">
                          Select All
                        </span>
                        <Checkbox
                          checked={selectionState === "all"}
                          indeterminate={selectionState === "some"}
                          onCheckedChange={() => toggleGroupSelection(records)}
                          className="bg-slate-600 border-slate-500 data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
                        />
                      </div>
                    </div>
                    {reasons.length > 0 && (
                      <p className="text-sm text-slate-400 mt-1">
                        Match reasons: {reasons.join(", ")}
                      </p>
                    )}
                  </CardHeader>
                  <CardContent className="p-6">
                    {records.length === 0
                      ? (
                        <div className="text-center py-8 text-slate-500">
                          <AlertTriangle className="w-12 h-12 mx-auto mb-3 opacity-50" />
                          <p>No records found in this group</p>
                        </div>
                      )
                      : (
                        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                          {records.map((account, idx) => (
                            <Card
                              key={account?.id || idx}
                              className="bg-slate-700/50 border-slate-600 relative"
                            >
                              <div className="absolute top-3 right-3 z-10">
                                <Checkbox
                                  checked={selectedForDeletion.has(account?.id)}
                                  onCheckedChange={() =>
                                    toggleSelection(account?.id)}
                                  className="bg-slate-600 border-slate-500 data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
                                  disabled={deleting || consolidating}
                                />
                              </div>

                              <CardHeader className="pb-3">
                                <CardTitle className="text-base text-slate-100 flex items-center gap-2 pr-8">
                                  <Building2 className="w-4 h-4 text-green-400" />
                                  {account?.name || "Unknown Account"}
                                </CardTitle>
                              </CardHeader>
                              <CardContent className="space-y-2">
                                {account?.email && (
                                  <div className="flex items-center gap-2 text-sm text-slate-300">
                                    <Mail className="w-4 h-4 text-slate-400 flex-shrink-0" />
                                    <a
                                      href={`mailto:${account.email}`}
                                      className="text-blue-400 hover:underline truncate"
                                    >
                                      {account.email}
                                    </a>
                                  </div>
                                )}

                                {account?.phone && (
                                  <div className="flex items-center gap-2 text-sm text-slate-300">
                                    <Phone className="w-4 h-4 text-slate-400 flex-shrink-0" />
                                    <a
                                      href={`tel:${account.phone}`}
                                      className="text-blue-400 hover:underline"
                                    >
                                      {account.phone}
                                    </a>
                                  </div>
                                )}

                                {account?.industry && (
                                  <p className="text-sm text-slate-300">
                                    <span className="font-medium">
                                      Industry:
                                    </span>{" "}
                                    {formatIndustry(account.industry)}
                                  </p>
                                )}
                                {account?.website && (
                                  <p className="text-sm text-slate-300">
                                    <span className="font-medium">
                                      Website:
                                    </span>{" "}
                                    <a
                                      href={account.website}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-blue-400 hover:underline"
                                    >
                                      {account.website}
                                    </a>
                                  </p>
                                )}
                                {(account?.city || account?.state) && (
                                  <p className="text-sm text-slate-300">
                                    <span className="font-medium">
                                      Location:
                                    </span>{" "}
                                    {[account.city, account.state].filter(
                                      Boolean,
                                    ).join(", ")}
                                  </p>
                                )}
                                {account?.legacy_id && (
                                  <p className="text-sm text-slate-400">
                                    <span className="font-medium">
                                      Legacy ID:
                                    </span>{" "}
                                    {account.legacy_id}
                                  </p>
                                )}
                                {account?.id && (
                                  <p className="text-xs text-slate-500 mt-2">
                                    ID: {account.id}
                                  </p>
                                )}
                                {account?.created_date && (
                                  <p className="text-xs text-slate-500">
                                    Created:{" "}
                                    {new Date(account.created_date)
                                      .toLocaleDateString()}
                                  </p>
                                )}

                                <div className="flex gap-2 mt-4">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleView(account)}
                                    className="flex-1 bg-slate-600 border-slate-500 text-slate-200 hover:bg-slate-500"
                                    disabled={!account?.id || deleting ||
                                      consolidating}
                                  >
                                    <Eye className="w-4 h-4 mr-1" />
                                    View
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="destructive"
                                    onClick={() => setDeleteTarget(account)}
                                    className="flex-1"
                                    disabled={deleting || !account?.id ||
                                      consolidating}
                                  >
                                    <Trash2 className="w-4 h-4 mr-1" />
                                    Delete
                                  </Button>
                                </div>
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

      <OperationOverlay
        open={operationProgress.show}
        title={consolidating ? "Consolidating Accounts" : "Deleting Accounts"}
        subtitle={consolidating
          ? "Please wait while we consolidate duplicate accounts..."
          : "Please wait while we delete the selected accounts..."}
        progressCurrent={operationProgress.current}
        progressTotal={operationProgress.total}
      />

      {selectedAccount && (
        <AccountDetailPanel
          account={selectedAccount}
          open={!!selectedAccount}
          onOpenChange={(open) => {
            if (!open) {
              setSelectedAccount(null);
            }
          }}
          onUpdate={loadDuplicates}
          user={currentUser}
        />
      )}

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent className="bg-slate-800 border-slate-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-slate-100">
              Are you sure?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              This will permanently delete the account{" "}
              <strong className="text-slate-200">{deleteTarget?.name}</strong>.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              className="bg-slate-700 border-slate-600 text-slate-200 hover:bg-slate-600"
              disabled={deleting}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && handleDelete(deleteTarget)}
              className="bg-red-600 hover:bg-red-700 text-white"
              disabled={deleting}
            >
              {deleting
                ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Deleting...
                  </>
                )
                : (
                  "Delete Account"
                )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={showBulkDeleteConfirm}
        onOpenChange={setShowBulkDeleteConfirm}
      >
        <AlertDialogContent className="bg-slate-800 border-slate-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-slate-100">
              Delete Multiple Accounts?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              This will permanently delete{" "}
              <strong className="text-slate-200">
                {selectedForDeletion.size} account(s)
              </strong>. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              className="bg-slate-700 border-slate-600 text-slate-200 hover:bg-slate-600"
              disabled={deleting}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDelete}
              className="bg-red-600 hover:bg-red-700 text-white"
              disabled={deleting}
            >
              {deleting
                ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Deleting...
                  </>
                )
                : (
                  `Delete ${selectedForDeletion.size} Account(s)`
                )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
