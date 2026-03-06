import { Link } from 'react-router-dom';
import type { Product } from '../types';

type Props = {
  products: Product[];
  onAddToCart: (product: Product) => void;
};

export function ShopPage({ products, onAddToCart }: Props) {
  return (
    <div>
      <div className="page-title">Products</div>
      <div className="product-grid">
        {products.map((product) => (
          <div key={product.id} className="product-card">
            <div className="product-card-category">{product.category}</div>
            <Link to={`/product/${product.id}`} className="product-card-name">
              {product.name}
            </Link>
            <div className="product-card-price">${product.price}</div>
            <div className="product-card-actions">
              <button
                type="button"
                className="primary"
                style={{ width: '100%' }}
                onClick={() => onAddToCart(product)}
              >
                Add to cart
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
