import { useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { getAvailableTemplates } from '@/utils/userRoleTemplates';
import { Check } from 'lucide-react';

/**
 * UserTemplateSelector
 * Modal for selecting a user role template when creating a new user
 * Only shown during user creation, not during edit
 */
const UserTemplateSelector = ({ open, onSelectTemplate, onCancel }) => {
  const templates = useMemo(() => getAvailableTemplates(), []);

  const handleTemplateSelect = (template) => {
    onSelectTemplate(template);
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onCancel()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Select User Role Template</DialogTitle>
          <DialogDescription>
            Choose a template to quickly set up user permissions and access levels. You can
            customize any settings after selection.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {templates.map((template) => (
            <Card
              key={template.id}
              className="p-4 cursor-pointer hover:shadow-lg hover:border-blue-500 transition-all"
              onClick={() => handleTemplateSelect(template)}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-2xl">{template.emoji}</span>
                    <h3 className="font-semibold text-sm">{template.name}</h3>
                  </div>
                  <p className="text-xs text-gray-600 mb-3">{template.description}</p>

                  <div className="space-y-2 text-xs">
                    <div>
                      <span className="font-semibold text-gray-700">Role:</span>
                      <span className="ml-2 px-2 py-1 bg-gray-100 rounded">{template.role}</span>
                    </div>

                    <div>
                      <span className="font-semibold text-gray-700">Team Access:</span>
                      <span className="ml-2 px-2 py-1 bg-gray-100 rounded">
                        {template.teamAccessLevel}
                      </span>
                    </div>

                    <div>
                      <span className="font-semibold text-gray-700">Permissions:</span>
                      <div className="mt-1 space-y-1">
                        {Object.entries(template.permissions).map(([perm, enabled]) => (
                          <div key={perm} className="flex items-center">
                            <span
                              className={`inline-block w-3 h-3 rounded mr-2 ${
                                enabled ? 'bg-green-500' : 'bg-gray-300'
                              }`}
                            />
                            <span className={enabled ? 'text-gray-700' : 'text-gray-500'}>
                              {perm.replace('perm_', '')}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="ml-auto flex-shrink-0"
                  onClick={() => handleTemplateSelect(template)}
                >
                  <Check className="w-4 h-4 mr-1" />
                  Select
                </Button>
              </div>
            </Card>
          ))}
        </div>

        <div className="flex justify-between gap-3 pt-4 border-t">
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <p className="text-xs text-gray-500 flex items-center">
            💡 Select a template above or click Cancel to start with a blank form
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default UserTemplateSelector;
