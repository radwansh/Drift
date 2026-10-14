-- Step 30 / finding B2: this migration was not idempotent. A second run failed
-- with 'relation "annual_budgets" already exists', so a retried deploy or a
-- re-pointed DATABASE_URL could not get through it.
--
-- Rewriting an applied migration is safe here *because* the new version is
-- idempotent. drizzle's migrator keys __drizzle_migrations on a hash of this
-- file's contents, so editing it makes the hash unknown and the migration is
-- applied again — on a database that already has these tables, every statement
-- below is now a no-op instead of an error.

CREATE TABLE IF NOT EXISTS "annual_budgets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"year" integer NOT NULL,
	"currency" varchar(3) NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "annual_budgets" ADD CONSTRAINT "annual_budgets_company_id_year_currency_unique" UNIQUE("company_id","year","currency");
EXCEPTION WHEN duplicate_table THEN NULL; WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "annual_insight_caches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"year" integer NOT NULL,
	"forecast_method" varchar(20) NOT NULL,
	"data_hash" varchar(64) NOT NULL,
	"bullets" jsonb NOT NULL,
	"model" varchar(100) DEFAULT '' NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "annual_insight_caches" ADD CONSTRAINT "annual_insight_caches_company_id_forecast_method_data_hash_unique" UNIQUE("company_id","forecast_method","data_hash");
EXCEPTION WHEN duplicate_table THEN NULL; WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "annual_budgets" ADD CONSTRAINT "annual_budgets_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "annual_insight_caches" ADD CONSTRAINT "annual_insight_caches_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
