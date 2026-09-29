import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

interface CartItem {
  id: string;
  name: string;
  quantity: number;
  price: number;
}

function CartTest({ items, onRemove }: { items: CartItem[]; onRemove: (id: string) => void }) {
  const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  return (
    <div>
      {items.length === 0 ? (
        <p>Your cart is empty</p>
      ) : (
        <>
          <ul>
            {items.map((item) => (
              <li key={item.id}>
                <span>{item.name}</span>
                <span> x{item.quantity}</span>
                <span> GH₵ {(item.price * item.quantity).toFixed(2)}</span>
                <button onClick={() => onRemove(item.id)}>Remove</button>
              </li>
            ))}
          </ul>
          <p>Total: GH₵ {total.toFixed(2)}</p>
        </>
      )}
    </div>
  );
}

const sampleItems: CartItem[] = [
  { id: "1", name: "Paracetamol", quantity: 2, price: 5 },
  { id: "2", name: "Ibuprofen", quantity: 1, price: 8 },
];

describe("Cart", () => {
  it("renders cart items", () => {
    const onRemove = vi.fn();
    render(<CartTest items={sampleItems} onRemove={onRemove} />);
    expect(screen.getByText("Paracetamol")).toBeInTheDocument();
    expect(screen.getByText("Ibuprofen")).toBeInTheDocument();
  });

  it("displays correct total", () => {
    const onRemove = vi.fn();
    render(<CartTest items={sampleItems} onRemove={onRemove} />);
    expect(screen.getByText("Total: GH₵ 18.00")).toBeInTheDocument();
  });

  it("removes item on button click", () => {
    const onRemove = vi.fn();
    render(<CartTest items={sampleItems} onRemove={onRemove} />);
    const removeButtons = screen.getAllByText("Remove");
    fireEvent.click(removeButtons[0]);
    expect(onRemove).toHaveBeenCalledWith("1");
  });

  it("shows empty message when no items", () => {
    const onRemove = vi.fn();
    render(<CartTest items={[]} onRemove={onRemove} />);
    expect(screen.getByText("Your cart is empty")).toBeInTheDocument();
  });
});
