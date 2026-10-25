"use client";

import { useState, useCallback } from "react";
import { generateNarrative, answerQuestion } from "@saas/ai";
import type { AiNarrative, AiQueryResponse } from "@saas/types";
import type { AggregatedSummary } from "@saas/payroll-core";

export function useAiNarrative(comparisonId?: string) {
  const [narrative, setNarrative] = useState<AiNarrative | null>(null);
  const [isThinking, setIsThinking] = useState(false);

  const fetchNarrative = useCallback(
    async (
      summary: AggregatedSummary,
      companyName?: string,
      currentPeriod?: string,
      previousPeriod?: string,
      // Step 8b. Required by `generateNarrative`; the fallback is explicit here
      // rather than hidden in the formatter, so a caller that has the company
      // currency can pass it and one that does not can see what it is settling
      // for.
      currency = "USD",
    ) => {
      setIsThinking(true);
      try {
        const result = await generateNarrative(
          summary,
          companyName ?? "Your Company",
          currentPeriod ?? "Current Period",
          previousPeriod ?? "Previous Period",
          currency,
        );
        setNarrative(result);
        return result;
      } finally {
        setIsThinking(false);
      }
    },
    [],
  );

  return {
    narrative,
    fetchNarrative,
    isThinking,
  };
}

export function useAiQuery() {
  const [response, setResponse] = useState<AiQueryResponse | null>(null);
  const [isThinking, setIsThinking] = useState(false);

  const askQuestion = useCallback(async (question: string, comparisonRun?: any) => {
    setIsThinking(true);
    try {
      const result = await answerQuestion(question, comparisonRun);
      setResponse(result);
      return result;
    } finally {
      setIsThinking(false);
    }
  }, []);

  return {
    response,
    askQuestion,
    isThinking,
  };
}
