import { expect } from "vitest";

const JAPANESE_SCRIPT = /[ぁ-んァ-ヶ一-龯]/u;

export function expectNoJapaneseUi(container: HTMLElement): void {
  const attributes = [...container.querySelectorAll<HTMLElement>("*")].flatMap((element) =>
    ["aria-label", "aria-description", "title", "placeholder", "alt"]
      .map((name) => element.getAttribute(name))
      .filter((value): value is string => Boolean(value)),
  );
  const editableValues = [
    ...container.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
      "input:not([type='hidden']), textarea",
    ),
  ].map(({ value }) => value);
  const renderedCopy = [container.textContent ?? "", ...attributes, ...editableValues].join("\n");
  expect(renderedCopy).not.toMatch(JAPANESE_SCRIPT);
}
