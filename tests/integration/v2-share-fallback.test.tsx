// Day 11 share fallback sheet tests. The sheet renders when Web Share
// API is unavailable. We verify the WhatsApp, Email, and Save to Files
// buttons are present. The Instagram card is also present.

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ShareFallbackSheet } from "../../src/features/export/export-sheet/ShareFallbackSheet";

const blob = new Blob([new Uint8Array(4)], { type: "video/mp4" });

describe("ShareFallbackSheet", () => {
  it("renders when open", () => {
    render(
      <ShareFallbackSheet
        open={true}
        blob={blob}
        filename="test.mp4"
        subjectName="Mia"
        onClose={() => {}}
      />,
    );
    expect(screen.getByText(/Share on WhatsApp/i)).toBeInTheDocument();
    expect(screen.getByText(/Email to self/i)).toBeInTheDocument();
    expect(screen.getByText(/Save to Files/i)).toBeInTheDocument();
    // The Instagram card appears (it has a heading "Instagram").
    expect(screen.getByText("Instagram")).toBeInTheDocument();
  });

  it("does not render when closed", () => {
    const { container } = render(
      <ShareFallbackSheet
        open={false}
        blob={blob}
        filename="test.mp4"
        subjectName="Mia"
        onClose={() => {}}
      />,
    );
    expect(container.innerHTML).toBe("");
  });
});