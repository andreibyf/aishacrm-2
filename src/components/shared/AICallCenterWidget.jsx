
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
// Removed Card components as they are replaced by custom divs with styling
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Phone, X, Bot, Loader2, User as UserIcon } from 'lucide-react';
import { callFluentWebhookV2 } from '@/api/functions';
import { toast } from 'sonner';
import { useTenant } from './tenantContext';

export default function AICallCenterWidget({
  prefilledData = {},
  user,
  tenantName = "your company",
  className // Added className prop to pass to the widget container
}) {
  const [isVisible, setIsVisible] = useState(false); // Changed isOpen to isVisible
  const [isCalling, setIsCalling] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState(prefilledData.phoneNumber || '');
  const [contactName, setContactName] = useState(prefilledData.contactName || '');
  const [companyName, setCompanyName] = useState(prefilledData.companyName || '');
  const [callObjective, setCallObjective] = useState(prefilledData.callPurpose || '');
  const { selectedTenantId } = useTenant();

  useEffect(() => {
    setPhoneNumber(prefilledData.phoneNumber || '');
    setContactName(prefilledData.contactName || '');
    setCompanyName(prefilledData.companyName || '');
    setCallObjective(prefilledData.callPurpose || '');
  }, [prefilledData, isVisible]); // Changed isOpen to isVisible in dependency array

  const handleStartCall = async () => {
    if (!phoneNumber || !callObjective) {
      toast.error("Phone number and call objective are required.");
      return;
    }

    const tenantIdForCall = user?.role === 'superadmin' ? selectedTenantId : user?.tenant_id;
    
    if (!tenantIdForCall) {
        toast.error("Could not determine the tenant for this call. Please select a tenant if you are an administrator.");
        return;
    }

    setIsCalling(true);
    try {
      const payload = {
        call_status: 'ai_call_initiated',
        phone_number: phoneNumber,
        client_id: tenantIdForCall,
        contact_name: contactName,
        company_name: companyName,
        call_objective: callObjective,
        assignee_name: user?.full_name || 'the team',
      };
      
      const response = await callFluentWebhookV2(payload);

      if (response.data?.status === 'success') {
        toast.success("AI call initiated successfully!");
        setIsVisible(false); // Changed setIsOpen to setIsVisible
      } else {
        throw new Error(response.data?.message || 'Failed to initiate call.');
      }
    } catch (error) {
      toast.error(`Error: ${error.message}`);
    } finally {
      setIsCalling(false);
    }
  };

  if (!user) return null;
  if (user.role === 'superadmin' && !selectedTenantId) {
    return null; // Don't render for superadmin if no tenant is selected
  }
  if (user.role !== 'superadmin' && !user.tenant_id) {
    return null; // Don't render for other roles if they have no tenant
  }

  return (
    <div className={`fixed bottom-4 right-4 z-[9999] ${className}`} onPointerDown={(e) => e.stopPropagation()}>
      <AnimatePresence>
        {/* Render the card when isVisible is true */}
        {isVisible && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="bg-gradient-to-br from-blue-600 to-purple-600 text-white p-4 rounded-xl shadow-2xl border-2 border-white max-w-sm"
            style={{ zIndex: 9999 }} // Ensures card is correctly layered if other elements are in the same stacking context
          >
            {/* Mimic CardHeader with new styling */}
            <div className="flex justify-between items-center pb-2 border-b border-white/30 mb-4">
              <div className="flex items-center gap-3">
                <Bot className="w-6 h-6" />
                <h2 className="text-lg font-semibold">AI Call Center</h2> {/* Replaced CardTitle */}
              </div>
              <Button variant="ghost" size="icon" onClick={() => setIsVisible(false)} className="text-white hover:bg-blue-500">
                <X className="w-5 h-5" />
              </Button>
            </div>
            <p className="text-blue-100 mb-4">Initiate an AI-powered call.</p> {/* Replaced CardDescription */}

            {/* Mimic CardContent with new styling */}
            <div className="space-y-4">
              <div className="space-y-1">
                <Label htmlFor="contactName" className="text-white">Contact Name</Label>
                <Input id="contactName" value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="John Doe" className="bg-white/10 border-white/30 text-white placeholder-white/70" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="phoneNumber" className="text-white">Phone Number *</Label>
                <Input id="phoneNumber" value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} placeholder="(555) 123-4567" required className="bg-white/10 border-white/30 text-white placeholder-white/70" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="callObjective" className="text-white">Call Objective *</Label>
                <Textarea id="callObjective" value={callObjective} onChange={(e) => setCallObjective(e.target.value)} placeholder="e.g., Follow up on quote, schedule demo" required className="bg-white/10 border-white/30 text-white placeholder-white/70" />
              </div>
              <Button onClick={handleStartCall} disabled={isCalling} className="w-full bg-white text-blue-600 hover:bg-blue-100">
                {isCalling ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Calling...</>
                ) : (
                  <><Phone className="w-4 h-4 mr-2" /> Start AI Call</>
                )}
              </Button>
            </div>
          </motion.div>
        )}

        {/* Floating trigger button, rendered only when card is not visible */}
        {!isVisible && (
          <motion.button
            initial={{ scale: 0, y: 50 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0, y: 50 }}
            transition={{ type: 'spring', stiffness: 260, damping: 20 }}
            onClick={() => setIsVisible(true)} // Opens the card
            className="bg-gradient-to-br from-green-500 to-blue-600 text-white p-4 rounded-full shadow-lg hover:shadow-xl border-2 border-white"
            style={{ zIndex: 10000 }} // Ensures button is on top of other content if it were to overlap
            title="AI Call Center"
          >
            <Phone className="w-6 h-6" />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
