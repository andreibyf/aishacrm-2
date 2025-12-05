import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ChevronRight, ChevronLeft, Check, Sparkles } from 'lucide-react';

const normalizeField = (field) => {
  if (typeof field === 'string') {
    return { name: field, label: field.replace(/_/g, ' ') };
  }
  return field;
};

const renderAnswerPreview = (step, answers) => {
  const summary = step.fields
    .map((field) => normalizeField(field))
    .map((field) => answers[field.name])
    .filter(Boolean)
    .join(', ');
  return summary || '—';
};

const defaultValidation = (step, answers) => {
  if (!step.required) return { valid: true };
  const allFilled = step.fields
    .map((field) => normalizeField(field))
    .every((field) => Boolean(String(answers[field.name] ?? '').trim()));
  return {
    valid: allFilled,
    error: allFilled ? undefined : 'Please complete the required information before continuing.'
  };
};

export default function ConversationalForm({
  schema,
  tenantId,
  userId,
  onComplete,
  onCancel,
  initialAnswers = {},
  isSubmitting = false
}) {
  const [answers, setAnswers] = useState(initialAnswers);
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [stepError, setStepError] = useState(null);
  const [submissionError, setSubmissionError] = useState(null);
  const [isPreviewing, setIsPreviewing] = useState(false);

  useEffect(() => {
    setAnswers(initialAnswers || {});
    setActiveStepIndex(0);
    setIsPreviewing(false);
    setStepError(null);
    setSubmissionError(null);
  }, [schema, initialAnswers]);

  const visibleSteps = useMemo(() => {
    if (!schema?.steps) return [];
    if (typeof schema.shouldIncludeStep !== 'function') return schema.steps;
    return schema.steps.filter((step) => schema.shouldIncludeStep(step.id, answers));
  }, [schema, answers]);

  useEffect(() => {
    // Only auto-advance to preview if we have a valid schema with steps
    if (!schema?.steps?.length) return;
    if (!isPreviewing && activeStepIndex >= visibleSteps.length) {
      setIsPreviewing(true);
    }
  }, [activeStepIndex, visibleSteps.length, isPreviewing, schema]);

  if (!schema) {
    return null;
  }

  const currentStep = !isPreviewing ? visibleSteps[activeStepIndex] : null;

  const handleFieldChange = (name, value) => {
    setAnswers((prev) => ({ ...prev, [name]: value }));
  };

  const validateStep = () => {
    if (!currentStep) return { valid: true };
    if (typeof currentStep.validate === 'function') {
      return currentStep.validate(answers);
    }
    return defaultValidation(currentStep, answers);
  };

  const handleNext = () => {
    const validation = validateStep();
    if (!validation.valid) {
      setStepError(validation.error || 'Please check your answer.');
      return;
    }
    setStepError(null);
    if (activeStepIndex >= visibleSteps.length - 1) {
      setIsPreviewing(true);
    } else {
      setActiveStepIndex((prev) => prev + 1);
    }
  };

  const handleBack = () => {
    if (isPreviewing) {
      setIsPreviewing(false);
      setSubmissionError(null);
      return;
    }
    setActiveStepIndex((prev) => Math.max(prev - 1, 0));
    setStepError(null);
  };

  const handleConfirm = async () => {
    if (typeof schema.buildPayload !== 'function') {
      return;
    }
    setSubmissionError(null);
    try {
      const payload = schema.buildPayload(answers, { tenantId, userId });
      await Promise.resolve(onComplete?.(payload));
    } catch (error) {
      setSubmissionError(error?.message || 'Failed to submit. Please try again.');
    }
  };

  const renderFieldInput = (field) => {
    const normalized = normalizeField(field);
    const value = answers[normalized.name] ?? '';

    // Enhanced input styling
    const inputClasses = "w-full rounded-xl border-2 border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 shadow-sm transition-all placeholder:text-slate-400 hover:border-slate-300 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-100 dark:placeholder:text-slate-500 dark:hover:border-slate-600 dark:focus:border-emerald-500";

    const commonProps = {
      id: `conversational-${normalized.name}`,
      value,
      onChange: (event) => handleFieldChange(normalized.name, event.target.value),
      placeholder: normalized.placeholder || `Enter ${(normalized.label || normalized.name).toLowerCase()}...`,
    };

    if (normalized.type === 'textarea') {
      return (
        <Textarea
          {...commonProps}
          rows={3}
          className={inputClasses}
        />
      );
    }

    if (normalized.type === 'select' && Array.isArray(normalized.options)) {
      return (
        <select
          {...commonProps}
          className={inputClasses + " cursor-pointer"}
        >
          <option value="">Select an option...</option>
          {normalized.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      );
    }

    return (
      <Input
        type={normalized.type || 'text'}
        {...commonProps}
        className={inputClasses}
      />
    );
  };

  const renderStepHistory = () => (
    <div className="space-y-3 mb-4">
      {visibleSteps.slice(0, activeStepIndex).map((step) => (
        <div key={step.id} className="space-y-2">
          <div className="flex items-start gap-2">
            <div className="mt-1 h-2 w-2 rounded-full bg-emerald-500 flex-shrink-0" />
            <div className="inline-flex max-w-full rounded-xl border border-slate-200/80 bg-white/80 px-3 py-2 text-sm text-slate-600 dark:border-slate-700/60 dark:bg-slate-800/60 dark:text-slate-300">
              {step.prompt}
            </div>
          </div>
          <div className="flex justify-end">
            <div className="inline-flex max-w-full rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-500 px-4 py-2 text-sm font-medium text-white shadow-sm">
              {renderAnswerPreview(step, answers)}
            </div>
          </div>
        </div>
      ))}
    </div>
  );

  const renderCurrentStep = () => {
    if (!currentStep) {
      return null;
    }

    return (
      <div className="space-y-4">
        {/* Prompt bubble with accent */}
        <div className="flex items-start gap-3">
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-emerald-600 shadow-md shadow-emerald-500/20">
            <Sparkles className="h-4 w-4 text-white" />
          </div>
          <div className="flex-1 rounded-2xl border border-emerald-200/60 bg-gradient-to-br from-emerald-50 to-white px-4 py-3 text-sm font-semibold text-slate-800 shadow-sm dark:border-emerald-800/40 dark:from-emerald-950/40 dark:to-slate-900/60 dark:text-slate-100">
            {currentStep.prompt}
          </div>
        </div>

        {/* Form fields */}
        <div className="ml-11 space-y-4">
          {currentStep.fields.map((field) => {
            const normalized = normalizeField(field);
            return (
              <div key={normalized.name} className="space-y-2">
                <label
                  className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300"
                  htmlFor={`conversational-${normalized.name}`}
                >
                  <span className="h-1 w-1 rounded-full bg-emerald-500" />
                  {normalized.label || normalized.name.replace(/_/g, ' ')}
                  {currentStep.required && <span className="text-rose-500">*</span>}
                </label>
                {renderFieldInput(field)}
              </div>
            );
          })}
        </div>

        {stepError && (
          <div className="ml-11 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm text-rose-700 dark:border-rose-800/40 dark:bg-rose-950/30 dark:text-rose-300">
            {stepError}
          </div>
        )}
      </div>
    );
  };

  const renderPreview = () => {
    if (!schema.previewFields?.length) {
      return null;
    }
    return (
      <div className="space-y-4">
        {/* Preview header */}
        <div className="flex items-start gap-3">
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-indigo-600 shadow-md shadow-indigo-500/20">
            <Check className="h-4 w-4 text-white" />
          </div>
          <div className="flex-1 rounded-2xl border border-indigo-200/60 bg-gradient-to-br from-indigo-50 to-white px-4 py-3 text-sm font-semibold text-slate-800 shadow-sm dark:border-indigo-800/40 dark:from-indigo-950/40 dark:to-slate-900/60 dark:text-slate-100">
            Review and confirm these details
          </div>
        </div>

        {/* Preview card */}
        <div className="ml-11 rounded-2xl border border-slate-200 bg-white p-5 shadow-md dark:border-slate-700/70 dark:bg-slate-900/80">
          <dl className="grid grid-cols-1 gap-4">
            {schema.previewFields.map((field) => (
              <div key={field} className="group">
                <dt className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  {field.replace(/_/g, ' ')}
                </dt>
                <dd className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {answers[field] || <span className="text-slate-400 italic">Not provided</span>}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        {submissionError && (
          <div className="ml-11 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm text-rose-700 dark:border-rose-800/40 dark:bg-rose-950/30 dark:text-rose-300">
            {submissionError}
          </div>
        )}
      </div>
    );
  };

  // Step progress indicator
  const progressPercentage = isPreviewing
    ? 100
    : ((activeStepIndex + 1) / visibleSteps.length) * 100;

  return (
    <div className="rounded-2xl border border-slate-200 bg-gradient-to-b from-white to-slate-50/80 p-5 shadow-lg dark:border-slate-700/70 dark:from-slate-900/90 dark:to-slate-950/80">
      {/* Header with progress */}
      <div className="mb-5">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            {isPreviewing
              ? '✨ Ready to create'
              : `Step ${Math.min(activeStepIndex + 1, visibleSteps.length)} of ${visibleSteps.length}`}
          </span>
          <button
            type="button"
            className="text-xs font-semibold text-slate-500 transition-colors hover:text-rose-500 dark:text-slate-400 dark:hover:text-rose-400"
            onClick={onCancel}
          >
            Cancel
          </button>
        </div>
        {/* Progress bar */}
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
          <div
            className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-300"
            style={{ width: `${progressPercentage}%` }}
          />
        </div>
      </div>

      {renderStepHistory()}
      {!isPreviewing && renderCurrentStep()}
      {isPreviewing && renderPreview()}

      {/* Action buttons */}
      <div className="mt-5 flex items-center justify-end gap-3 border-t border-slate-200 pt-4 dark:border-slate-700/70">
        {(activeStepIndex > 0 || isPreviewing) && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleBack}
            disabled={isSubmitting}
            className="gap-1.5 rounded-xl border-2 px-4"
          >
            <ChevronLeft className="h-4 w-4" />
            Back
          </Button>
        )}
        {!isPreviewing && (
          <Button
            type="button"
            size="sm"
            onClick={handleNext}
            className="gap-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-500 px-5 shadow-md shadow-emerald-500/25 transition-all hover:from-emerald-700 hover:to-emerald-600 hover:shadow-lg hover:shadow-emerald-500/30"
          >
            {activeStepIndex >= visibleSteps.length - 1 ? 'Preview' : 'Next'}
            <ChevronRight className="h-4 w-4" />
          </Button>
        )}
        {isPreviewing && (
          <Button
            type="button"
            size="sm"
            onClick={handleConfirm}
            disabled={isSubmitting}
            className="gap-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-500 px-5 shadow-md shadow-indigo-500/25 transition-all hover:from-indigo-700 hover:to-indigo-600 hover:shadow-lg hover:shadow-indigo-500/30"
          >
            {isSubmitting ? (
              <>Submitting...</>
            ) : (
              <>
                <Check className="h-4 w-4" />
                Confirm & Create
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
