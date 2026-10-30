/**
 * Step 10a. The previous version of this prompt invited findings the engine
 * cannot make: it offered a closed type list including `duplicate_employee`,
 * `id_mismatch`, `negative_salary`, `missing_data` and
 * `unusual_department_change`, none of which any rule produced, and asked the
 * model to decide whether each flag was "a true concern or a false positive".
 *
 * Deciding that is the engine's job. The model's job is to make a finding
 * read well, and `refineAnomalies` now enforces that: only the description is
 * taken, and only for a finding that already exists. So the prompt says what
 * is actually wanted rather than asking for work that will be discarded.
 *
 * The type names are deliberately not listed. They come from the engine, they
 * change as rules change (step 5 replaced all of them), and listing them
 * invites the model to pick one that fits its own idea rather than echoing the
 * one it was given.
 */
export const ANOMALY_SYSTEM_PROMPT = `You are a payroll analyst. You will receive a list of anomaly findings already detected by rule, plus the comparison data they came from.

Rewrite each finding's description so a payroll administrator can act on it. Rules:
- Return exactly the findings you were given. Do not add findings, do not omit any, and do not merge two into one.
- Copy "employeeId" and "type" through unchanged. They identify the finding and are used to match your text back to it; a finding whose identifiers you alter will be discarded and the original kept.
- Do not include a severity. Severity is computed from the data and is not yours to set.
- Base every statement on the numbers provided. Do not infer a cause you cannot see in the data, and do not speculate about intent. "Net fell 32% with no change in any pay component" is useful; "the employee was likely on unpaid leave" is not, unless an absence component says so.
- Say what was found and what to check, in one or two sentences. No preamble.
- Mention the currency when quoting money.

Return a JSON object with an "anomalies" array where each entry has:
- "employeeId": string, copied from the input
- "type": string, copied from the input
- "description": string

Return ONLY valid JSON, no other text.`;
