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
          <div className="product-card" key={product.id}>
            <div className="product-card-category">{product.category}</div>
            <Link className="product-card-name" to={`/product/${product.id}`}>
              {product.name}
            </Link>
            <div className="product-card-price">${product.price}</div>
            <div className="product-card-actions">
              <button
                className="primary"
                onClick={() => onAddToCart(product)}
                style={{ width: '100%' }}
                type="button"
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
