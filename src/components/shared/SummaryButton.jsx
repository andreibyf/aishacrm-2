import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, FileText, Sparkles } from 'lucide-react';
import { generateEntitySummary } from "@/api/functions";
import ReactMarkdown from 'react-markdown';

export default function SummaryButton({ entityType, entityId, entityName }) {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState('');
  const [summaryType, setSummaryType] = useState('overview');
  const [error, setError] = useState('');

  const summaryTypes = [
    { value: 'overview', label: 'Overview', description: 'General summary of the record' },
    { value: 'activity', label: 'Activity', description: 'Recent interactions and activities' },
    { value: 'insights', label: 'Insights', description: 'AI analysis and recommendations' },
    { value: 'relationship', label: 'Relationships', description: 'Connections to other records' }
  ];

  const handleGenerateSummary = async () => {
    setLoading(true);
    setError('');
    setSummary('');

    try {
      const response = await generateEntitySummary({
        entity_type: entityType,
        entity_id: entityId,
        summary_type: summaryType
      });

      if (response.data.success) {
        setSummary(response.data.summary);
      } else {
        setError(response.data.error || 'Failed to generate summary');
      }
    } catch (err) {
      console.error('Error generating summary:', err);
      setError('Failed to generate summary. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setIsOpen(false);
    setSummary('');
    setError('');
    setSummaryType('overview');
  };

  return (
    <>
      <Button
        onClick={() => setIsOpen(true)}
        size="sm"
        className="bg-purple-600 hover:bg-purple-700 text-white"
      >
        <FileText className="w-4 h-4 mr-1" />
        AI Summary
      </Button>

      <Dialog open={isOpen} onOpenChange={(open) => {if (!open) handleClose()}}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden bg-slate-800 border-slate-700 text-slate-100 flex flex-col">
          <DialogHeader className="border-b border-slate-700 pb-4">
            <DialogTitle className="text-xl font-semibold text-slate-100 flex items-center gap-2">
              <Sparkles className="w-6 h-6 text-purple-400" />
              AI Summary: {entityName}
            </DialogTitle>
          </DialogHeader>

          <div className="flex-grow overflow-y-auto py-4 px-1">
            <div className="space-y-4">
              {/* Summary Type Selection */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {summaryTypes.map((type) => (
                  <Button
                    key={type.value}
                    variant={summaryType === type.value ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSummaryType(type.value)}
                    className={`${
                      summaryType === type.value 
                        ? 'bg-purple-600 border-purple-500 text-white' 
                        : 'bg-slate-700 border-slate-600 text-slate-200 hover:bg-slate-600'
                    } text-xs p-2 h-auto flex flex-col items-center`}
                    title={type.description}
                  >
                    <span className="font-medium">{type.label}</span>
                    <span className="text-xs opacity-75 text-center">{type.description}</span>
                  </Button>
                ))}
              </div>

              {/* Generate Button */}
              <div className="flex justify-center">
                <Button
                  onClick={handleGenerateSummary}
                  disabled={loading}
                  className="bg-purple-600 hover:bg-purple-700 text-white"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Generating {summaryTypes.find(t => t.value === summaryType)?.label} Summary...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 mr-2" />
                      Generate {summaryTypes.find(t => t.value === summaryType)?.label} Summary
                    </>
                  )}
                </Button>
              </div>

              {/* Error Display */}
              {error && (
                <div className="bg-red-900/50 border border-red-500/50 rounded-lg p-4">
                  <p className="text-red-300 text-sm">{error}</p>
                </div>
              )}

              {/* Summary Display */}
              {summary && (
                <div className="bg-slate-700/50 border border-slate-600 rounded-lg p-6">
                  <div className="markdown-content">
                    <ReactMarkdown 
                      className="text-slate-200 [&>h1]:text-2xl [&>h1]:font-bold [&>h1]:text-slate-100 [&>h1]:mb-4 [&>h1]:border-b [&>h1]:border-slate-600 [&>h1]:pb-2 [&>h2]:text-xl [&>h2]:font-semibold [&>h2]:text-slate-200 [&>h2]:mb-3 [&>h2]:mt-6 [&>h3]:text-lg [&>h3]:font-medium [&>h3]:text-slate-200 [&>h3]:mb-2 [&>h3]:mt-4 [&>p]:text-slate-300 [&>p]:mb-3 [&>p]:leading-relaxed [&>ul]:text-slate-300 [&>ul]:mb-3 [&>ul]:pl-4 [&>ul]:space-y-1 [&>ol]:text-slate-300 [&>ol]:mb-3 [&>ol]:pl-4 [&>ol]:space-y-1 [&>li]:text-slate-300 [&>strong]:text-slate-100 [&>strong]:font-semibold [&>em]:text-slate-200 [&>em]:italic [&>code]:bg-slate-600 [&>code]:text-slate-100 [&>code]:px-1.5 [&>code]:py-0.5 [&>code]:rounded [&>code]:text-sm [&>code]:font-mono [&>blockquote]:border-l-4 [&>blockquote]:border-purple-500 [&>blockquote]:pl-4 [&>blockquote]:italic [&>blockquote]:text-slate-300"
                    >
                      {summary}
                    </ReactMarkdown>
                  </div>
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}