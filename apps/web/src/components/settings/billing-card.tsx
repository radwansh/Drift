import { cn } from "@/lib/utils";
import { Badge, Button, Icon, Panel } from "@/components/cv";

/**
 * One plan, as board "Settings: plan and billing" draws it: a `Panel` with the
 * plan's name, who it is for, its price, what it includes, and one action.
 *
 * The current plan is marked by a `Badge` reading "Current plan" and an ink
 * ring, where it used to be a `border-primary ring-1 ring-primary` card with a
 * filled badge. The ring now names the token it wants (`ring-cv-ink`) instead
 * of inheriting whatever `--primary` happens to be, and the badge is neutral:
 * "this is your plan" is a fact about the account, not a status of the system,
 * so it takes no status colour.
 *
 * The tick beside a feature is a success tick: `text-cv-success-ink`, which is
 * the one legacy colour this file held (`text-green-500`). It is decorative
 * here — the feature's text is the content — so it is `aria-hidden`.
 *
 * **`price` and `interval` are printed exactly as the caller passes them.** The
 * strings on the billing page are `"$299"`, `"$99"` and `"Custom"`, and they
 * stay that way: they are plan list prices typed into the page, not money read
 * from a payroll file, and `formatCurrency` would turn "Custom" into nothing
 * and "$299" into a figure nobody has agreed. The app's money rule (USD 1,234.56
 * through a formatter) governs payroll figures; these are marketing copy that
 * happens to contain a number, and reconciling them with the pricing on the
 * website is a product decision, not a restyle.
 */

interface BillingCardProps {
  name: string;
  price: string;
  interval: string;
  description: string;
  features: string[];
  active?: boolean;
}

export function BillingCard({
  name,
  price,
  interval,
  description,
  features,
  active,
}: BillingCardProps) {
  return (
    <Panel
      // The three cards sit in one grid row, so their buttons line up: the
      // panel is a flex column, its body (the panel's own last child) grows,
      // and the action is pushed to the bottom of it.
      className={cn("flex flex-col [&>div:last-child]:flex-1", active && "ring-1 ring-cv-ink")}
      title={name}
      description={description}
      actions={active ? <Badge tone="neutral">Current plan</Badge> : undefined}
    >
      <div className="flex h-full flex-col gap-5">
        <p className="m-0 flex items-baseline gap-1">
          <span className="text-[28px] font-semibold leading-[34px] tracking-[-0.02em] text-cv-ink">
            {price}
          </span>
          {interval && <span className="text-sm leading-5 text-cv-ink-subtle">{interval}</span>}
        </p>

        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {features.map((feature) => (
            <li key={feature} className="flex items-start gap-2 text-sm leading-5 text-cv-ink">
              <Icon name="check" size={16} className="mt-0.5 flex-none text-cv-success-ink" />
              {feature}
            </li>
          ))}
        </ul>

        <div className="mt-auto pt-1">
          <Button className="w-full" variant={active ? "secondary" : "primary"}>
            {active ? "Manage plan" : name === "Enterprise" ? "Contact sales" : "Upgrade"}
          </Button>
        </div>
      </div>
    </Panel>
  );
}
