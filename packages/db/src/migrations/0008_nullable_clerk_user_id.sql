-- Finding 4c: an invited user has no Clerk account yet, and that has to be
-- representable.
--
-- `auth.inviteUser` inserted `clerk_user_id = ''` against a UNIQUE column, so
-- the first invitation succeeded and every later one failed with 23505. NULL is
-- the correct value for "not linked to a Clerk account", and Postgres permits
-- any number of NULLs in a unique index, so the constraint keeps doing its real
-- job — one row per actual Clerk id — while invitations stop colliding.
--
-- Idempotent on purpose (see README.md): drizzle keys __drizzle_migrations on a
-- hash of this file's contents, so an edit makes it run again on production.
-- DROP NOT NULL is already a no-op when the column is nullable, and the UPDATE
-- matches nothing on a second pass.

ALTER TABLE "users" ALTER COLUMN "clerk_user_id" DROP NOT NULL;

UPDATE "users" SET "clerk_user_id" = NULL WHERE "clerk_user_id" = '';
