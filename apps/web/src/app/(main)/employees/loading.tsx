import { PageLoading } from "@/components/shared/loading-spinner";

/**
 * Loading is the scanning drift strip, not a spinner (canvas board "Patterns").
 * The label is the one this file already carried, unchanged.
 */
export default function EmployeesLoading() {
  return <PageLoading label="Loading employees" />;
}
