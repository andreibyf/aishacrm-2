import StripeSettings from "@/components/settings/StripeSettings";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { CreditCard } from "lucide-react";

export default function PaymentPortalPage() {
    return (
        <div className="p-4 md:p-6 lg:p-8">
            <Card className="bg-slate-800 border-slate-700 max-w-4xl mx-auto">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-slate-100">
                        <CreditCard className="w-5 h-5 text-indigo-500" />
                        Payment Portal
                    </CardTitle>
                    <CardDescription className="text-slate-400">
                        Connect your payment providers to manage payments,
                        subscriptions, and billing directly within the CRM.
                        Currently, Stripe is supported.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <StripeSettings />
                </CardContent>
            </Card>
        </div>
    );
}
