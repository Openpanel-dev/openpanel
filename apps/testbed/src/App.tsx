import { useEffect, useState } from 'react';
import { Link, Route, Routes, useNavigate } from 'react-router-dom';
import { op } from './analytics';
import { CartPage } from './pages/Cart';
import { CheckoutPage } from './pages/Checkout';
import { LoginPage, PRESET_GROUPS } from './pages/Login';
import { ProductPage } from './pages/Product';
import { ShopPage } from './pages/Shop';
import type { CartItem, Product, User } from './types';

const PRODUCTS: Product[] = [
  { id: 'p1', name: 'Classic T-Shirt', price: 25, category: 'clothing' },
  { id: 'p2', name: 'Coffee Mug', price: 15, category: 'accessories' },
  { id: 'p3', name: 'Hoodie', price: 60, category: 'clothing' },
  { id: 'p4', name: 'Sticker Pack', price: 10, category: 'accessories' },
  { id: 'p5', name: 'Cap', price: 35, category: 'clothing' },
];

export default function App() {
  const navigate = useNavigate();
  const [cart, setCart] = useState<CartItem[]>([]);
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem('op_testbed_user');
    if (stored) {
      const u = JSON.parse(stored) as User;
      setUser(u);
      op.identify({
        profileId: u.id,
        firstName: u.firstName,
        lastName: u.lastName,
        email: u.email,
      });
      applyGroups(u);
    }
    op.ready();
  }, []);

  function applyGroups(u: User) {
    op.setGroups(u.groupIds);
    for (const id of u.groupIds) {
      const meta = PRESET_GROUPS.find((g) => g.id === id);
      console.log('meta', meta);
      if (meta) {
        op.setGroup(id, meta);
      }
    }
  }

  function login(u: User) {
    localStorage.setItem('op_testbed_user', JSON.stringify(u));
    setUser(u);
    op.identify({
      profileId: u.id,
      firstName: u.firstName,
      lastName: u.lastName,
      email: u.email,
    });
    applyGroups(u);
    op.track('user_login', { method: 'form', group_count: u.groupIds.length });
    navigate('/');
  }

  function logout() {
    localStorage.removeItem('op_testbed_user');
    op.clear();
    setUser(null);
  }

  function addToCart(product: Product) {
    setCart((prev) => {
      const existing = prev.find((i) => i.id === product.id);
      if (existing) {
        return prev.map((i) =>
          i.id === product.id ? { ...i, qty: i.qty + 1 } : i
        );
      }
      return [...prev, { ...product, qty: 1 }];
    });
    op.track('add_to_cart', {
      product_id: product.id,
      product_name: product.name,
      price: product.price,
      category: product.category,
    });
  }

  function removeFromCart(id: string) {
    const item = cart.find((i) => i.id === id);
    if (item) {
      op.track('remove_from_cart', {
        product_id: item.id,
        product_name: item.name,
      });
    }
    setCart((prev) => prev.filter((i) => i.id !== id));
  }

  function startCheckout() {
    const total = cart.reduce((sum, i) => sum + i.price * i.qty, 0);
    op.track('checkout_started', {
      total,
      item_count: cart.reduce((sum, i) => sum + i.qty, 0),
      items: cart.map((i) => i.id),
    });
    navigate('/checkout');
  }

  function pay(succeed: boolean) {
    const total = cart.reduce((sum, i) => sum + i.price * i.qty, 0);
    op.track('payment_attempted', { total, success: succeed });

    if (succeed) {
      op.revenue(total, {
        items: cart.map((i) => i.id),
        item_count: cart.reduce((sum, i) => sum + i.qty, 0),
      });
      op.track('purchase_completed', { total });
      setCart([]);
      navigate('/success');
    } else {
      op.track('purchase_failed', { total, reason: 'declined' });
      navigate('/error');
    }
  }

  const cartCount = cart.reduce((sum, i) => sum + i.qty, 0);

  return (
    <div className="app">
      <nav className="nav">
        <Link className="nav-brand" to="/">
          TESTSTORE
        </Link>
        <div className="nav-links">
          <Link to="/">Shop</Link>
          <Link to="/cart">Cart ({cartCount})</Link>
          {user ? (
            <>
              <span className="nav-user">{user.firstName}</span>
              <button onClick={logout} type="button">
                Logout
              </button>
            </>
          ) : (
            <Link to="/login">Login</Link>
          )}
        </div>
      </nav>

      <main className="main">
        <Routes>
          <Route
            element={<ShopPage onAddToCart={addToCart} products={PRODUCTS} />}
            path="/"
          />
          <Route
            element={
              <ProductPage onAddToCart={addToCart} products={PRODUCTS} />
            }
            path="/product/:id"
          />
          <Route element={<LoginPage onLogin={login} />} path="/login" />
          <Route
            element={
              <CartPage
                cart={cart}
                onCheckout={startCheckout}
                onRemove={removeFromCart}
              />
            }
            path="/cart"
          />
          <Route
            element={<CheckoutPage cart={cart} onPay={pay} />}
            path="/checkout"
          />
          <Route
            element={
              <div className="result-page">
                <div className="result-icon">[OK]</div>
                <div className="result-title">Payment successful</div>
                <p>Your order has been placed. Thanks for testing!</p>
                <div className="result-actions">
                  <Link to="/">
                    <button className="primary" type="button">
                      Continue shopping
                    </button>
                  </Link>
                </div>
              </div>
            }
            path="/success"
          />
          <Route
            element={
              <div className="result-page">
                <div className="result-icon">[ERR]</div>
                <div className="result-title">Payment failed</div>
                <p>Card declined. Try again or go back to cart.</p>
                <div className="result-actions">
                  <Link to="/checkout">
                    <button type="button">Retry</button>
                  </Link>
                  <Link to="/cart">
                    <button type="button">Back to cart</button>
                  </Link>
                </div>
              </div>
            }
            path="/error"
          />
        </Routes>
      </main>
    </div>
  );
}
