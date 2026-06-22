import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";

interface BillingCardProps {
  name: string;
  price: string;
  interval: string;
  description: string;
  features: string[];
  active?: boolean;
}

export function BillingCard({ name, price, interval, description, features, active }: BillingCardProps) {
  return (
    <Card className={active ? "border-primary ring-1 ring-primary" : ""}>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-xl">{name}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
          {active && <Badge variant="default">Current Plan</Badge>}
        </div>
        <div className="mt-2">
          <span className="text-3xl font-bold">{price}</span>
          {interval && <span className="text-muted-foreground ml-1">{interval}</span>}
        </div>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2">
          {features.map((feature) => (
            <li key={feature} className="flex items-center gap-2 text-sm">
              <Check className="h-4 w-4 text-green-500 flex-shrink-0" />
              {feature}
            </li>
          ))}
        </ul>
      </CardContent>
      <CardFooter>
        <Button className="w-full" variant={active ? "outline" : "default"}>
          {active ? "Manage Plan" : name === "Enterprise" ? "Contact Sales" : "Upgrade"}
        </Button>
      </CardFooter>
    </Card>
  );
}
