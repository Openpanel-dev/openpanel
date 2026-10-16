import { Link } from 'react-router-dom';
import type { CartItem } from '../types';

type Props = {
  cart: CartItem[];
  onPay: (succeed: boolean) => void;
};

export function CheckoutPage({ cart, onPay }: Props) {
  const total = cart.reduce((sum, i) => sum + i.price * i.qty, 0);

  return (
    <div>
      <div className="page-title">Checkout</div>
      <div className="checkout-form">
        <div className="form-group">
          <label className="form-label" htmlFor="card">
            Card number
          </label>
          <input defaultValue="4242 4242 4242 4242" id="card" readOnly />
        </div>
        <div
          style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}
        >
          <div className="form-group">
            <label className="form-label" htmlFor="expiry">
              Expiry
            </label>
            <input defaultValue="12/28" id="expiry" readOnly />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="cvc">
              CVC
            </label>
            <input defaultValue="123" id="cvc" readOnly />
          </div>
        </div>
        <div className="checkout-total">Total: ${total}</div>
        <div className="checkout-pay-buttons">
          <Link to="/cart">
            <button type="button">← Back</button>
          </Link>
          <button className="primary" onClick={() => onPay(true)} type="button">
            Pay ${total} (success)
          </button>
          <button className="danger" onClick={() => onPay(false)} type="button">
            Pay ${total} (fail)
          </button>
        </div>
      </div>
    </div>
  );
}
