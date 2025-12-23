import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { workflowTemplates, templateCategories, difficultyLevels } from '@/data/workflowTemplates';
import { Sparkles, Zap, Users, TrendingUp, MessageSquare, Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';

const categoryIcons = {
  'Lead Management': Users,
  'Lead Nurture': TrendingUp,
  'Sales': Zap,
  'Multi-Channel': MessageSquare
};

export default function WorkflowTemplatesBrowser({ onSelectTemplate, onClose }) {
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [previewTemplate, setPreviewTemplate] = useState(null);

  const filteredTemplates = workflowTemplates.filter(template => {
    const matchesCategory = selectedCategory === 'all' || template.category === selectedCategory;
    const matchesSearch = !searchQuery || 
      template.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      template.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      template.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()));
    
    return matchesCategory && matchesSearch;
  });

  const handleUseTemplate = (template) => {
    if (onSelectTemplate) {
      onSelectTemplate(template);
    }
    if (onClose) {
      onClose();
    }
  };

  return (
    <div className="h-full flex flex-col bg-slate-900">
      {/* Header */}
      <div className="p-6 border-b border-slate-700">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
              <Sparkles className="w-6 h-6 text-purple-400" />
              Workflow Templates
            </h2>
            <p className="text-sm text-slate-400 mt-1">
              Start with proven automation patterns
            </p>
          </div>
          {onClose && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="text-slate-400 hover:text-slate-200"
            >
              <X className="w-5 h-5" />
            </Button>
          )}
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-500" />
          <Input
            type="text"
            placeholder="Search templates..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 bg-slate-800 border-slate-700 text-slate-200"
          />
        </div>
      </div>

      {/* Category Tabs */}
      <div className="flex gap-2 px-6 py-4 border-b border-slate-700 overflow-x-auto">
        {templateCategories.map(category => (
          <Button
            key={category.id}
            variant={selectedCategory === category.id ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setSelectedCategory(category.id)}
            className={selectedCategory === category.id ? 'bg-purple-600 hover:bg-purple-700' : 'text-slate-400 hover:text-slate-200'}
          >
            <span className="mr-2">{category.icon}</span>
            {category.name}
          </Button>
        ))}
      </div>

      {/* Templates Grid */}
      <div className="flex-1 overflow-y-auto p-6">
        {filteredTemplates.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-slate-500">No templates found matching your criteria</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredTemplates.map(template => {
              const difficultyInfo = difficultyLevels[template.difficulty];
              const CategoryIcon = categoryIcons[template.category] || Zap;
              
              return (
                <Card
                  key={template.id}
                  className="bg-slate-800 border-slate-700 hover:bg-slate-700/50 transition-colors cursor-pointer"
                  onClick={() => setPreviewTemplate(template)}
                >
                  <CardHeader>
                    <div className="flex items-start justify-between mb-2">
                      <div className="p-2 bg-slate-900 rounded-lg">
                        <span className="text-2xl">{template.icon}</span>
                      </div>
                      <Badge
                        variant="outline"
                        className={`
                          ${difficultyInfo.color === 'green' ? 'bg-green-900/30 text-green-400 border-green-700' : ''}
                          ${difficultyInfo.color === 'yellow' ? 'bg-yellow-900/30 text-yellow-400 border-yellow-700' : ''}
                          ${difficultyInfo.color === 'red' ? 'bg-red-900/30 text-red-400 border-red-700' : ''}
                        `}
                      >
                        {difficultyInfo.label}
                      </Badge>
                    </div>
                    <CardTitle className="text-slate-100 text-lg">
                      {template.name}
                    </CardTitle>
                    <CardDescription className="text-slate-400">
                      {template.description}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-2 mb-3">
                      <CategoryIcon className="w-4 h-4 text-slate-500" />
                      <span className="text-xs text-slate-500">{template.category}</span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {template.tags.map(tag => (
                        <Badge
                          key={tag}
                          variant="secondary"
                          className="text-xs bg-slate-700 text-slate-300"
                        >
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Template Preview Dialog */}
      {previewTemplate && (
        <Dialog open={!!previewTemplate} onOpenChange={() => setPreviewTemplate(null)}>
          <DialogContent className="max-w-2xl bg-slate-900 border-slate-700">
            <DialogHeader>
              <div className="flex items-start gap-4">
                <div className="p-3 bg-slate-800 rounded-lg">
                  <span className="text-3xl">{previewTemplate.icon}</span>
                </div>
                <div className="flex-1">
                  <DialogTitle className="text-slate-100 text-xl mb-2">
                    {previewTemplate.name}
                  </DialogTitle>
                  <DialogDescription className="text-slate-400">
                    {previewTemplate.description}
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <div className="space-y-4 mt-4">
              {/* Stats */}
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-slate-800 rounded-lg p-3">
                  <div className="text-2xl font-bold text-purple-400">
                    {previewTemplate.nodes.length}
                  </div>
                  <div className="text-xs text-slate-500">Nodes</div>
                </div>
                <div className="bg-slate-800 rounded-lg p-3">
                  <div className="text-sm font-semibold text-slate-300">
                    {difficultyLevels[previewTemplate.difficulty].label}
                  </div>
                  <div className="text-xs text-slate-500">Difficulty</div>
                </div>
                <div className="bg-slate-800 rounded-lg p-3">
                  <div className="text-sm font-semibold text-slate-300">
                    {previewTemplate.category}
                  </div>
                  <div className="text-xs text-slate-500">Category</div>
                </div>
              </div>

              {/* Workflow Steps Preview */}
              <div className="bg-slate-800 rounded-lg p-4">
                <h4 className="text-sm font-semibold text-slate-200 mb-3">Workflow Steps:</h4>
                <div className="space-y-2">
                  {previewTemplate.nodes.map((node, index) => (
                    <div key={node.id} className="flex items-center gap-3 text-sm">
                      <div className="w-6 h-6 rounded-full bg-purple-600 text-white flex items-center justify-center text-xs font-bold">
                        {index + 1}
                      </div>
                      <span className="text-slate-300 capitalize">
                        {node.type.replace(/_/g, ' ')}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Tags */}
              <div>
                <h4 className="text-sm font-semibold text-slate-200 mb-2">Tags:</h4>
                <div className="flex flex-wrap gap-2">
                  {previewTemplate.tags.map(tag => (
                    <Badge
                      key={tag}
                      variant="secondary"
                      className="bg-slate-700 text-slate-300"
                    >
                      {tag}
                    </Badge>
                  ))}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 pt-4">
                <Button
                  onClick={() => handleUseTemplate(previewTemplate)}
                  className="flex-1 bg-purple-600 hover:bg-purple-700"
                >
                  <Sparkles className="w-4 h-4 mr-2" />
                  Use This Template
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setPreviewTemplate(null)}
                  className="border-slate-700 text-slate-300 hover:bg-slate-800"
                >
                  Cancel
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
