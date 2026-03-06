import { Link } from 'react-router-dom';
import type { CartItem } from '../types';

type Props = {
  cart: CartItem[];
  onRemove: (id: string) => void;
  onCheckout: () => void;
};

export function CartPage({ cart, onRemove, onCheckout }: Props) {
  const total = cart.reduce((sum, i) => sum + i.price * i.qty, 0);

  if (cart.length === 0) {
    return (
      <div>
        <div className="page-title">Cart</div>
        <div className="cart-empty">Your cart is empty.</div>
        <Link to="/"><button type="button">← Back to shop</button></Link>
      </div>
    );
  }

  return (
    <div>
      <div className="page-title">Cart</div>
      <table className="cart-table">
        <thead>
          <tr>
            <th>Product</th>
            <th>Price</th>
            <th>Qty</th>
            <th>Subtotal</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {cart.map((item) => (
            <tr key={item.id}>
              <td>{item.name}</td>
              <td>${item.price}</td>
              <td>{item.qty}</td>
              <td>${item.price * item.qty}</td>
              <td>
                <button type="button" className="danger" onClick={() => onRemove(item.id)}>
                  Remove
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="cart-summary">
        <div className="cart-total">Total: ${total}</div>
        <div className="cart-actions">
          <Link to="/"><button type="button">← Shop</button></Link>
          <button type="button" className="primary" onClick={onCheckout}>
            Checkout →
          </button>
        </div>
      </div>
    </div>
  );
}
