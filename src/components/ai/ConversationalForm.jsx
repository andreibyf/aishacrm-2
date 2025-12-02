import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

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
    const commonProps = {
      id: `conversational-${normalized.name}`,
      value,
      onChange: (event) => handleFieldChange(normalized.name, event.target.value),
      placeholder: normalized.placeholder,
      className: 'bg-white text-slate-900 dark:bg-slate-900/70 dark:text-slate-100'
    };

    if (normalized.type === 'textarea') {
      return <Textarea {...commonProps} rows={3} />;
    }

    if (normalized.type === 'select' && Array.isArray(normalized.options)) {
      return (
        <select
          {...commonProps}
          className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-100"
        >
          <option value="">Select…</option>
          {normalized.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      );
    }

    return <Input type={normalized.type || 'text'} {...commonProps} />;
  };

  const renderStepHistory = () => (
    <div className="space-y-3">
      {visibleSteps.slice(0, activeStepIndex).map((step) => (
        <div key={step.id} className="space-y-1">
          <div className="inline-flex max-w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-100">
            {step.prompt}
          </div>
          <div className="flex justify-end">
            <div className="inline-flex max-w-full rounded-2xl bg-indigo-600 px-3 py-2 text-sm text-white">
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
        <div className="inline-flex max-w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-100">
          {currentStep.prompt}
        </div>
        <div className="space-y-3">
          {currentStep.fields.map((field) => {
            const normalized = normalizeField(field);
            return (
              <div key={normalized.name} className="space-y-1">
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400" htmlFor={`conversational-${normalized.name}`}>
                  {normalized.label || normalized.name.replace(/_/g, ' ')}
                </label>
                {renderFieldInput(field)}
              </div>
            );
          })}
        </div>
        {stepError && <p className="text-sm text-rose-500">{stepError}</p>}
      </div>
    );
  };

  const renderPreview = () => {
    if (!schema.previewFields?.length) {
      return null;
    }
    return (
      <div className="space-y-3">
        <div className="inline-flex max-w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-100">
          Review and confirm these details.
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-700 shadow-sm dark:border-slate-800 dark:bg-slate-950/50 dark:text-slate-100">
          <dl className="grid grid-cols-1 gap-3">
            {schema.previewFields.map((field) => (
              <div key={field}>
                <dt className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">{field.replace(/_/g, ' ')}</dt>
                <dd className="font-medium text-slate-900 dark:text-slate-100">{answers[field] || '—'}</dd>
              </div>
            ))}
          </dl>
        </div>
        {submissionError && <p className="text-sm text-rose-500">{submissionError}</p>}
      </div>
    );
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 shadow-sm dark:border-slate-800/70 dark:bg-slate-900/50">
      <div className="mb-3 flex items-center justify-between text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
        <span>
          {isPreviewing
            ? 'Preview'
            : `Step ${Math.min(activeStepIndex + 1, visibleSteps.length)} of ${visibleSteps.length}`}
        </span>
        <button type="button" className="text-[11px] font-semibold text-indigo-600 hover:underline dark:text-indigo-300" onClick={onCancel}>
          Cancel
        </button>
      </div>
      {renderStepHistory()}
      {!isPreviewing && renderCurrentStep()}
      {isPreviewing && renderPreview()}
      <div className="mt-4 flex items-center justify-between">
        <div className="flex gap-2">
          {(activeStepIndex > 0 || isPreviewing) && (
            <Button type="button" variant="outline" size="sm" onClick={handleBack} disabled={isSubmitting}>
              Back
            </Button>
          )}
          {!isPreviewing && (
            <Button type="button" size="sm" onClick={handleNext}>
              {activeStepIndex >= visibleSteps.length - 1 ? 'Preview' : 'Next'}
            </Button>
          )}
          {isPreviewing && (
            <Button type="button" size="sm" onClick={handleConfirm} disabled={isSubmitting}>
              {isSubmitting ? 'Submitting…' : 'Confirm & Create'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
