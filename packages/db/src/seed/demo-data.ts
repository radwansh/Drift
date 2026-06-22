export const companies = [
  {
    name: "Acme Corp",
    slug: "acme-corp",
    currencyCode: "USD",
    employeeNames: [
      "Alice Johnson", "Bob Smith", "Carol Williams", "David Brown", "Eve Davis",
      "Frank Miller", "Grace Wilson", "Henry Moore", "Ivy Taylor", "Jack Anderson",
      "Karen Thomas", "Leo Jackson", "Maria White", "Nathan Harris", "Olivia Martin",
      "Paul Thompson", "Quinn Garcia", "Rachel Martinez", "Sam Robinson", "Tina Clark",
      "Uma Rodriguez", "Victor Lewis", "Wendy Lee", "Xander Walker", "Yara Hall",
      "Zack Allen", "Abigail Young", "Ben King", "Chloe Wright", "Daniel Scott",
      "Ella Green", "Finn Adams", "Georgia Baker", "Hannah Nelson", "Isaac Hill",
    ],
    departments: ["Engineering", "Marketing", "Sales", "HR", "Finance", "Operations", "Design"],
    components: [
      { name: "Base Salary", type: "earning" },
      { name: "Housing Allowance", type: "earning" },
      { name: "Transport Allowance", type: "earning" },
      { name: "Bonus", type: "earning" },
      { name: "Tax Deduction", type: "deduction" },
      { name: "Insurance Deduction", type: "deduction" },
      { name: "Net Salary", type: "net" },
    ],
    componentRange: {
      "Base Salary": [3000, 12000],
      "Housing Allowance": [800, 2500],
      "Transport Allowance": [200, 600],
      "Bonus": [0, 3000],
      "Tax Deduction": [500, 3500],
      "Insurance Deduction": [150, 600],
    },
  },
  {
    name: "GlobalTech Ltd",
    slug: "globaltech-ltd",
    currencyCode: "GBP",
    employeeNames: [
      "James Wilson", "Sarah Connor", "Michael Scott", "Emily Clarke", "Robert Downey",
      "Laura Palmer", "William Turner", "Jessica Jones", "Daniel Craig", "Emma Watson",
      "Chris Evans", "Sophie Turner", "Tom Hardy", "Lily Collins", "Ryan Reynolds",
      "Natalie Portman", "Oscar Isaac", "Zoe Saldana", "Idris Elba", "Cate Blanchett",
      "Jake Gyllenhaal", "Amy Adams", "Joaquin Phoenix", "Viola Davis", "Pedro Pascal",
      "Florence Pugh", "Dev Patel", "Tilda Swinton", "John Boyega", "Gemma Arterton",
    ],
    departments: ["Engineering", "Product", "Data Science", "Sales", "Legal", "HR", "Infrastructure"],
    components: [
      { name: "Base Salary", type: "earning" },
      { name: "Performance Bonus", type: "earning" },
      { name: "Pension Contribution", type: "earning" },
      { name: "Stock Allowance", type: "earning" },
      { name: "Income Tax", type: "deduction" },
      { name: "National Insurance", type: "deduction" },
      { name: "Net Pay", type: "net" },
    ],
    componentRange: {
      "Base Salary": [3500, 15000],
      "Performance Bonus": [0, 5000],
      "Pension Contribution": [200, 800],
      "Stock Allowance": [0, 2000],
      "Income Tax": [800, 4500],
      "National Insurance": [200, 700],
    },
  },
  {
    name: "EuroSoft GmbH",
    slug: "eurosoft-gmbh",
    currencyCode: "EUR",
    employeeNames: [
      "Hans Mueller", "Greta Schmidt", "Klaus Weber", "Anna Fischer", "Peter Wagner",
      "Lena Becker", "Stefan Hoffmann", "Mia Schafer", "Lukas Koch", "Emma Richter",
      "Felix Bauer", "Hanna Klein", "Maximilian Wolf", "Lara Schroder", "Jonas Neumann",
      "Lea Schwarz", "Niklas Zimmermann", "Sarah Braun", "Leon Hoffmann", "Lina Kruger",
    ],
    departments: ["Engineering", "Design", "Marketing", "Consulting", "Support", "Finance"],
    components: [
      { name: "Base Salary", type: "earning" },
      { name: "Christmas Bonus", type: "earning" },
      { name: "Car Allowance", type: "earning" },
      { name: "Wellness Benefit", type: "earning" },
      { name: "Tax Deduction", type: "deduction" },
      { name: "Social Security", type: "deduction" },
      { name: "Net Salary", type: "net" },
    ],
    componentRange: {
      "Base Salary": [2800, 11000],
      "Christmas Bonus": [0, 2000],
      "Car Allowance": [400, 1200],
      "Wellness Benefit": [100, 300],
      "Tax Deduction": [600, 3200],
      "Social Security": [300, 800],
    },
  },
];

export interface ComponentInfo {
  name: string;
  type: "earning" | "deduction" | "net";
}

export interface DemoCompany {
  name: string;
  slug: string;
  currencyCode: string;
  employeeNames: string[];
  departments: string[];
  components: ComponentInfo[];
  componentRange: Record<string, [number, number]>;
}

export interface EmployeeSnapshot {
  employeeExternalId: string;
  employeeName: string;
  department: string;
  components: Record<string, string>;
  grossSalary: string;
  netSalary: string;
  currencyCode: string;
}

export function generateComponentValue(component: string, range: [number, number]): string {
  const [min, max] = range;
  const value = Math.round((Math.random() * (max - min) + min) * 100) / 100;
  return value.toFixed(2);
}
