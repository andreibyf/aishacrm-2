import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Plus,
  Copy,
  Eye,
  EyeOff,
  Trash2,
  Key,
  Calendar,
  BarChart3,
  AlertTriangle,
  RefreshCw,
  User // Added User icon for created_by
} from 'lucide-react';
import { ApiKey } from '@/api/entities';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export default function ApiKeyManager() {
  const [apiKeys, setApiKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNewKeyDialog, setShowNewKeyDialog] = useState(false);
  const [visibleKeys, setVisibleKeys] = useState(new Set());
  const [justCreatedKey, setJustCreatedKey] = useState(null); // Track newly created keys

  // New key form state
  const [newKey, setNewKey] = useState({
    key_name: '',
    description: '',
    key_value: ''
  });

  useEffect(() => {
    loadApiKeys();
  }, []);

  const loadApiKeys = async () => {
    try {
      const keys = await ApiKey.list('-created_date');
      // Sort by created_date descending to be sure
      keys.sort((a, b) => new Date(b.created_date) - new Date(a.created_date));
      setApiKeys(keys);
    } catch (error) {
      console.error('Failed to load API keys:', error);
      toast.error('Failed to load API keys');
    } finally {
      setLoading(false);
    }
  };

  const generateRandomKey = () => {
    // Generate a secure random key with app prefix
    const prefix = 'aisha';
    const timestamp = Date.now().toString(36);
    const random = Array.from(crypto.getRandomValues(new Uint8Array(16)))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    return `${prefix}_${timestamp}_${random}`;
  };

  const handleCreateKey = async () => {
    if (!newKey.key_name.trim()) {
      toast.error('Key name is required');
      return;
    }

    try {
      const keyData = {
        ...newKey,
        key_value: newKey.key_value || generateRandomKey()
      };

      const createdKey = await ApiKey.create(keyData);
      setApiKeys([createdKey, ...apiKeys]);
      setNewKey({ key_name: '', description: '', key_value: '' });
      setShowNewKeyDialog(false);

      // Make the newly created key immediately visible
      setJustCreatedKey(createdKey.id);
      setVisibleKeys(prev => new Set(prev).add(createdKey.id));

      toast.success('API key created successfully! The key is now visible for you to copy.');
    } catch (error) {
      console.error('Failed to create API key:', error);
      toast.error('Failed to create API key');
    }
  };

  const handleDeleteKey = async (keyId) => {
    try {
      await ApiKey.delete(keyId);
      setApiKeys(apiKeys.filter(key => key.id !== keyId));
      toast.success('API key deleted');
    } catch (error) {
      console.error('Failed to delete API key:', error);
      toast.error('Failed to delete API key');
    }
  };

  const toggleKeyVisibility = (keyId) => {
    const newVisible = new Set(visibleKeys);
    if (newVisible.has(keyId)) {
      newVisible.delete(keyId);
    } else {
      newVisible.add(keyId);
    }
    setVisibleKeys(newVisible);
  };

  const copyToClipboard = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Copied to clipboard');
    } catch (error) {
      toast.error('Failed to copy');
    }
  };

  const maskKey = (key) => {
    if (key.length <= 8) return '*'.repeat(key.length);
    return key.substring(0, 4) + '*'.repeat(key.length - 8) + key.substring(key.length - 4);
  };

  if (loading) {
    return (
      <Card className="bg-slate-800 border-slate-700">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="w-5 h-5 text-amber-400" />
            <span className="text-slate-100">API Keys</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex justify-center p-8">
            <RefreshCw className="w-6 h-6 animate-spin text-slate-400" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="bg-slate-800 border-slate-700">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Key className="w-5 h-5 text-amber-400" />
              <span className="text-slate-100">API Keys</span>
            </div>
            <Dialog open={showNewKeyDialog} onOpenChange={setShowNewKeyDialog}>
              <DialogTrigger asChild>
                <Button className="bg-blue-600 hover:bg-blue-700">
                  <Plus className="w-4 h-4 mr-2" />
                  Generate New Key
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-slate-800 border-slate-700">
                <DialogHeader>
                  <DialogTitle className="text-slate-100">Generate New API Key</DialogTitle>
                  <DialogDescription className="text-slate-400">
                    Create a new API key for external applications to access your CRM functions.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="key_name" className="text-slate-200">Key Name *</Label>
                    <Input
                      id="key_name"
                      value={newKey.key_name}
                      onChange={(e) => setNewKey({...newKey, key_name: e.target.value})}
                      placeholder="e.g., Dialogflow Scheduler"
                      className="bg-slate-700 border-slate-600 text-slate-200 placeholder:text-slate-400 focus:border-slate-500"
                    />
                  </div>
                  <div>
                    <Label htmlFor="description" className="text-slate-200">Description</Label>
                    <Textarea
                      id="description"
                      value={newKey.description}
                      onChange={(e) => setNewKey({...newKey, description: e.target.value})}
                      placeholder="What this key will be used for..."
                      className="bg-slate-700 border-slate-600 text-slate-200 placeholder:text-slate-400 focus:border-slate-500"
                    />
                  </div>
                  <div>
                    <Label htmlFor="key_value" className="text-slate-200">Custom Key (Optional)</Label>
                    <Input
                      id="key_value"
                      value={newKey.key_value}
                      onChange={(e) => setNewKey({...newKey, key_value: e.target.value})}
                      placeholder="Leave blank to auto-generate"
                      className="bg-slate-700 border-slate-600 text-slate-200 placeholder:text-slate-400 focus:border-slate-500"
                    />
                    <p className="text-sm text-slate-400 mt-1">
                      Leave blank to generate a secure random key
                    </p>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowNewKeyDialog(false)} className="bg-slate-700 border-slate-600 text-slate-200 hover:bg-slate-600">
                    Cancel
                  </Button>
                  <Button onClick={handleCreateKey} className="bg-blue-600 hover:bg-blue-700">
                    Generate Key
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </CardTitle>
          <CardDescription className="text-slate-400">
            Manage API keys for external integrations and automation
          </CardDescription>
        </CardHeader>
        <CardContent>
          {apiKeys.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              <Key className="w-12 h-12 mx-auto mb-4 text-slate-500" />
              <p className="font-medium text-slate-300">No API keys created yet</p>
              <p className="text-sm">Generate your first API key to get started</p>
            </div>
          ) : (
            <div className="space-y-4">
              {apiKeys.map((key) => (
                <Card
                  key={key.id}
                  className={`border-l-4 ${
                    justCreatedKey === key.id
                      ? 'border-l-green-500 bg-green-900/20'
                      : 'border-l-blue-500 bg-slate-700'
                  }`}
                >
                  <CardContent className="pt-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <h3 className="font-semibold text-slate-100">{key.key_name}</h3>
                          <Badge variant={key.is_active ? 'default' : 'secondary'} className={key.is_active ? 'bg-green-600 text-white' : 'bg-slate-600 text-slate-300'}>
                            {key.is_active ? 'Active' : 'Inactive'}
                          </Badge>
                          {justCreatedKey === key.id && (
                            <Badge className="bg-green-600 text-white">
                              Just Created - Copy Now!
                            </Badge>
                          )}
                        </div>

                        {key.description && (
                          <p className="text-sm text-slate-400 mb-3">{key.description}</p>
                        )}

                        <div className={`font-mono text-sm p-2 rounded border flex items-center justify-between ${
                          justCreatedKey === key.id ? 'bg-green-900/30 border-green-600' : 'bg-slate-600 border-slate-500'
                        }`}>
                          <span className="break-all text-slate-200">
                            {visibleKeys.has(key.id) ? key.key_value : maskKey(key.key_value)}
                          </span>
                          <div className="flex items-center gap-1 ml-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => toggleKeyVisibility(key.id)}
                              className="text-slate-300 hover:text-slate-100 hover:bg-slate-500"
                            >
                              {visibleKeys.has(key.id) ? (
                                <EyeOff className="w-4 h-4" />
                              ) : (
                                <Eye className="w-4 h-4" />
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                copyToClipboard(key.key_value);
                                if (justCreatedKey === key.id) {
                                  setJustCreatedKey(null); // Remove highlight after copying
                                }
                              }}
                              className={`text-slate-300 hover:text-slate-100 ${justCreatedKey === key.id ? 'bg-green-700 hover:bg-green-600' : 'hover:bg-slate-500'}`}
                            >
                              <Copy className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3 text-xs text-slate-400">
                          <div className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            Created: {format(new Date(key.created_date), 'MMM d, yyyy HH:mm')}
                          </div>
                          {key.created_by && (
                            <div className="flex items-center gap-1">
                              <User className="w-3 h-3" />
                              Creator: {key.created_by}
                            </div>
                          )}
                          {key.usage_count > 0 && (
                            <div className="flex items-center gap-1">
                              <BarChart3 className="w-3 h-3" />
                              Used: {key.usage_count} times
                            </div>
                          )}
                          {key.last_used && (
                            <div className="flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              Last used: {format(new Date(key.last_used), 'MMM d, yyyy')}
                            </div>
                          )}
                        </div>
                      </div>

                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="sm" className="text-red-400 hover:text-red-300 hover:bg-slate-600">
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent className="bg-slate-800 border-slate-700">
                          <AlertDialogHeader>
                            <AlertDialogTitle className="flex items-center gap-2 text-slate-100">
                              <AlertTriangle className="w-5 h-5 text-red-400" />
                              Delete API Key
                            </AlertDialogTitle>
                            <AlertDialogDescription className="text-slate-400">
                              Are you sure you want to delete the API key "{key.key_name}"?
                              This action cannot be undone and will break any integrations using this key.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel className="bg-slate-700 border-slate-600 text-slate-200 hover:bg-slate-600">Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleDeleteKey(key.id)}
                              className="bg-red-600 hover:bg-red-700"
                            >
                              Delete Key
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
