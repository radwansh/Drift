"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { BillingCard } from "@/components/settings/billing-card";
import { ExternalLink, CreditCard, Users, BarChart3, Clock } from "lucide-react";

const invoiceHistory = [
  { id: "INV-001", date: "Jun 01, 2026", amount: "$299.00", status: "paid" },
  { id: "INV-002", date: "May 01, 2026", amount: "$299.00", status: "paid" },
  { id: "INV-003", date: "Apr 01, 2026", amount: "$299.00", status: "paid" },
  { id: "INV-004", date: "Mar 01, 2026", amount: "$199.00", status: "paid" },
];

export default function BillingPage() {
  const [loadingPortal, setLoadingPortal] = useState(false);

  const handleManageSubscription = async () => {
    setLoadingPortal(true);
    await new Promise((r) => setTimeout(r, 800));
    window.open("https://billing.stripe.com", "_blank");
    setLoadingPortal(false);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Billing & Subscription</h2>
        <p className="text-muted-foreground mt-1">Manage your plan, invoices, and payment methods</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <BillingCard
            name="Professional"
            price="$299"
            interval="/month"
            description="For growing payroll teams"
            features={[
              "Unlimited comparisons",
              "AI-powered analysis",
              "Advanced anomaly detection",
              "Priority support",
              "Up to 1,000 employees per period",
            ]}
            active
          />

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-muted-foreground" />
                Subscription
              </CardTitle>
              <CardDescription>
                <span className="flex items-center gap-2 mt-1">
                  Current status: <Badge variant="success">Active</Badge>
                </span>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="rounded-lg border p-4">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Users className="h-4 w-4" />
                    Active Employees
                  </div>
                  <p className="mt-1 text-2xl font-bold">16</p>
                  <p className="text-xs text-muted-foreground">of 1,000 limit</p>
                </div>
                <div className="rounded-lg border p-4">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <BarChart3 className="h-4 w-4" />
                    Comparisons This Month
                  </div>
                  <p className="mt-1 text-2xl font-bold">3</p>
                  <p className="text-xs text-muted-foreground">Unlimited</p>
                </div>
                <div className="rounded-lg border p-4">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Clock className="h-4 w-4" />
                    Next Billing Date
                  </div>
                  <p className="mt-1 text-2xl font-bold">Jul 1</p>
                  <p className="text-xs text-muted-foreground">2026</p>
                </div>
              </div>
              <Button variant="outline" onClick={handleManageSubscription} disabled={loadingPortal}>
                <ExternalLink className="h-4 w-4 mr-2" />
                {loadingPortal ? "Opening..." : "Manage Subscription"}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Invoice History</CardTitle>
              <CardDescription>Recent billing invoices</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoiceHistory.map((inv) => (
                    <TableRow key={inv.id}>
                      <TableCell className="font-medium">{inv.id}</TableCell>
                      <TableCell>{inv.date}</TableCell>
                      <TableCell>{inv.amount}</TableCell>
                      <TableCell>
                        <Badge variant="success" className="capitalize">{inv.status}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Pricing</CardTitle>
            <CardDescription>Compare our plans</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <BillingCard
              name="Starter"
              price="$99"
              interval="/month"
              description="For small teams"
              features={[
                "10 comparisons/month",
                "Basic anomaly detection",
                "CSV & XLSX upload",
                "Email support",
              ]}
            />
            <BillingCard
              name="Professional"
              price="$299"
              interval="/month"
              description="For growing teams"
              features={[
                "Unlimited comparisons",
                "AI-powered analysis",
                "Advanced anomaly detection",
                "Priority support",
              ]}
              active
            />
            <BillingCard
              name="Enterprise"
              price="Custom"
              interval=""
              description="For large organizations"
              features={[
                "Unlimited everything",
                "Dedicated support",
                "Custom integrations",
                "SLA guarantee",
                "On-premise option",
              ]}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
