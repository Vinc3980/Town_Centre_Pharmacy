import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Button } from "../components/ui";
import { Input } from "../components/ui";
import { Select } from "../components/ui";
import { Modal } from "../components/ui";
import { Badge } from "../components/ui";
import { Skeleton } from "../components/ui";
import { EmptyState } from "../components/ui";
import { ErrorState } from "../components/ui";

describe("UI Components", () => {
  describe("Button", () => {
    it("renders with text", () => {
      render(<Button>Click me</Button>);
      expect(screen.getByRole("button", { name: /click me/i })).toBeInTheDocument();
    });

    it("calls onClick", async () => {
      const onClick = vi.fn();
      const user = userEvent.setup();
      render(<Button onClick={onClick}>Click</Button>);
      await user.click(screen.getByRole("button"));
      expect(onClick).toHaveBeenCalled();
    });

    it("shows loading state (disabled)", () => {
      render(<Button loading>Loading</Button>);
      expect(screen.getByRole("button")).toBeDisabled();
    });

    it("is disabled when disabled prop", () => {
      render(<Button disabled>Disabled</Button>);
      expect(screen.getByRole("button")).toBeDisabled();
    });
  });

  describe("Input", () => {
    it("renders with label", () => {
      render(<Input label="Email" />);
      expect(screen.getByLabelText("Email")).toBeInTheDocument();
    });

    it("calls onChange", async () => {
      const onChange = vi.fn();
      const user = userEvent.setup();
      render(<Input label="Name" onChange={onChange} />);
      await user.type(screen.getByLabelText("Name"), "test");
      expect(onChange).toHaveBeenCalled();
    });

    it("shows error state", () => {
      render(<Input label="Email" error="Required" />);
      expect(screen.getByRole("alert")).toHaveTextContent("Required");
      expect(screen.getByLabelText("Email")).toHaveAttribute("aria-invalid", "true");
    });
  });

  describe("Select", () => {
    const options = [
      { value: "cash", label: "Cash" },
      { value: "card", label: "Card" },
    ];

    it("renders with options", () => {
      render(<Select label="Payment" options={options} />);
      expect(screen.getByLabelText("Payment")).toBeInTheDocument();
      expect(screen.getByText("Cash")).toBeInTheDocument();
      expect(screen.getByText("Card")).toBeInTheDocument();
    });

    it("renders with placeholder", () => {
      render(<Select label="Payment" options={options} placeholder="Select method" />);
      expect(screen.getByText("Select method")).toBeInTheDocument();
    });
  });

  describe("Modal", () => {
    it("renders when open", () => {
      render(
        <Modal open={true} onClose={() => {}} title="Test Modal">
          <p>Modal content</p>
        </Modal>
      );
      expect(screen.getByText("Modal content")).toBeInTheDocument();
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    it("does not render when closed", () => {
      render(
        <Modal open={false} onClose={() => {}}>
          <p>Hidden content</p>
        </Modal>
      );
      expect(screen.queryByText("Hidden content")).not.toBeInTheDocument();
    });

    it("calls onClose on backdrop click", async () => {
      const onClose = vi.fn();
      const user = userEvent.setup();
      render(
        <Modal open={true} onClose={onClose} title="Closeable">
          <p>Content</p>
        </Modal>
      );
      const backdrop = screen.getByRole("dialog");
      await user.click(backdrop);
      expect(onClose).toHaveBeenCalled();
    });
  });

  describe("Badge", () => {
    it("renders with variant", () => {
      render(<Badge variant="pine">Active</Badge>);
      expect(screen.getByText("Active")).toBeInTheDocument();
    });

    it("renders with default variant", () => {
      render(<Badge>Default</Badge>);
      expect(screen.getByText("Default")).toBeInTheDocument();
    });
  });

  describe("Skeleton", () => {
    it("renders single skeleton", () => {
      const { container } = render(<Skeleton className="h-4 w-20" />);
      expect(container.querySelectorAll("[aria-hidden='true']")).toHaveLength(1);
    });

    it("renders multiple skeletons", () => {
      const { container } = render(<Skeleton count={3} className="h-4" />);
      expect(container.querySelectorAll("[aria-hidden='true']")).toHaveLength(3);
    });
  });

  describe("EmptyState", () => {
    it("renders with title", () => {
      render(<EmptyState title="No results" />);
      expect(screen.getByText("No results")).toBeInTheDocument();
    });

    it("renders with description", () => {
      render(<EmptyState title="Empty" description="Nothing here" />);
      expect(screen.getByText("Nothing here")).toBeInTheDocument();
    });
  });

  describe("ErrorState", () => {
    it("renders with message", () => {
      render(<ErrorState message="Network error" />);
      expect(screen.getByText("Network error")).toBeInTheDocument();
    });

    it("renders retry button when onRetry provided", () => {
      const onRetry = vi.fn();
      render(<ErrorState message="Failed" onRetry={onRetry} />);
      expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
    });

    it("renders custom title", () => {
      render(<ErrorState title="Custom Title" message="Error" />);
      expect(screen.getByText("Custom Title")).toBeInTheDocument();
    });
  });
});
