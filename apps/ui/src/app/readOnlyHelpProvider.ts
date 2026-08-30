import { contextualHelpSuggestions, type ContextualHelpContext } from "./contextualHelp";
import {
  localizedScientificHelpTopic,
  type ScientificHelpTopicId,
} from "./scientificHelpGlossary";

export type ReadOnlyHelpRequest = Readonly<{
  locale: "ja" | "en";
  context: ContextualHelpContext;
  topicId?: ScientificHelpTopicId;
  question?: string;
}>;

export type ReadOnlyHelpResponse = Readonly<{
  providerId: string;
  advisory: true;
  answer: string;
  topicIds: readonly ScientificHelpTopicId[];
}>;

/** Provider-neutral boundary. Providers return explanation text only. */
export interface ReadOnlyHelpProvider {
  readonly id: string;
  readonly processing: "local" | "external";
  explain(request: ReadOnlyHelpRequest): Promise<ReadOnlyHelpResponse>;
}

export type ExternalHelpDisclosure = Readonly<{
  providerId: string;
  processing: "external";
  summary: string;
  rawMeasurementsIncluded: false;
  advisoryOnly: true;
}>;

export function externalHelpDisclosure(providerId: string): ExternalHelpDisclosure {
  return {
    providerId,
    processing: "external",
    summary:
      "選択した画面文脈を外部AIサービスへ送信します。rawデータは含めず、回答は説明のみです。統計結果はローカルで生成されます。",
    rawMeasurementsIncluded: false,
    advisoryOnly: true,
  };
}

export function helpProviderMayRun(
  provider: ReadOnlyHelpProvider,
  externalOptIn: boolean,
): boolean {
  return provider.processing === "local" || externalOptIn;
}

export function createReadOnlyHelpRequest(input: {
  context: ContextualHelpContext;
  locale?: "ja" | "en";
  topicId?: ScientificHelpTopicId;
  question?: string;
}): ReadOnlyHelpRequest {
  const { context } = input;
  const safeContext: ContextualHelpContext = {
    surface: context.surface,
    ...(context.readoutType ? { readoutType: context.readoutType.slice(0, 80) } : {}),
    ...(context.experimentalUnit
      ? { experimentalUnit: context.experimentalUnit.slice(0, 80) }
      : {}),
    ...(context.biologicalN !== undefined ? { biologicalN: context.biologicalN } : {}),
    ...(context.paired !== undefined ? { paired: context.paired } : {}),
    ...(context.nested !== undefined ? { nested: context.nested } : {}),
    ...(context.timeStructure ? { timeStructure: context.timeStructure } : {}),
    ...(context.selectedMethod ? { selectedMethod: context.selectedMethod.slice(0, 80) } : {}),
    ...(context.warningCode ? { warningCode: context.warningCode.slice(0, 120) } : {}),
    ...(context.transformation ? { transformation: context.transformation } : {}),
  };
  return {
    locale: input.locale ?? "ja",
    context: safeContext,
    ...(input.topicId ? { topicId: input.topicId } : {}),
    ...(input.question?.trim() ? { question: input.question.trim().slice(0, 500) } : {}),
  };
}

export const deterministicHelpProvider: ReadOnlyHelpProvider = {
  id: "local-deterministic",
  processing: "local",
  async explain(request) {
    const topicIds = request.topicId
      ? [request.topicId]
      : contextualHelpSuggestions(request.context).map(({ topic }) => topic.id);
    const topics = topicIds.map((id) => localizedScientificHelpTopic(id, request.locale));
    const answer = topics
      .map(
        (topic) =>
          request.locale === "ja"
            ? `${topic.title}：${topic.summary}${topic.limitation ? ` 注意：${topic.limitation}` : ""}`
            : `${topic.title}: ${topic.summary}${topic.limitation ? ` Caution: ${topic.limitation}` : ""}`,
      )
      .join("\n\n");
    return {
      providerId: deterministicHelpProvider.id,
      advisory: true,
      answer,
      topicIds,
    };
  },
};
