import { describe, expect, it } from "vitest";
import { validateCourseInput, validateLessonInput } from "@/lib/validation";

describe("validateCourseInput", () => {
  it("trims course fields before saving", () => {
    expect(
      validateCourseInput({ title: "  Biology  ", subject: " Science ", description: "  Cells  " }),
    ).toEqual({
      ok: true,
      value: { title: "Biology", subject: "Science", description: "Cells" },
    });
  });

  it("rejects a missing title", () => {
    expect(validateCourseInput({ title: " ", subject: "Science", description: "Cells" })).toEqual({
      ok: false,
      error: "Add a course title (2–80 characters).",
    });
  });

  it("rejects text that exceeds the field limit", () => {
    expect(validateCourseInput({ title: "A".repeat(81), subject: "Science", description: "" })).toEqual({
      ok: false,
      error: "Add a course title (2–80 characters).",
    });
  });
});

describe("validateLessonInput", () => {
  it("requires a title and useful lesson content", () => {
    expect(validateLessonInput({ title: "Lesson 1", content: "  " })).toEqual({
      ok: false,
      error: "Add a title and lesson content (at least 10 characters).",
    });
  });

  it("normalizes valid lesson content", () => {
    expect(validateLessonInput({ title: "  Cells  ", content: "  Explore cell structures.  " })).toEqual({
      ok: true,
      value: { title: "Cells", content: "Explore cell structures." },
    });
  });
});
