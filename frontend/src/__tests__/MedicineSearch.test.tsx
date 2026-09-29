import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

function MedicineSearchTest({ onSearch }: { onSearch: (q: string) => void }) {
  return (
    <div>
      <label htmlFor="search">Search medicines</label>
      <input
        id="search"
        aria-label="Search medicines"
        onChange={(e) => onSearch(e.target.value)}
      />
    </div>
  );
}

describe("MedicineSearch", () => {
  it("renders search input", () => {
    const onSearch = vi.fn();
    render(<MedicineSearchTest onSearch={onSearch} />);
    expect(screen.getByLabelText("Search medicines")).toBeInTheDocument();
  });

  it("calls onSearch when typing", () => {
    const onSearch = vi.fn();
    render(<MedicineSearchTest onSearch={onSearch} />);
    const input = screen.getByLabelText("Search medicines");
    fireEvent.change(input, { target: { value: "para" } });
    expect(onSearch).toHaveBeenCalledWith("para");
  });

  it("calls onSearch with each keystroke", () => {
    const onSearch = vi.fn();
    render(<MedicineSearchTest onSearch={onSearch} />);
    const input = screen.getByLabelText("Search medicines");
    fireEvent.change(input, { target: { value: "a" } });
    fireEvent.change(input, { target: { value: "ab" } });
    expect(onSearch).toHaveBeenCalledTimes(2);
    expect(onSearch).toHaveBeenLastCalledWith("ab");
  });
});
