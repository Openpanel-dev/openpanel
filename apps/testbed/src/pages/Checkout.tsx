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
          <label className="form-label" htmlFor="card">Card number</label>
          <input id="card" defaultValue="4242 4242 4242 4242" readOnly />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div className="form-group">
            <label className="form-label" htmlFor="expiry">Expiry</label>
            <input id="expiry" defaultValue="12/28" readOnly />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="cvc">CVC</label>
            <input id="cvc" defaultValue="123" readOnly />
          </div>
        </div>
        <div className="checkout-total">Total: ${total}</div>
        <div className="checkout-pay-buttons">
          <Link to="/cart"><button type="button">← Back</button></Link>
          <button type="button" className="primary" onClick={() => onPay(true)}>
            Pay ${total} (success)
          </button>
          <button type="button" className="danger" onClick={() => onPay(false)}>
            Pay ${total} (fail)
          </button>
        </div>
      </div>
    </div>
  );
}
