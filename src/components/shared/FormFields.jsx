import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import PhoneInput from "./PhoneInput";
import AddressFields from "./AddressFields";
import TagInput from "./TagInput";
import LazyAccountSelector from "./LazyAccountSelector";
import LazyEmployeeSelector from "./LazyEmployeeSelector";

// Reusable form field components to eliminate duplication

export const TextField = ({
  id,
  label,
  value,
  onChange,
  required = false,
  placeholder = "",
  disabled = false,
  type = "text",
  darkMode = true,
  helpText = null,
}) => (
  <div>
    <Label
      htmlFor={id}
      className={darkMode ? "text-slate-200" : "text-slate-700"}
    >
      {label} {required && <span className="text-red-400">*</span>}
    </Label>
    <Input
      id={id}
      type={type}
      value={value || ""}
      onChange={(e) => onChange(e.target.value)}
      required={required}
      placeholder={placeholder}
      disabled={disabled}
      className={`mt-1 ${
        darkMode
          ? "bg-slate-700 border-slate-600 text-slate-200 placeholder:text-slate-400"
          : ""
      }`}
    />
    {helpText && (
      <p
        className={`text-xs mt-1 ${
          darkMode ? "text-slate-500" : "text-slate-600"
        }`}
      >
        {helpText}
      </p>
    )}
  </div>
);

export const TextAreaField = ({
  id,
  label,
  value,
  onChange,
  required = false,
  placeholder = "",
  disabled = false,
  rows = 3,
  darkMode = true,
  helpText = null,
}) => (
  <div>
    <Label
      htmlFor={id}
      className={darkMode ? "text-slate-200" : "text-slate-700"}
    >
      {label} {required && <span className="text-red-400">*</span>}
    </Label>
    <Textarea
      id={id}
      value={value || ""}
      onChange={(e) => onChange(e.target.value)}
      required={required}
      placeholder={placeholder}
      disabled={disabled}
      rows={rows}
      className={`mt-1 ${
        darkMode
          ? "bg-slate-700 border-slate-600 text-slate-200 placeholder:text-slate-400"
          : ""
      }`}
    />
    {helpText && (
      <p
        className={`text-xs mt-1 ${
          darkMode ? "text-slate-500" : "text-slate-600"
        }`}
      >
        {helpText}
      </p>
    )}
  </div>
);

export const SelectField = ({
  id,
  label,
  value,
  onChange,
  options = [],
  required = false,
  placeholder = "Select...",
  disabled = false,
  darkMode = true,
  helpText = null,
}) => (
  <div>
    <Label
      htmlFor={id}
      className={darkMode ? "text-slate-200" : "text-slate-700"}
    >
      {label} {required && <span className="text-red-400">*</span>}
    </Label>
    <Select value={value || ""} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger
        id={id}
        className={`mt-1 ${
          darkMode ? "bg-slate-700 border-slate-600 text-slate-200" : ""
        }`}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent
        className={darkMode ? "bg-slate-800 border-slate-700" : ""}
      >
        {options.map((opt) => (
          <SelectItem
            key={opt.value}
            value={opt.value}
            className={darkMode ? "text-slate-200 hover:bg-slate-700" : ""}
          >
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
    {helpText && (
      <p
        className={`text-xs mt-1 ${
          darkMode ? "text-slate-500" : "text-slate-600"
        }`}
      >
        {helpText}
      </p>
    )}
  </div>
);

export const PhoneField = ({
  id,
  label,
  value,
  onChange,
  required = false,
  placeholder = "",
  darkMode = true,
  showPrefixPicker = true,
  helpText = null,
}) => (
  <div>
    <PhoneInput
      id={id}
      label={label}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      className={darkMode ? "bg-slate-700 border-slate-600 text-slate-200" : ""}
      labelClassName={darkMode ? "text-slate-200" : "text-slate-700"}
      darkMode={darkMode}
      showPrefixPicker={showPrefixPicker}
    />
    {helpText && (
      <p
        className={`text-xs mt-1 ${
          darkMode ? "text-slate-500" : "text-slate-600"
        }`}
      >
        {helpText}
      </p>
    )}
  </div>
);

export const AccountField = ({
  label = "Associated Account",
  value,
  onChange,
  onCreateNew,
  darkMode = true,
  helpText = null,
}) => (
  <div>
    <Label className={darkMode ? "text-slate-200" : "text-slate-700"}>
      {label}
    </Label>
    <LazyAccountSelector
      value={value}
      onValueChange={onChange}
      onCreateNew={onCreateNew}
      placeholder="Link to an existing account..."
      className={`mt-1 ${
        darkMode ? "bg-slate-700 border-slate-600 text-slate-200" : ""
      }`}
      contentClassName={darkMode ? "bg-slate-800 border-slate-700" : ""}
      itemClassName={darkMode ? "text-slate-200 hover:bg-slate-700" : ""}
    />
    {helpText && (
      <p
        className={`text-xs mt-1 ${
          darkMode ? "text-slate-500" : "text-slate-600"
        }`}
      >
        {helpText}
      </p>
    )}
  </div>
);

export const EmployeeField = ({
  label = "Assigned To",
  value,
  onChange,
  allowUnassigned = true,
  darkMode = true,
  helpText = null,
}) => (
  <div>
    <Label className={darkMode ? "text-slate-200" : "text-slate-700"}>
      {label}
    </Label>
    <LazyEmployeeSelector
      value={value}
      onValueChange={onChange}
      placeholder={allowUnassigned ? "Unassigned" : "Select employee..."}
      className={`w-full mt-1 ${
        darkMode ? "bg-slate-700 border-slate-600 text-slate-200" : ""
      }`}
      contentClassName={darkMode ? "bg-slate-800 border-slate-700" : ""}
      itemClassName={darkMode ? "text-slate-200 hover:bg-slate-700" : ""}
      allowUnassigned={allowUnassigned}
      showLoadingState={true}
    />
    {helpText && (
      <p
        className={`text-xs mt-1 ${
          darkMode ? "text-slate-500" : "text-slate-600"
        }`}
      >
        {helpText}
      </p>
    )}
  </div>
);

export const TagsField = ({
  label = "Tags",
  value,
  onChange,
  allTags = [],
  darkMode = true,
  helpText = null,
}) => (
  <div>
    <Label
      className={`${darkMode ? "text-slate-200" : "text-slate-700"} block mb-2`}
    >
      {label}
    </Label>
    <TagInput
      selectedTags={value || []}
      onTagsChange={onChange}
      allTags={allTags}
      placeholder="Add or search for tags..."
      darkMode={darkMode}
    />
    {helpText && (
      <p
        className={`text-xs mt-1 ${
          darkMode ? "text-slate-500" : "text-slate-600"
        }`}
      >
        {helpText}
      </p>
    )}
  </div>
);

export const AddressSection = ({
  formData,
  onChange,
  darkMode = true,
}) => (
  <div
    className={`border-t pt-6 ${
      darkMode ? "border-slate-600" : "border-slate-300"
    }`}
  >
    <h4
      className={`text-lg font-semibold mb-4 ${
        darkMode ? "text-slate-100" : "text-slate-900"
      }`}
    >
      Address Information
    </h4>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <AddressFields
        formData={formData}
        handleChange={onChange}
        darkMode={darkMode}
      />
    </div>
  </div>
);
