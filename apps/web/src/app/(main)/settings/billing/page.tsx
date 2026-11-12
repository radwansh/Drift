"use client";

import { useState } from "react";
import { ExternalLink } from "lucide-react";
import { Badge, Button, PageHeader, Panel, PanelBar, Stat } from "@/components/cv";
import { SettingsTabs } from "@/components/settings/settings-tabs";
import { BillingCard } from "@/components/settings/billing-card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/**
 * Settings · Plan and billing — board "Settings: plan and billing", screen 8 of
 * the Ink & Signal rebuild.
 *
 * What is on this page is what was on it: a fixture. The plan, the three usage
 * figures, the four invoices and the three plan prices are literals, and
 * "Manage subscription" waits 800ms and opens `billing.stripe.com` in a tab —
 * it never calls `settings.createBillingPortal`, which exists and would return
 * the session URL. Unchanged, deliberately.
 *
 * **The prices are printed exactly as this page has always printed them**, with
 * a dollar sign and no formatter. They are list prices typed into the file, not
 * payroll money, and the app's `USD 1,234.56` rule is about figures read from a
 * register. They do **not** agree with the website's pricing
 * (`components/marketing/content.ts`), which sells Starter, Growth, Business and
 * Enterprise at ¤59 / ¤99 / ¤299 with a 50% beta-founder discount and says
 * Clarivo is free during the beta. Reconciling the two is a product decision and
 * is reported rather than taken here.
 *
 * Two changes to the layout, both from the board. The plan grid is rendered
 * **once**: the old page put a full-width "Professional" card at the top and the
 * same card again in a sidebar, so the current plan appeared twice on one
 * screen, with two different buttons. And there is no payment-method panel,
 * because nothing on this page or in `settings.getBillingInfo` knows what the
 * payment method is, and a card ending in four invented digits is worse than an
 * absent panel.
 */

const invoiceHistory = [
  { id: "INV-001", date: "Jun 01, 2026", amount: "$299.00", status: "paid" },
  { id: "INV-002", date: "May 01, 2026", amount: "$299.00", status: "paid" },
  { id: "INV-003", date: "Apr 01, 2026", amount: "$299.00", status: "paid" },
  { id: "INV-004", date: "Mar 01, 2026", amount: "$199.00", status: "paid" },
];

const plans = [
  {
    name: "Starter",
    price: "$99",
    interval: "/month",
    description: "For small teams",
    features: [
      "10 comparisons/month",
      "Basic anomaly detection",
      "CSV & XLSX upload",
      "Email support",
    ],
    active: false,
  },
  {
    name: "Professional",
    price: "$299",
    interval: "/month",
    description: "For growing payroll teams",
    features: [
      "Unlimited comparisons",
      "AI-powered analysis",
      "Advanced anomaly detection",
      "Priority support",
      "Up to 1,000 employees per period",
    ],
    active: true,
  },
  {
    name: "Enterprise",
    price: "Custom",
    interval: "",
    description: "For large organizations",
    features: [
      "Unlimited everything",
      "Dedicated support",
      "Custom integrations",
      "SLA guarantee",
      "On-premise option",
    ],
    active: false,
  },
];

/** One source for the plan named at the top and the one outlined in the grid. */
const currentPlan = plans.find((plan) => plan.active) ?? plans[0]!;

export default function BillingPage() {
  const [loadingPortal, setLoadingPortal] = useState(false);

  const handleManageSubscription = async () => {
    setLoadingPortal(true);
    await new Promise((r) => setTimeout(r, 800));
    window.open("https://billing.stripe.com", "_blank");
    setLoadingPortal(false);
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Settings"
        title="Plan and billing"
        lede="The plan this company is on, what it has used this month, and every invoice so far."
      />

      <SettingsTabs />

      <Panel
        title={currentPlan.name}
        description={`${currentPlan.price}${currentPlan.interval}, billed to this company.`}
        actions={
          <Badge tone="success" icon="check">
            Active
          </Badge>
        }
      >
        <div className="flex flex-col gap-5">
          <div className="grid gap-4 sm:grid-cols-3">
            <Stat label="Active employees" value="16" caption="of 1,000 on this plan" />
            <Stat label="Comparisons this month" value="3" caption="Unlimited on this plan" />
            <Stat label="Next billing date" value="Jul 1" caption="2026" />
          </div>
          <div>
            <Button
              variant="secondary"
              icon={<ExternalLink aria-hidden="true" />}
              onClick={() => void handleManageSubscription()}
              disabled={loadingPortal}
              loading={loadingPortal}
            >
              {loadingPortal ? "Opening…" : "Manage subscription"}
            </Button>
          </div>
        </div>
      </Panel>

      <section aria-labelledby="plans-heading" className="flex flex-col gap-4">
        <div>
          <h2
            id="plans-heading"
            className="m-0 text-xl font-semibold leading-7 tracking-[-0.01em] text-cv-ink"
          >
            Plans
          </h2>
          <p className="m-0 mt-0.5 text-sm leading-5 text-cv-ink-subtle">
            The plan you are on is outlined.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {plans.map((plan) => (
            <BillingCard
              key={plan.name}
              name={plan.name}
              price={plan.price}
              interval={plan.interval}
              description={plan.description}
              features={plan.features}
              active={plan.active}
            />
          ))}
        </div>
      </section>

      <Panel flush>
        <PanelBar>
          <p className="m-0 text-[13px] leading-[18px] text-cv-ink-muted">
            Invoices · {invoiceHistory.length} on record
          </p>
        </PanelBar>
        <div className="overflow-x-auto">
          <Table className="min-w-[560px]">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Invoice</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoiceHistory.map((inv) => (
                <TableRow key={inv.id}>
                  <TableCell className="font-cv-mono text-[13px] text-cv-ink">{inv.id}</TableCell>
                  <TableCell className="text-cv-ink-muted">{inv.date}</TableCell>
                  <TableCell className="cv-num text-right">{inv.amount}</TableCell>
                  <TableCell>
                    <Badge tone="success" icon="check">
                      Paid
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Panel>
    </div>
  );
}
