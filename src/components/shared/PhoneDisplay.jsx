import React from "react";

// Utility to format phone numbers for display
const formatPhoneDisplay = (phoneNumber) => {
  if (!phoneNumber) return '';
  
  // Clean the number
  const cleaned = phoneNumber.replace(/[^\d+]/g, '');
  
  // International format (starts with +)
  if (cleaned.startsWith('+')) {
    const digits = cleaned.slice(1);
    
    // US/Canada format (+1)
    if (digits.startsWith('1') && digits.length === 11) {
      const number = digits.slice(1);
      return `+1 (${number.slice(0, 3)}) ${number.slice(3, 6)}-${number.slice(6)}`;
    }
    
    // Generic international format
    if (digits.length >= 7) {
      const countryCode = digits.slice(0, 2);
      const number = digits.slice(2);
      if (number.length >= 8) {
        return `+${countryCode} ${number.slice(0, 3)} ${number.slice(3, 6)} ${number.slice(6)}`;
      }
      return `+${countryCode} ${number}`;
    }
    
    return cleaned;
  }
  
  // US domestic format (10 digits)
  if (cleaned.length === 10) {
    return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
  }
  
  // 7 digit number (local)
  if (cleaned.length === 7) {
    return `${cleaned.slice(0, 3)}-${cleaned.slice(3)}`;
  }
  
  return phoneNumber; // Return as-is if no formatting applied
};

export default function PhoneDisplay({
  user,
  phone,
  contactName,
  enableCalling = false,
  showCallingWidget = false,
  className = "",
}) {
  // If no phone number is provided, display a placeholder
  if (!phone) {
    return <span className="text-slate-500 italic">No phone</span>;
  }

  // Format the phone number for display
  const formattedPhone = formatPhoneDisplay(phone);
  
  // Simple tel: link display (softphone functionality removed)
  return (
    <a
      href={`tel:${phone}`}
      className={`crm-contact-link font-mono text-sm ${className}`}
      title={`Call ${formattedPhone}`}
    >
      {formattedPhone}
    </a>
  );
}